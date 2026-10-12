import { Hono } from 'hono';
import { newId, nowIso, audit, body } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { csvResponse } from '../lib/csv.js';
import { validate, ENUM, MAX, assigneeError, ciError } from '../lib/validate.js';

const r = new Hono();
r.use('*', authRequired);
r.use('*', requireRole('admin', 'agent')); // addresses, locations and dependencies — staff only

r.get('/export', requireRole('admin', 'agent'), async (c) => {
  const { ci_type, status } = c.req.query();
  let sql = 'SELECT ci.*, o.name AS owner_name FROM cmdb_items ci LEFT JOIN users o ON o.id = ci.owner_id WHERE 1=1';
  const p = [];
  if (ci_type) { sql += ' AND ci.ci_type = ?'; p.push(ci_type); }
  if (status) { sql += ' AND ci.status = ?'; p.push(status); }
  sql += ' ORDER BY ci.name';
  return csvResponse(c, 'cmdb_items.csv', await c.get('db').all(sql, ...p), [
    { key: 'name', label: 'Name' }, { key: 'ci_type', label: 'Type' }, { key: 'status', label: 'Status' },
    { key: 'environment', label: 'Environment' }, { key: 'owner_name', label: 'Owner' },
    { key: 'ip_address', label: 'IP Address' }, { key: 'location', label: 'Location' }, { key: 'created_at', label: 'Created At' },
  ]);
});

r.get('/', async (c) => {
  const { ci_type, status, q } = c.req.query();
  let sql = 'SELECT * FROM cmdb_items WHERE 1=1';
  const p = [];
  if (ci_type) { sql += ' AND ci_type = ?'; p.push(ci_type); }
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (q) { sql += ' AND name LIKE ?'; p.push(`%${q}%`); }
  sql += ' ORDER BY name';
  return c.json(await c.get('db').all(sql, ...p));
});

r.delete('/relationships/:relId', requireRole('admin', 'agent'), async (c) => {
  await c.get('db').run('DELETE FROM ci_relationships WHERE id = ?', c.req.param('relId'));
  return c.body(null, 204);
});

r.get('/:id', async (c) => {
  const db = c.get('db');
  const ci = await db.get('SELECT * FROM cmdb_items WHERE id = ?', c.req.param('id'));
  if (!ci) return c.json({ error: 'Not found' }, 404);
  const relationships = await db.all(
    `SELECT r.*, ch.name AS child_name, ch.ci_type AS child_type FROM ci_relationships r
     JOIN cmdb_items ch ON ch.id = r.child_ci_id WHERE r.parent_ci_id = ?`, ci.id);
  const relatedIncidents = await db.all('SELECT * FROM incidents WHERE ci_id = ? ORDER BY created_at DESC LIMIT 20', ci.id);
  return c.json({ ...ci, relationships, relatedIncidents });
});

r.post('/', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const b = await body(c);
  if (!b.name || !b.ci_type) return c.json({ error: 'name and ci_type are required' }, 400);
  const bad = validate(b, {
    name: { max: MAX.name }, ci_type: { oneOf: ENUM.ciType }, status: { oneOf: ENUM.ciStatus }, environment: { oneOf: ENUM.environment },
    owner_id: { max: MAX.id }, description: { max: MAX.text }, ip_address: { max: 64 }, location: { max: MAX.name },
  });
  if (bad) return c.json({ error: bad }, 400);
  const id = newId();
  const now = nowIso();
  await db.run(
    `INSERT INTO cmdb_items (id, name, ci_type, status, owner_id, environment, description, ip_address, location, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, b.name, b.ci_type, b.status || 'active', b.owner_id || null, b.environment || 'production',
    b.description || null, b.ip_address || null, b.location || null, now, now
  );
  await audit(db, 'cmdb_item', id, 'created', c.get('user').id, { name: b.name, ci_type: b.ci_type });
  return c.json(await db.get('SELECT * FROM cmdb_items WHERE id = ?', id), 201);
});

r.put('/:id', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const ci = await db.get('SELECT * FROM cmdb_items WHERE id = ?', id);
  if (!ci) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const bad = validate(b, {
    name: { max: MAX.name }, ci_type: { oneOf: ENUM.ciType }, status: { oneOf: ENUM.ciStatus }, environment: { oneOf: ENUM.environment },
    owner_id: { max: MAX.id }, description: { max: MAX.text }, ip_address: { max: 64 }, location: { max: MAX.name },
  });
  if (bad) return c.json({ error: bad }, 400);
  const updates = {};
  for (const f of ['name', 'ci_type', 'status', 'owner_id', 'environment', 'description', 'ip_address', 'location']) if (b[f] !== undefined) updates[f] = b[f];
  const m = { ...ci, ...updates };
  await db.run(
    `UPDATE cmdb_items SET name=?, ci_type=?, status=?, owner_id=?, environment=?, description=?, ip_address=?, location=?, updated_at=? WHERE id=?`,
    m.name, m.ci_type, m.status, m.owner_id, m.environment, m.description, m.ip_address, m.location, nowIso(), id
  );
  await audit(db, 'cmdb_item', id, 'updated', c.get('user').id, updates);
  return c.json(await db.get('SELECT * FROM cmdb_items WHERE id = ?', id));
});

r.delete('/:id', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  await db.batch([
    ['DELETE FROM ci_relationships WHERE parent_ci_id = ? OR child_ci_id = ?', id, id],
    ['DELETE FROM cmdb_items WHERE id = ?', id],
  ]);
  await audit(db, 'cmdb_item', id, 'deleted', c.get('user').id, {});
  return c.body(null, 204);
});

r.post('/:id/relationships', requireRole('admin', 'agent'), async (c) => {
  const { child_ci_id, relationship_type } = await body(c);
  if (!child_ci_id) return c.json({ error: 'child_ci_id is required' }, 400);
  const parentId = c.req.param('id');
  if (child_ci_id === parentId) return c.json({ error: 'An item cannot depend on itself' }, 400);
  const bad = validate({ relationship_type }, { relationship_type: { max: 50 } });
  if (bad) return c.json({ error: bad }, 400);
  const db = c.get('db');
  if (!(await db.get('SELECT id FROM cmdb_items WHERE id = ?', parentId)) || !(await db.get('SELECT id FROM cmdb_items WHERE id = ?', child_ci_id))) {
    return c.json({ error: 'Both configuration items must exist' }, 400);
  }
  const id = newId();
  const type = relationship_type || 'depends_on';
  await c.get('db').run(
    'INSERT INTO ci_relationships (id, parent_ci_id, child_ci_id, relationship_type) VALUES (?, ?, ?, ?)',
    id, c.req.param('id'), child_ci_id, type
  );
  return c.json({ id, parent_ci_id: c.req.param('id'), child_ci_id, relationship_type: type }, 201);
});

export default r;
