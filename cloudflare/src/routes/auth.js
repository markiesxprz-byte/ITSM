import { Hono } from 'hono';
import { newId, nowIso, audit, body } from '../lib/helpers.js';
import { hashPassword, verifyPassword, signToken, authRequired, sanitize } from '../lib/auth.js';
import { validate, ENUM, MAX } from '../lib/validate.js';
import { clientIp, throttleCheck, throttleHit, throttleClear, tooMany } from '../lib/throttle.js';

const r = new Hono();

async function registrationSettings(db) {
  const rows = await db.all("SELECT key, value FROM settings WHERE key IN ('registration_open', 'registration_domain')");
  const m = Object.fromEntries(rows.map((x) => [x.key, x.value]));
  return { open: m.registration_open === '1', domain: m.registration_domain || null };
}

// Public: lets the sign-in page know whether to offer "Create account".
r.get('/registration', async (c) => {
  const db = c.get('db');
  const count = (await db.get('SELECT COUNT(*) AS c FROM users')).c;
  const s = await registrationSettings(db);
  return c.json({ open: count === 0 || s.open, first_run: count === 0, domain: count === 0 ? null : s.domain });
});

// The first account ever registered becomes the administrator. After that, registration is
// CLOSED unless an administrator opens it (Administration → Users); otherwise anyone who finds
// the workspace URL could create an account on a customer's service desk.
r.post('/register', async (c) => {
  const db = c.get('db');
  const b = await body(c);
  const { name, email, password, department } = b;
  if (!name || !email || !password) return c.json({ error: 'name, email and password are required' }, 400);
  const bad = validate(b, {
    name: { max: MAX.name }, email: { email: true, max: 254 },
    password: { min: 8, max: 128 }, department: { max: MAX.name },
  });
  if (bad) return c.json({ error: bad }, 400);

  const ipKey = `register:${clientIp(c)}`;
  const t = await throttleCheck(db, ipKey, 10, 3600);
  if (t.blocked) return tooMany(c, t.retryAfter);
  await throttleHit(db, ipKey, 3600);

  const lower = String(email).toLowerCase();
  const count = (await db.get('SELECT COUNT(*) AS c FROM users')).c;
  if (count > 0) {
    const s = await registrationSettings(db);
    if (!s.open) return c.json({ error: 'Registration is closed. Ask your administrator to create an account for you.' }, 403);
    if (s.domain && !lower.endsWith('@' + s.domain)) return c.json({ error: `Registration is limited to @${s.domain} email addresses` }, 403);
  }
  if (await db.get('SELECT id FROM users WHERE email = ?', lower)) return c.json({ error: 'Email already registered' }, 409);

  const role = count === 0 ? 'admin' : 'requester';
  const id = newId();
  await db.run(
    `INSERT INTO users (id, name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, name, lower, await hashPassword(password), role, department || null, nowIso()
  );
  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  await audit(db, 'user', id, 'created', id, { self_registration: true, role });
  return c.json({ token: await signToken(c, user), user: sanitize(user) }, 201);
});

r.post('/login', async (c) => {
  const db = c.get('db');
  const { email, password } = await body(c);
  if (!email || !password) return c.json({ error: 'email and password required' }, 400);
  // Throttle before doing any expensive work. Keys include the IP so an attacker elsewhere
  // cannot lock a real user out of their own account.
  const lower = String(email).toLowerCase();
  const ip = clientIp(c);
  const kUser = `login:${ip}|${lower}`;
  const kIp = `loginip:${ip}`;
  for (const [key, limit] of [[kUser, 5], [kIp, 30]]) {
    const t = await throttleCheck(db, key, limit, 900);
    if (t.blocked) return tooMany(c, t.retryAfter);
  }
  const fail = async () => {
    await throttleHit(db, kUser, 900);
    await throttleHit(db, kIp, 900);
    return c.json({ error: 'Invalid credentials' }, 401);
  };
  const user = await db.get('SELECT * FROM users WHERE email = ?', lower);
  if (!user || !user.is_active) return fail();
  if (!(await verifyPassword(password, user.password_hash))) return fail();
  await throttleClear(db, kUser);
  return c.json({ token: await signToken(c, user), user: sanitize(user) });
});

// Signed-in users change their own password. Wrong "current password" guesses are throttled.
r.post('/change-password', authRequired, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { current_password, new_password } = await body(c);
  if (!current_password || !new_password) return c.json({ error: 'current_password and new_password are required' }, 400);
  const bad = validate({ new_password }, { new_password: { min: 8, max: 128 } });
  if (bad) return c.json({ error: bad }, 400);
  const key = `chgpw:${user.id}`;
  const t = await throttleCheck(db, key, 5, 900);
  if (t.blocked) return tooMany(c, t.retryAfter);
  const row = await db.get('SELECT password_hash FROM users WHERE id = ?', user.id);
  if (!(await verifyPassword(current_password, row.password_hash))) {
    await throttleHit(db, key, 900);
    // 400, not 401: the app treats 401 as "your session expired" and signs the user out.
    return c.json({ error: 'Current password is incorrect' }, 400);
  }
  await throttleClear(db, key);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(new_password), user.id);
  await audit(db, 'user', user.id, 'password_changed', user.id, {});
  return c.json({ updated: true });
});

r.get('/me', authRequired, async (c) => {
  const user = await c.get('db').get('SELECT * FROM users WHERE id = ?', c.get('user').id);
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: sanitize(user) });
});

export default r;
