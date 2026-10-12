import { Hono } from 'hono';
import { newId, nextNumber, nowIso, getSla, addMinutesIso, audit, body, fire } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { csvResponse } from '../lib/csv.js';
import { makeNotifier } from '../lib/mail.js';

const r = new Hono();
r.use('*', authRequired);

// CSV export — registered before /:id so "export" isn't treated as an id
r.get('/export', requireRole('admin', 'agent'), async (c) => {
  const { status, priority } = c.req.query();
  let sql = `SELECT i.*, r.name AS requester_name, r.email AS requester_email, a.name AS assignee_name
             FROM incidents i LEFT JOIN users r ON r.id = i.requester_id LEFT JOIN users a ON a.id = i.assigned_to WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND i.status = ?'; p.push(status); }
  if (priority) { sql += ' AND i.priority = ?'; p.push(priority); }
  sql += ' ORDER BY i.created_at DESC';
  return csvResponse(c, 'incidents.csv', await c.get('db').all(sql, ...p), [
    { key: 'number', label: 'Number' }, { key: 'title', label: 'Title' }, { key: 'category', label: 'Category' },
    { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' },
    { key: 'requester_name', label: 'Requester' }, { key: 'requester_email', label: 'Requester Email' },
    { key: 'assignee_name', label: 'Assigned To' }, { key: 'sla_response_due', label: 'SLA Response Due' },
    { key: 'sla_resolution_due', label: 'SLA Resolution Due' }, { key: 'resolved_at', label: 'Resolved At' },
    { key: 'closed_at', label: 'Closed At' }, { key: 'created_at', label: 'Created At' }, { key: 'updated_at', label: 'Updated At' },
  ]);
});

r.get('/', async (c) => {
  const { status, priority, assigned_to, requester_id, q } = c.req.query();
  const user = c.get('user');
  let sql = 'SELECT * FROM incidents WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (priority) { sql += ' AND priority = ?'; p.push(priority); }
  if (assigned_to) { sql += ' AND assigned_to = ?'; p.push(assigned_to); }
  if (requester_id) { sql += ' AND requester_id = ?'; p.push(requester_id); }
  if (q) { sql += ' AND (title LIKE ? OR number LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  if (user.role === 'requester') { sql += ' AND requester_id = ?'; p.push(user.id); }
  sql += ' ORDER BY created_at DESC';
  return c.json(await c.get('db').all(sql, ...p));
});

r.get('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const inc = await db.get('SELECT * FROM incidents WHERE id = ?', c.req.param('id'));
  if (!inc) return c.json({ error: 'Not found' }, 404);
  if (user.role === 'requester' && inc.requester_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const comments = await db.all(
    'SELECT * FROM comments WHERE ticket_type = ? AND ticket_id = ? ORDER BY created_at', 'incident', inc.id
  );
  // Internal notes are for staff only — never return them to requesters.
  const visible = c.get('user').role === 'requester' ? comments.filter((x) => !x.is_internal) : comments;
  return c.json({ ...inc, comments: visible });
});

r.post('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const b = await body(c);
  if (!b.title) return c.json({ error: 'title is required' }, 400);
  const id = newId();
  const number = await nextNumber(db, 'INC', 'incidents');
  const prio = b.priority || 'P3';
  const sla = await getSla(db, 'incident', prio);
  const now = nowIso();
  await db.run(
    `INSERT INTO incidents (id, number, title, description, category, priority, status, impact, urgency,
       requester_id, assigned_to, ci_id, sla_response_due, sla_resolution_due, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, number, b.title, b.description || null, b.category || 'general', prio, b.impact || 'medium',
    b.urgency || 'medium', user.id, b.assigned_to || null, b.ci_id || null,
    addMinutesIso(sla.response), addMinutesIso(sla.resolution), now, now
  );
  await audit(db, 'incident', id, 'created', user.id, { number, priority: prio });
  fire(c, makeNotifier(c).ticketCreated({ to: user.email, name: user.name, ticketType: 'incident', number, title: b.title }));
  return c.json(await db.get('SELECT * FROM incidents WHERE id = ?', id), 201);
});

r.put('/:id', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const inc = await db.get('SELECT * FROM incidents WHERE id = ?', id);
  if (!inc) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const fields = ['title', 'description', 'category', 'priority', 'impact', 'urgency', 'assigned_to', 'ci_id', 'status'];
  const updates = {};
  for (const f of fields) if (b[f] !== undefined) updates[f] = b[f];

  const now = nowIso();
  let { responded_at, resolved_at, closed_at } = inc;
  if (updates.status && updates.status !== inc.status) {
    if (updates.status === 'in_progress' && !responded_at) responded_at = now;
    if (updates.status === 'resolved' && !resolved_at) resolved_at = now;
    if (updates.status === 'closed' && !closed_at) closed_at = now;
  }
  const m = { ...inc, ...updates };
  await db.run(
    `UPDATE incidents SET title=?, description=?, category=?, priority=?, impact=?, urgency=?, assigned_to=?, ci_id=?,
       status=?, responded_at=?, resolved_at=?, closed_at=?, updated_at=? WHERE id=?`,
    m.title, m.description, m.category, m.priority, m.impact, m.urgency, m.assigned_to, m.ci_id,
    m.status, responded_at, resolved_at, closed_at, now, id
  );
  await audit(db, 'incident', id, 'updated', user.id, updates);

  const n = makeNotifier(c);
  const requester = inc.requester_id ? await db.get('SELECT * FROM users WHERE id = ?', inc.requester_id) : null;
  if (updates.status && updates.status !== inc.status && requester) {
    fire(c, n.statusChanged({ to: requester.email, name: requester.name, ticketType: 'incident', number: inc.number, title: m.title, status: updates.status }));
  }
  if (updates.assigned_to && updates.assigned_to !== inc.assigned_to) {
    const a = await db.get('SELECT * FROM users WHERE id = ?', updates.assigned_to);
    if (a) fire(c, n.assigned({ to: a.email, name: a.name, ticketType: 'incident', number: inc.number, title: m.title }));
  }
  return c.json(await db.get('SELECT * FROM incidents WHERE id = ?', id));
});

r.post('/:id/comments', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const inc = await db.get('SELECT * FROM incidents WHERE id = ?', c.req.param('id'));
  if (!inc) return c.json({ error: 'Not found' }, 404);
  const { content, is_internal } = await body(c);
  if (!content) return c.json({ error: 'content is required' }, 400);
  if (is_internal && user.role === 'requester') return c.json({ error: 'Requesters cannot add internal notes' }, 403);
  const id = newId();
  await db.run(
    `INSERT INTO comments (id, ticket_type, ticket_id, user_id, content, is_internal, created_at) VALUES (?, 'incident', ?, ?, ?, ?, ?)`,
    id, inc.id, user.id, content, is_internal ? 1 : 0, nowIso()
  );
  if (!is_internal) {
    const n = makeNotifier(c);
    const target = user.id === inc.requester_id ? inc.assigned_to : inc.requester_id;
    if (target) {
      const t = await db.get('SELECT * FROM users WHERE id = ?', target);
      if (t) fire(c, n.commentAdded({ to: t.email, name: t.name, ticketType: 'incident', number: inc.number, title: inc.title, author: user.name }));
    }
  }
  return c.json(await db.get('SELECT * FROM comments WHERE id = ?', id), 201);
});

export default r;
