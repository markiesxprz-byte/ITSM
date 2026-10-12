import { Hono } from 'hono';
import { newId, nowIso, audit, body, fire } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { makeNotifier } from '../lib/mail.js';

const r = new Hono();

// Public: submitted from the marketing site's trial form. No auth.
r.post('/', async (c) => {
  const db = c.get('db');
  const b = await body(c);
  if (!b.name || !b.email || !b.company) return c.json({ error: 'name, email and company are required' }, 400);
  const id = newId();
  await db.run(
    `INSERT INTO leads (id, name, email, company, workspace_slug, team_size, region, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, b.name, b.email, b.company, b.workspace_slug || null, b.team_size || null, b.region || null, b.plan || null, nowIso()
  );
  fire(c, makeNotifier(c).sendMail({
    to: b.email,
    subject: 'Your Infovantage ITSM trial request',
    text: `Hi ${b.name},\n\nThanks for requesting a trial of Infovantage ITSM for ${b.company}.\n\nWe set up each trial workspace by hand so it's configured correctly from day one — you'll hear from us with your sign-in details within one business day.\n\nIn the meantime, if you have questions, just reply to this email.\n\n— Infovantage Consulting`,
  }));
  await audit(db, 'lead', id, 'submitted', null, { company: b.company, plan: b.plan });
  return c.json({ received: true }, 201);
});

r.get('/', authRequired, requireRole('admin'), async (c) => {
  const { status } = c.req.query();
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status = ?'; p.push(status); }
  return c.json(await c.get('db').all(sql + ' ORDER BY created_at DESC', ...p));
});

r.put('/:id', authRequired, requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', id);
  if (!lead) return c.json({ error: 'Not found' }, 404);
  const { status, notes } = await body(c);
  await db.run('UPDATE leads SET status = ?, notes = ? WHERE id = ?', status ?? lead.status, notes ?? lead.notes, id);
  await audit(db, 'lead', id, 'updated', c.get('user').id, { status });
  return c.json(await db.get('SELECT * FROM leads WHERE id = ?', id));
});

export default r;
