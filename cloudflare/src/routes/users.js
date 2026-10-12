import { Hono } from 'hono';
import { newId, nowIso, audit, body } from '../lib/helpers.js';
import { hashPassword, authRequired, requireRole, sanitize } from '../lib/auth.js';

const r = new Hono();
r.use('*', authRequired);

r.get('/', async (c) => c.json((await c.get('db').all('SELECT * FROM users ORDER BY name')).map(sanitize)));

r.get('/:id', async (c) => {
  const u = await c.get('db').get('SELECT * FROM users WHERE id = ?', c.req.param('id'));
  return u ? c.json(sanitize(u)) : c.json({ error: 'Not found' }, 404);
});

r.post('/', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const { name, email, password, role, department } = await body(c);
  if (!name || !email || !password) return c.json({ error: 'Missing fields' }, 400);
  const lower = String(email).toLowerCase();
  if (await db.get('SELECT id FROM users WHERE email = ?', lower)) return c.json({ error: 'Email already registered' }, 409);
  const id = newId();
  await db.run(
    `INSERT INTO users (id, name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, name, lower, await hashPassword(password), role || 'requester', department || null, nowIso()
  );
  await audit(db, 'user', id, 'created_by_admin', c.get('user').id, { role });
  return c.json(sanitize(await db.get('SELECT * FROM users WHERE id = ?', id)), 201);
});

r.put('/:id', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  await db.run(
    'UPDATE users SET name = ?, role = ?, department = ?, is_active = ? WHERE id = ?',
    b.name ?? user.name, b.role ?? user.role, b.department ?? user.department,
    b.is_active === undefined ? user.is_active : b.is_active ? 1 : 0, id
  );
  await audit(db, 'user', id, 'updated', c.get('user').id, b);
  return c.json(sanitize(await db.get('SELECT * FROM users WHERE id = ?', id)));
});

export default r;
