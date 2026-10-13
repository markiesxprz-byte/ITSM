import { Hono } from 'hono';
import { newId, nextNumber, nowIso, audit, body, fire } from '../lib/helpers.js';
import { loadSlaConfig, slaForNewTicket, slaOnUpdate, withSla, forRequester, forUser, INCIDENT_DONE } from '../lib/slaengine.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { csvResponse } from '../lib/csv.js';
import { makeNotifier } from '../lib/mail.js';
import { validate, ENUM, MAX, assigneeError, ciError } from '../lib/validate.js';

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
  const rows = await c.get('db').all(sql, ...p);
  if (user.role === 'requester') return c.json(rows.map(forRequester)); // SLA state and bookkeeping are internal
  const cfg = await loadSlaConfig(c.get('db')), nowMs = Date.now();
  return c.json(rows.map((row) => withSla(row, nowMs, cfg, INCIDENT_DONE)));
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
  const out = { ...forUser(inc, user), comments: visible };
  if (user.role !== 'requester') out.sla = withSla(inc, Date.now(), await loadSlaConfig(db), INCIDENT_DONE).sla;
  return c.json(out);
});

r.post('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const b = await body(c);
  if (!b.title) return c.json({ error: 'title is required' }, 400);
  const bad = validate(b, {
    title: { max: MAX.name }, description: { max: MAX.text }, category: { max: MAX.short },
    priority: { oneOf: ENUM.priority }, impact: { oneOf: ENUM.level }, urgency: { oneOf: ENUM.level },
    assigned_to: { max: MAX.id }, ci_id: { max: MAX.id },
  });
  if (bad) return c.json({ error: bad }, 400);
  // Requesters raise tickets; only staff may assign them or link configuration items.
  const staff = user.role !== 'requester';
  if (staff) {
    const e = (await assigneeError(db, b.assigned_to)) || (await ciError(db, b.ci_id));
    if (e) return c.json({ error: e }, 400);
  }
  const id = newId();
  const number = await nextNumber(db, 'INC', 'incidents');
  const prio = b.priority || 'P3';
  const now = nowIso();
  const sla = await slaForNewTicket(db, 'incident', prio, now, await loadSlaConfig(db));
  await db.run(
    `INSERT INTO incidents (id, number, title, description, category, priority, status, impact, urgency,
       requester_id, assigned_to, ci_id, sla_response_due, sla_resolution_due, sla_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, number, b.title, b.description || null, b.category || 'general', prio, b.impact || 'medium',
    b.urgency || 'medium', user.id, staff ? (b.assigned_to || null) : null, staff ? (b.ci_id || null) : null,
    sla.sla_response_due, sla.sla_resolution_due, sla.sla_mode, now, now
  );
  await audit(db, 'incident', id, 'created', user.id, { number, priority: prio });
  fire(c, makeNotifier(c).ticketCreated({ to: user.email, name: user.name, ticketType: 'incident', number, title: b.title }));
  return c.json(forUser(await db.get('SELECT * FROM incidents WHERE id = ?', id), user), 201);
});

r.put('/:id', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const inc = await db.get('SELECT * FROM incidents WHERE id = ?', id);
  if (!inc) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const bad = validate(b, {
    title: { max: MAX.name }, description: { max: MAX.text }, category: { max: MAX.short },
    priority: { oneOf: ENUM.priority }, impact: { oneOf: ENUM.level }, urgency: { oneOf: ENUM.level },
    status: { oneOf: ENUM.incidentStatus }, assigned_to: { max: MAX.id }, ci_id: { max: MAX.id },
  });
  if (bad) return c.json({ error: bad }, 400);
  const refErr = (await assigneeError(db, b.assigned_to)) || (await ciError(db, b.ci_id));
  if (refErr) return c.json({ error: refErr }, 400);
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
  const s = await slaOnUpdate(db, 'incident', inc, { status: m.status, priority: m.priority, responded: !!responded_at, resolved: !!resolved_at }, now, await loadSlaConfig(db));
  await db.run(
    `UPDATE incidents SET title=?, description=?, category=?, priority=?, impact=?, urgency=?, assigned_to=?, ci_id=?,
       status=?, responded_at=?, resolved_at=?, closed_at=?, sla_paused_at=?, sla_hold_mins=?, sla_response_due=?, sla_resolution_due=?, updated_at=? WHERE id=?`,
    m.title, m.description, m.category, m.priority, m.impact, m.urgency, m.assigned_to, m.ci_id,
    m.status, responded_at, resolved_at, closed_at, s.sla_paused_at, s.sla_hold_mins, s.sla_response_due, s.sla_resolution_due, now, id
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
  // Requesters may only write on their own tickets.
  if (user.role === 'requester' && inc.requester_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const { content, is_internal } = await body(c);
  if (!content) return c.json({ error: 'content is required' }, 400);
  if (typeof content !== 'string' || content.length > MAX.text) return c.json({ error: `content must be text of at most ${MAX.text} characters` }, 400);
  if (is_internal && user.role === 'requester') return c.json({ error: 'Requesters cannot add internal notes' }, 403);
  const id = newId();
  await db.run(
    `INSERT INTO comments (id, ticket_type, ticket_id, user_id, content, is_internal, created_at) VALUES (?, 'incident', ?, ?, ?, ?, ?)`,
    id, inc.id, user.id, content, is_internal ? 1 : 0, nowIso()
  );
  // The first public reply from staff is the "first response" the SLA measures. Internal notes do not count.
  if (!is_internal && user.role !== 'requester' && !inc.responded_at) {
    await db.run('UPDATE incidents SET responded_at = ? WHERE id = ? AND responded_at IS NULL', nowIso(), inc.id);
  }
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
