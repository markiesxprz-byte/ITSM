import { Hono } from 'hono';
import { newId, nowIso, audit, body, fire, todayUtc, isValidDay, addMonths } from '../lib/helpers.js';
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
    text: `Hi ${b.name},\n\nThanks for requesting a trial of Infovantage ITSM for ${b.company}.\n\nWe set up each trial workspace by hand so it's configured correctly from day one — you'll hear from us with your sign-in details within one business day. Your first month is free, starting the day your workspace is ready.\n\nIn the meantime, if you have questions, just reply to this email.\n\n— Infovantage Consulting`,
  }));
  await audit(db, 'lead', id, 'submitted', null, { company: b.company, plan: b.plan });
  return c.json({ received: true }, 201);
});

// The free month runs from the day the workspace was set up. The list shows when it ends.
const withTrial = (lead) => ({ ...lead, trial_ends_at: lead.provisioned_at ? addMonths(lead.provisioned_at, 1) : null });
const STATUSES = ['new', 'contacted', 'provisioned', 'closed'];

r.get('/', authRequired, requireRole('admin'), async (c) => {
  const { status } = c.req.query();
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status = ?'; p.push(status); }
  return c.json((await c.get('db').all(sql + ' ORDER BY created_at DESC', ...p)).map(withTrial));
});

r.put('/:id', authRequired, requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', id);
  if (!lead) return c.json({ error: 'Not found' }, 404);
  const { status, notes, provisioned_at } = await body(c);

  if (status !== undefined && !STATUSES.includes(status)) {
    return c.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, 400);
  }
  const hasDate = provisioned_at !== undefined && provisioned_at !== null && provisioned_at !== '';
  if (hasDate && !isValidDay(provisioned_at)) {
    return c.json({ error: 'provisioned_at must be a real date in YYYY-MM-DD format' }, 400);
  }

  const newStatus = status ?? lead.status;
  let start = hasDate ? provisioned_at : lead.provisioned_at;
  // Setting a workspace to "provisioned" starts the free month (today, unless a date is given).
  if (newStatus === 'provisioned' && !start) start = todayUtc();

  await db.run('UPDATE leads SET status = ?, notes = ?, provisioned_at = ? WHERE id = ?',
    newStatus, notes ?? lead.notes, start, id);
  await audit(db, 'lead', id, 'updated', c.get('user').id, { status: newStatus, provisioned_at: start });
  return c.json(withTrial(await db.get('SELECT * FROM leads WHERE id = ?', id)));
});

export default r;
