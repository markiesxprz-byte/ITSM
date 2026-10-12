import { Hono } from 'hono';
import { newId, nextNumber, nowIso, getSla, addMinutesIso, audit, body, fire } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { csvResponse } from '../lib/csv.js';
import { makeNotifier } from '../lib/mail.js';
import { validate, ENUM, MAX, assigneeError, ciError } from '../lib/validate.js';

const r = new Hono();
r.use('*', authRequired);

r.get('/export', requireRole('admin', 'agent'), async (c) => {
  const { status } = c.req.query();
  let sql = `SELECT sr.*, ci.name AS catalog_name, rq.name AS requester_name, rq.email AS requester_email, a.name AS assignee_name
             FROM service_requests sr LEFT JOIN service_catalog ci ON ci.id = sr.catalog_item_id
             LEFT JOIN users rq ON rq.id = sr.requester_id LEFT JOIN users a ON a.id = sr.assigned_to WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND sr.status = ?'; p.push(status); }
  sql += ' ORDER BY sr.created_at DESC';
  return csvResponse(c, 'service_requests.csv', await c.get('db').all(sql, ...p), [
    { key: 'number', label: 'Number' }, { key: 'title', label: 'Title' }, { key: 'catalog_name', label: 'Catalog Item' },
    { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }, { key: 'approval_status', label: 'Approval Status' },
    { key: 'requester_name', label: 'Requester' }, { key: 'requester_email', label: 'Requester Email' },
    { key: 'assignee_name', label: 'Assigned To' }, { key: 'resolved_at', label: 'Fulfilled At' },
    { key: 'created_at', label: 'Created At' }, { key: 'updated_at', label: 'Updated At' },
  ]);
});

// --- Service catalog ---
r.get('/catalog', async (c) =>
  c.json(await c.get('db').all('SELECT * FROM service_catalog WHERE is_active = 1 ORDER BY category, name')));

r.post('/catalog', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const b = await body(c);
  if (!b.name) return c.json({ error: 'name is required' }, 400);
  const bad = validate(b, { name: { max: MAX.name }, category: { max: MAX.short }, description: { max: MAX.text }, fulfillment_team: { max: MAX.name } });
  if (bad) return c.json({ error: bad }, 400);
  const id = newId();
  await db.run(
    `INSERT INTO service_catalog (id, name, category, description, requires_approval, fulfillment_team) VALUES (?, ?, ?, ?, ?, ?)`,
    id, b.name, b.category || 'general', b.description || null, b.requires_approval ? 1 : 0, b.fulfillment_team || null
  );
  return c.json(await db.get('SELECT * FROM service_catalog WHERE id = ?', id), 201);
});

// --- Service requests ---
r.get('/', async (c) => {
  const { status, assigned_to, requester_id, q } = c.req.query();
  const user = c.get('user');
  let sql = 'SELECT * FROM service_requests WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status = ?'; p.push(status); }
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
  const sr = await db.get('SELECT * FROM service_requests WHERE id = ?', c.req.param('id'));
  if (!sr) return c.json({ error: 'Not found' }, 404);
  if (user.role === 'requester' && sr.requester_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const comments = await db.all('SELECT * FROM comments WHERE ticket_type = ? AND ticket_id = ? ORDER BY created_at', 'service_request', sr.id);
  // Internal notes are for staff only — never return them to requesters.
  const visible = c.get('user').role === 'requester' ? comments.filter((x) => !x.is_internal) : comments;
  return c.json({ ...sr, comments: visible });
});

r.post('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const b = await body(c);
  if (!b.title) return c.json({ error: 'title is required' }, 400);
  const bad = validate(b, {
    title: { max: MAX.name }, description: { max: MAX.text }, priority: { oneOf: ENUM.priority }, catalog_item_id: { max: MAX.id },
  });
  if (bad) return c.json({ error: bad }, 400);
  let requiresApproval = false;
  if (b.catalog_item_id) {
    const item = await db.get('SELECT * FROM service_catalog WHERE id = ?', b.catalog_item_id);
    if (!item) return c.json({ error: 'catalog_item_id does not match a catalog item' }, 400);
    requiresApproval = !!item.requires_approval;
  }
  const id = newId();
  const number = await nextNumber(db, 'SR', 'service_requests');
  const prio = b.priority || 'P3';
  const sla = await getSla(db, 'service_request', prio);
  const now = nowIso();
  await db.run(
    `INSERT INTO service_requests (id, number, title, description, catalog_item_id, priority, status, requester_id,
       approval_status, sla_response_due, sla_resolution_due, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, number, b.title, b.description || null, b.catalog_item_id || null, prio,
    requiresApproval ? 'pending_approval' : 'new', user.id, requiresApproval ? 'pending' : 'not_required',
    addMinutesIso(sla.response), addMinutesIso(sla.resolution), now, now
  );
  await audit(db, 'service_request', id, 'created', user.id, { number, requiresApproval });
  fire(c, makeNotifier(c).ticketCreated({ to: user.email, name: user.name, ticketType: 'service_request', number, title: b.title }));
  return c.json(await db.get('SELECT * FROM service_requests WHERE id = ?', id), 201);
});

r.put('/:id', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const sr = await db.get('SELECT * FROM service_requests WHERE id = ?', id);
  if (!sr) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const bad = validate(b, {
    title: { max: MAX.name }, description: { max: MAX.text }, priority: { oneOf: ENUM.priority },
    status: { oneOf: ENUM.requestStatus }, assigned_to: { max: MAX.id },
  });
  if (bad) return c.json({ error: bad }, 400);
  const refErr = await assigneeError(db, b.assigned_to);
  if (refErr) return c.json({ error: refErr }, 400);
  const updates = {};
  for (const f of ['title', 'description', 'priority', 'assigned_to', 'status']) if (b[f] !== undefined) updates[f] = b[f];
  const now = nowIso();
  let resolvedAt = sr.resolved_at;
  if (updates.status === 'fulfilled' && !resolvedAt) resolvedAt = now;
  const m = { ...sr, ...updates };
  await db.run(
    `UPDATE service_requests SET title=?, description=?, priority=?, assigned_to=?, status=?, resolved_at=?, updated_at=? WHERE id=?`,
    m.title, m.description, m.priority, m.assigned_to, m.status, resolvedAt, now, id
  );
  await audit(db, 'service_request', id, 'updated', user.id, updates);
  const n = makeNotifier(c);
  const requester = sr.requester_id ? await db.get('SELECT * FROM users WHERE id = ?', sr.requester_id) : null;
  if (updates.status && updates.status !== sr.status && requester) {
    fire(c, n.statusChanged({ to: requester.email, name: requester.name, ticketType: 'service_request', number: sr.number, title: m.title, status: updates.status }));
  }
  if (updates.assigned_to && updates.assigned_to !== sr.assigned_to) {
    const a = await db.get('SELECT * FROM users WHERE id = ?', updates.assigned_to);
    if (a) fire(c, n.assigned({ to: a.email, name: a.name, ticketType: 'service_request', number: sr.number, title: m.title }));
  }
  return c.json(await db.get('SELECT * FROM service_requests WHERE id = ?', id));
});

r.post('/:id/approve', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const sr = await db.get('SELECT * FROM service_requests WHERE id = ?', id);
  if (!sr) return c.json({ error: 'Not found' }, 404);
  const { decision } = await body(c);
  if (!['approved', 'rejected'].includes(decision)) return c.json({ error: 'decision must be approved or rejected' }, 400);
  await db.run('UPDATE service_requests SET approval_status=?, status=?, approver_id=?, updated_at=? WHERE id=?',
    decision, decision, user.id, nowIso(), id);
  await audit(db, 'service_request', id, `approval_${decision}`, user.id, {});
  const requester = sr.requester_id ? await db.get('SELECT * FROM users WHERE id = ?', sr.requester_id) : null;
  if (requester) fire(c, makeNotifier(c).approvalDecision({ to: requester.email, name: requester.name, ticketType: 'service_request', number: sr.number, title: sr.title, decision }));
  return c.json(await db.get('SELECT * FROM service_requests WHERE id = ?', id));
});

r.post('/:id/comments', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const sr = await db.get('SELECT * FROM service_requests WHERE id = ?', c.req.param('id'));
  if (!sr) return c.json({ error: 'Not found' }, 404);
  // Requesters may only write on their own requests.
  if (user.role === 'requester' && sr.requester_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const { content, is_internal } = await body(c);
  if (!content) return c.json({ error: 'content is required' }, 400);
  if (typeof content !== 'string' || content.length > MAX.text) return c.json({ error: `content must be text of at most ${MAX.text} characters` }, 400);
  if (is_internal && user.role === 'requester') return c.json({ error: 'Forbidden' }, 403);
  const id = newId();
  await db.run(
    `INSERT INTO comments (id, ticket_type, ticket_id, user_id, content, is_internal, created_at) VALUES (?, 'service_request', ?, ?, ?, ?, ?)`,
    id, sr.id, user.id, content, is_internal ? 1 : 0, nowIso()
  );
  if (!is_internal) {
    const target = user.id === sr.requester_id ? sr.assigned_to : sr.requester_id;
    if (target) {
      const t = await db.get('SELECT * FROM users WHERE id = ?', target);
      if (t) fire(c, makeNotifier(c).commentAdded({ to: t.email, name: t.name, ticketType: 'service_request', number: sr.number, title: sr.title, author: user.name }));
    }
  }
  return c.json(await db.get('SELECT * FROM comments WHERE id = ?', id), 201);
});

export default r;
