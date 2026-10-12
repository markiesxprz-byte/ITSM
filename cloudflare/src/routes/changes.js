import { Hono } from 'hono';
import { newId, nextNumber, nowIso, audit, body, fire } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { csvResponse } from '../lib/csv.js';
import { makeNotifier } from '../lib/mail.js';
import { validate, ENUM, MAX, assigneeError, ciError } from '../lib/validate.js';

const r = new Hono();
r.use('*', authRequired);
r.use('*', requireRole('admin', 'agent')); // change records hold internal plans and risk — staff only

r.get('/export', requireRole('admin', 'agent'), async (c) => {
  const { status, change_type } = c.req.query();
  let sql = `SELECT ch.*, rq.name AS requester_name, a.name AS assignee_name FROM changes ch
             LEFT JOIN users rq ON rq.id = ch.requester_id LEFT JOIN users a ON a.id = ch.assigned_to WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND ch.status = ?'; p.push(status); }
  if (change_type) { sql += ' AND ch.change_type = ?'; p.push(change_type); }
  sql += ' ORDER BY ch.created_at DESC';
  return csvResponse(c, 'changes.csv', await c.get('db').all(sql, ...p), [
    { key: 'number', label: 'Number' }, { key: 'title', label: 'Title' }, { key: 'change_type', label: 'Type' },
    { key: 'risk', label: 'Risk' }, { key: 'status', label: 'Status' }, { key: 'approval_status', label: 'Approval Status' },
    { key: 'requester_name', label: 'Requester' }, { key: 'assignee_name', label: 'Assigned To' },
    { key: 'scheduled_start', label: 'Scheduled Start' }, { key: 'scheduled_end', label: 'Scheduled End' },
    { key: 'actual_start', label: 'Actual Start' }, { key: 'actual_end', label: 'Actual End' }, { key: 'created_at', label: 'Created At' },
  ]);
});

r.get('/', async (c) => {
  const { status, change_type, assigned_to, q } = c.req.query();
  let sql = 'SELECT * FROM changes WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (change_type) { sql += ' AND change_type = ?'; p.push(change_type); }
  if (assigned_to) { sql += ' AND assigned_to = ?'; p.push(assigned_to); }
  if (q) { sql += ' AND (title LIKE ? OR number LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC';
  return c.json(await c.get('db').all(sql, ...p));
});

r.get('/:id', async (c) => {
  const db = c.get('db');
  const change = await db.get('SELECT * FROM changes WHERE id = ?', c.req.param('id'));
  if (!change) return c.json({ error: 'Not found' }, 404);
  const comments = await db.all('SELECT * FROM comments WHERE ticket_type = ? AND ticket_id = ? ORDER BY created_at', 'change', change.id);
  // Internal notes are for staff only — never return them to requesters.
  const visible = c.get('user').role === 'requester' ? comments.filter((x) => !x.is_internal) : comments;
  return c.json({ ...change, comments: visible });
});

r.post('/', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const b = await body(c);
  if (!b.title) return c.json({ error: 'title is required' }, 400);
  const bad = validate(b, {
    title: { max: MAX.name }, description: { max: MAX.text }, change_type: { oneOf: ENUM.changeType }, risk: { oneOf: ENUM.risk },
    ci_id: { max: MAX.id }, implementation_plan: { max: MAX.text }, backout_plan: { max: MAX.text }, test_plan: { max: MAX.text },
    scheduled_start: { max: 40 }, scheduled_end: { max: 40 },
  });
  if (bad) return c.json({ error: bad }, 400);
  const refErr = await ciError(db, b.ci_id);
  if (refErr) return c.json({ error: refErr }, 400);
  const id = newId();
  const number = await nextNumber(db, 'CHG', 'changes');
  const now = nowIso();
  const standard = b.change_type === 'standard'; // pre-approved changes skip approval
  const approvalStatus = standard ? 'approved' : 'pending';
  await db.run(
    `INSERT INTO changes (id, number, title, description, change_type, status, risk, ci_id, implementation_plan, backout_plan,
       test_plan, requester_id, approval_status, scheduled_start, scheduled_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, number, b.title, b.description || null, b.change_type || 'normal', standard ? 'approved' : 'pending_approval',
    b.risk || 'medium', b.ci_id || null, b.implementation_plan || null, b.backout_plan || null, b.test_plan || null,
    user.id, approvalStatus, b.scheduled_start || null, b.scheduled_end || null, now, now
  );
  await audit(db, 'change', id, 'created', user.id, { number, change_type: b.change_type });
  if (approvalStatus === 'pending') {
    const n = makeNotifier(c);
    for (const admin of await db.all("SELECT * FROM users WHERE role = 'admin' AND is_active = 1")) {
      fire(c, n.approvalRequested({ to: admin.email, name: admin.name, ticketType: 'change', number, title: b.title }));
    }
  }
  return c.json(await db.get('SELECT * FROM changes WHERE id = ?', id), 201);
});

r.put('/:id', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const change = await db.get('SELECT * FROM changes WHERE id = ?', id);
  if (!change) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const bad = validate(b, {
    title: { max: MAX.name }, description: { max: MAX.text }, risk: { oneOf: ENUM.risk }, status: { oneOf: ENUM.changeStatus },
    assigned_to: { max: MAX.id }, implementation_plan: { max: MAX.text }, backout_plan: { max: MAX.text }, test_plan: { max: MAX.text },
    scheduled_start: { max: 40 }, scheduled_end: { max: 40 }, actual_start: { max: 40 }, actual_end: { max: 40 },
  });
  if (bad) return c.json({ error: bad }, 400);
  const refErr = await assigneeError(db, b.assigned_to);
  if (refErr) return c.json({ error: refErr }, 400);
  const updates = {};
  for (const f of ['title', 'description', 'risk', 'status', 'assigned_to', 'implementation_plan', 'backout_plan',
    'test_plan', 'scheduled_start', 'scheduled_end', 'actual_start', 'actual_end']) if (b[f] !== undefined) updates[f] = b[f];
  const m = { ...change, ...updates };
  await db.run(
    `UPDATE changes SET title=?, description=?, risk=?, status=?, assigned_to=?, implementation_plan=?, backout_plan=?,
       test_plan=?, scheduled_start=?, scheduled_end=?, actual_start=?, actual_end=?, updated_at=? WHERE id=?`,
    m.title, m.description, m.risk, m.status, m.assigned_to, m.implementation_plan, m.backout_plan, m.test_plan,
    m.scheduled_start, m.scheduled_end, m.actual_start, m.actual_end, nowIso(), id
  );
  await audit(db, 'change', id, 'updated', c.get('user').id, updates);
  return c.json(await db.get('SELECT * FROM changes WHERE id = ?', id));
});

r.post('/:id/approve', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const change = await db.get('SELECT * FROM changes WHERE id = ?', id);
  if (!change) return c.json({ error: 'Not found' }, 404);
  const { decision } = await body(c);
  if (!['approved', 'rejected'].includes(decision)) return c.json({ error: 'decision must be approved or rejected' }, 400);
  await db.run('UPDATE changes SET approval_status=?, status=?, approver_id=?, updated_at=? WHERE id=?',
    decision, decision, c.get('user').id, nowIso(), id);
  await audit(db, 'change', id, `approval_${decision}`, c.get('user').id, {});
  const requester = change.requester_id ? await db.get('SELECT * FROM users WHERE id = ?', change.requester_id) : null;
  if (requester) fire(c, makeNotifier(c).approvalDecision({ to: requester.email, name: requester.name, ticketType: 'change', number: change.number, title: change.title, decision }));
  return c.json(await db.get('SELECT * FROM changes WHERE id = ?', id));
});

r.post('/:id/comments', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const change = await db.get('SELECT * FROM changes WHERE id = ?', c.req.param('id'));
  if (!change) return c.json({ error: 'Not found' }, 404);
  const { content, is_internal } = await body(c);
  if (!content) return c.json({ error: 'content is required' }, 400);
  if (typeof content !== 'string' || content.length > MAX.text) return c.json({ error: `content must be text of at most ${MAX.text} characters` }, 400);
  const id = newId();
  await db.run(
    `INSERT INTO comments (id, ticket_type, ticket_id, user_id, content, is_internal, created_at) VALUES (?, 'change', ?, ?, ?, ?, ?)`,
    id, change.id, c.get('user').id, content, is_internal ? 1 : 0, nowIso()
  );
  return c.json(await db.get('SELECT * FROM comments WHERE id = ?', id), 201);
});

export default r;
