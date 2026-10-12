import { Hono } from 'hono';
import { newId, body } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';

const r = new Hono();
r.use('*', authRequired);

r.get('/', async (c) => c.json(await c.get('db').all('SELECT * FROM sla_policies ORDER BY applies_to, priority')));

r.post('/', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const b = await body(c);
  if (!b.name || !b.applies_to || !b.priority || !b.response_time_mins || !b.resolution_time_mins) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const id = newId();
  await db.run(
    `INSERT INTO sla_policies (id, name, applies_to, priority, response_time_mins, resolution_time_mins) VALUES (?, ?, ?, ?, ?, ?)`,
    id, b.name, b.applies_to, b.priority, b.response_time_mins, b.resolution_time_mins
  );
  return c.json(await db.get('SELECT * FROM sla_policies WHERE id = ?', id), 201);
});

r.put('/:id', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const p = await db.get('SELECT * FROM sla_policies WHERE id = ?', id);
  if (!p) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  await db.run('UPDATE sla_policies SET name=?, response_time_mins=?, resolution_time_mins=? WHERE id=?',
    b.name ?? p.name, b.response_time_mins ?? p.response_time_mins, b.resolution_time_mins ?? p.resolution_time_mins, id);
  return c.json(await db.get('SELECT * FROM sla_policies WHERE id = ?', id));
});

r.delete('/:id', requireRole('admin'), async (c) => {
  await c.get('db').run('DELETE FROM sla_policies WHERE id = ?', c.req.param('id'));
  return c.body(null, 204);
});

export default r;
