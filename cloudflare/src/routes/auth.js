import { Hono } from 'hono';
import { newId, nowIso, audit, body } from '../lib/helpers.js';
import { hashPassword, verifyPassword, signToken, authRequired, sanitize } from '../lib/auth.js';

const r = new Hono();

// First user ever registered becomes admin automatically.
r.post('/register', async (c) => {
  const db = c.get('db');
  const { name, email, password, department } = await body(c);
  if (!name || !email || !password) return c.json({ error: 'name, email and password are required' }, 400);
  const lower = String(email).toLowerCase();
  if (await db.get('SELECT id FROM users WHERE email = ?', lower)) return c.json({ error: 'Email already registered' }, 409);

  const count = (await db.get('SELECT COUNT(*) AS c FROM users')).c;
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
  const user = await db.get('SELECT * FROM users WHERE email = ?', String(email).toLowerCase());
  if (!user || !user.is_active) return c.json({ error: 'Invalid credentials' }, 401);
  if (!(await verifyPassword(password, user.password_hash))) return c.json({ error: 'Invalid credentials' }, 401);
  return c.json({ token: await signToken(c, user), user: sanitize(user) });
});

r.get('/me', authRequired, async (c) => {
  const user = await c.get('db').get('SELECT * FROM users WHERE id = ?', c.get('user').id);
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: sanitize(user) });
});

export default r;
