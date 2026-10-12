import { Hono } from 'hono';
import { newId, nextNumber, nowIso, audit, body } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { csvResponse } from '../lib/csv.js';

const r = new Hono();
r.use('*', authRequired);
r.use('*', requireRole('admin', 'agent')); // problem management is agent/admin territory

r.get('/export', async (c) => {
  const { status, priority } = c.req.query();
  let sql = 'SELECT p.*, a.name AS assignee_name FROM problems p LEFT JOIN users a ON a.id = p.assigned_to WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND p.status = ?'; p.push(status); }
  if (priority) { sql += ' AND p.priority = ?'; p.push(priority); }
  sql += ' ORDER BY p.created_at DESC';
  return csvResponse(c, 'problems.csv', await c.get('db').all(sql, ...p), [
    { key: 'number', label: 'Number' }, { key: 'title', label: 'Title' }, { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' }, { key: 'root_cause', label: 'Root Cause' }, { key: 'workaround', label: 'Workaround' },
    { key: 'assignee_name', label: 'Assigned To' }, { key: 'resolved_at', label: 'Resolved At' }, { key: 'created_at', label: 'Created At' },
  ]);
});

r.get('/', async (c) => {
  const { status, priority, assigned_to, q } = c.req.query();
  let sql = 'SELECT * FROM problems WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (priority) { sql += ' AND priority = ?'; p.push(priority); }
  if (assigned_to) { sql += ' AND assigned_to = ?'; p.push(assigned_to); }
  if (q) { sql += ' AND (title LIKE ? OR number LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC';
  return c.json(await c.get('db').all(sql, ...p));
});

r.get('/:id', async (c) => {
  const db = c.get('db');
  const problem = await db.get('SELECT * FROM problems WHERE id = ?', c.req.param('id'));
  if (!problem) return c.json({ error: 'Not found' }, 404);
  const linkedIncidents = await db.all(
    `SELECT i.* FROM incidents i JOIN problem_incidents pi ON pi.incident_id = i.id WHERE pi.problem_id = ?`, problem.id);
  const comments = await db.all('SELECT * FROM comments WHERE ticket_type = ? AND ticket_id = ? ORDER BY created_at', 'problem', problem.id);
  return c.json({ ...problem, linkedIncidents, comments });
});

r.post('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const b = await body(c);
  if (!b.title) return c.json({ error: 'title is required' }, 400);
  const id = newId();
  const number = await nextNumber(db, 'PRB', 'problems');
  const now = nowIso();
  const stmts = [[
    `INSERT INTO problems (id, number, title, description, priority, ci_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, number, b.title, b.description || null, b.priority || 'P3', b.ci_id || null, user.id, now, now,
  ]];
  if (Array.isArray(b.incident_ids)) {
    for (const incId of b.incident_ids) {
      stmts.push(['INSERT INTO problem_incidents (id, problem_id, incident_id) VALUES (?, ?, ?)', newId(), id, incId]);
      stmts.push(['UPDATE incidents SET problem_id = ? WHERE id = ?', id, incId]);
    }
  }
  await db.batch(stmts); // atomic: the problem and its incident links succeed or fail together
  await audit(db, 'problem', id, 'created', user.id, { number });
  return c.json(await db.get('SELECT * FROM problems WHERE id = ?', id), 201);
});

r.put('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const problem = await db.get('SELECT * FROM problems WHERE id = ?', id);
  if (!problem) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const updates = {};
  for (const f of ['title', 'description', 'priority', 'status', 'root_cause', 'workaround', 'assigned_to']) if (b[f] !== undefined) updates[f] = b[f];
  const now = nowIso();
  let resolvedAt = problem.resolved_at;
  if (updates.status === 'resolved' && !resolvedAt) resolvedAt = now;
  const m = { ...problem, ...updates };
  await db.run(
    `UPDATE problems SET title=?, description=?, priority=?, status=?, root_cause=?, workaround=?, assigned_to=?, resolved_at=?, updated_at=? WHERE id=?`,
    m.title, m.description, m.priority, m.status, m.root_cause, m.workaround, m.assigned_to, resolvedAt, now, id
  );
  await audit(db, 'problem', id, 'updated', c.get('user').id, updates);
  return c.json(await db.get('SELECT * FROM problems WHERE id = ?', id));
});

r.post('/:id/comments', async (c) => {
  const db = c.get('db');
  const problem = await db.get('SELECT * FROM problems WHERE id = ?', c.req.param('id'));
  if (!problem) return c.json({ error: 'Not found' }, 404);
  const { content, is_internal } = await body(c);
  if (!content) return c.json({ error: 'content is required' }, 400);
  const id = newId();
  await db.run(
    `INSERT INTO comments (id, ticket_type, ticket_id, user_id, content, is_internal, created_at) VALUES (?, 'problem', ?, ?, ?, ?, ?)`,
    id, problem.id, c.get('user').id, content, is_internal ? 1 : 0, nowIso()
  );
  return c.json(await db.get('SELECT * FROM comments WHERE id = ?', id), 201);
});

export default r;
