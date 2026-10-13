import { Hono } from 'hono';
import { seatLimit } from '../lib/entitlement.js';
import { newId, nowIso, audit, body } from '../lib/helpers.js';
import { hashPassword, authRequired, requireRole, sanitize } from '../lib/auth.js';
import { validate, ENUM, MAX } from '../lib/validate.js';

const r = new Hono();
r.use('*', authRequired);

r.get('/', requireRole('admin', 'agent'), async (c) => c.json((await c.get('db').all('SELECT * FROM users ORDER BY name')).map(sanitize)));

r.get('/:id', requireRole('admin', 'agent'), async (c) => {
  const u = await c.get('db').get('SELECT * FROM users WHERE id = ?', c.req.param('id'));
  return u ? c.json(sanitize(u)) : c.json({ error: 'Not found' }, 404);
});

// When subscription enforcement is on, the number of billable people (agents and administrators) cannot exceed what is paid for.
async function seatError(db, env, becomesBillable) {
  if (!becomesBillable) return null;
  const limit = await seatLimit(db, env);
  if (limit === null) return null;
  const used = (await db.get("SELECT COUNT(*) AS c FROM users WHERE is_active = 1 AND role IN ('admin', 'agent')")).c;
  return used + 1 > limit
    ? `Your subscription covers ${limit} agent${limit === 1 ? '' : 's'}. To add more, cancel the subscription and subscribe again with the new number (Administration → Billing).`
    : null;
}

r.post('/', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const b = await body(c);
  const { name, email, password, role, department } = b;
  if (!name || !email || !password) return c.json({ error: 'Missing fields' }, 400);
  const bad = validate(b, {
    name: { max: MAX.name }, email: { email: true, max: 254 }, password: { min: 8, max: 128 },
    role: { oneOf: ENUM.role }, department: { max: MAX.name },
  });
  if (bad) return c.json({ error: bad }, 400);
  const lower = String(email).toLowerCase();
  if (await db.get('SELECT id FROM users WHERE email = ?', lower)) return c.json({ error: 'Email already registered' }, 409);
  const id = newId();
  const seatErr = await seatError(db, c.env, ['admin', 'agent'].includes(role || 'requester'));
  if (seatErr) return c.json({ error: seatErr, code: 'seat_limit' }, 402);
  await db.run(
    `INSERT INTO users (id, name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, name, lower, await hashPassword(password), role || 'requester', department || null, nowIso()
  );
  await audit(db, 'user', id, 'created_by_admin', c.get('user').id, { role });
  return c.json(sanitize(await db.get('SELECT * FROM users WHERE id = ?', id)), 201);
});

// Admin sets a new password for someone who is locked out (there is no email-based reset yet).
r.put('/:id/password', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const { password } = await body(c);
  const bad = validate({ password }, { password: { required: true, min: 8, max: 128 } });
  if (bad) return c.json({ error: bad }, 400);
  if (!(await db.get('SELECT id FROM users WHERE id = ?', id))) return c.json({ error: 'Not found' }, 404);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), id);
  await audit(db, 'user', id, 'password_reset_by_admin', c.get('user').id, {});
  return c.json({ updated: true });
});

r.put('/:id', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const bad = validate(b, { name: { max: MAX.name }, role: { oneOf: ENUM.role }, department: { max: MAX.name } });
  if (bad) return c.json({ error: bad }, 400);
  // Never allow the last active administrator to be demoted or deactivated (that locks everyone out).
  const newRole = b.role ?? user.role;
  const newActive = b.is_active === undefined ? user.is_active : b.is_active ? 1 : 0;
  if (user.role === 'admin' && user.is_active && (newRole !== 'admin' || !newActive)) {
    const admins = (await db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1")).c;
    if (admins <= 1) return c.json({ error: 'At least one active administrator is required' }, 400);
  }
  const wasBillable = user.is_active && ['admin', 'agent'].includes(user.role);
  const seatErr = await seatError(db, c.env, !wasBillable && newActive && ['admin', 'agent'].includes(newRole));
  if (seatErr) return c.json({ error: seatErr, code: 'seat_limit' }, 402);
  await db.run(
    'UPDATE users SET name = ?, role = ?, department = ?, is_active = ? WHERE id = ?',
    b.name ?? user.name, b.role ?? user.role, b.department ?? user.department,
    b.is_active === undefined ? user.is_active : b.is_active ? 1 : 0, id
  );
  await audit(db, 'user', id, 'updated', c.get('user').id, b);
  return c.json(sanitize(await db.get('SELECT * FROM users WHERE id = ?', id)));
});

export default r;
