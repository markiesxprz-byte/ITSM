import { Hono } from 'hono';
import { newId, nowIso, audit, body, fire, todayUtc, isValidDay, addMonths } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { makeNotifier } from '../lib/mail.js';
import { validate, ENUM, MAX } from '../lib/validate.js';
import { csvResponse } from '../lib/csv.js';
import { clientIp, throttleCheck, throttleHit, tooMany } from '../lib/throttle.js';

const r = new Hono();

// Public: demo requests and waitlist sign-ups from the marketing site. No account needed, and no
// payment details are ever collected here.
const PLAN_LABEL = { starter: 'Starter', professional: 'Professional', msp: 'MSP / Business Plus', not_sure: 'an ITSM plan', growth: 'Growth', pro: 'Pro', enterprise: 'Enterprise' };

r.post('/', async (c) => {
  const db = c.get('db');
  const b = await body(c);
  // Hidden "website" field: people never see or fill it, bots usually do. Pretend success, store nothing.
  if (typeof b.website === 'string' && b.website.trim() !== '') return c.json({ received: true }, 201);

  if (!b.name || !b.email || !b.company) return c.json({ error: 'Please enter your name, work email and organisation.' }, 400);
  const bad = validate(b, {
    name: { max: MAX.name }, email: { email: true, max: 254 }, company: { max: MAX.name }, workspace_slug: { max: MAX.short },
    team_size: { max: 20 }, region: { max: 50 }, plan: { oneOf: ENUM.plan }, kind: { oneOf: ENUM.leadKind }, message: { max: 2000 },
    consent_version: { max: 20 },
  });
  if (bad) return c.json({ error: bad }, 400);
  // Consent is recorded server-side and must be explicit: we only contact people who agreed to be contacted.
  if (b.consent !== true) return c.json({ error: 'Please confirm that you agree to be contacted about this request.' }, 400);

  // This form is public: limit how fast one visitor can fill the queue (and trigger emails).
  const spamKey = `lead:${clientIp(c)}`;
  const t = await throttleCheck(db, spamKey, 10, 3600);
  if (t.blocked) return tooMany(c, t.retryAfter);
  await throttleHit(db, spamKey, 3600);

  const kind = b.kind || 'demo';
  const plan = b.plan || null;
  const email = String(b.email).trim();
  // The same person asking for the same thing twice (double-click, retry) must not create two leads or two emails.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const dup = await db.get(
    "SELECT id FROM leads WHERE lower(email) = lower(?) AND COALESCE(plan, '') = ? AND COALESCE(kind, 'demo') = ? AND created_at > ?",
    email, plan || '', kind, since
  );
  if (dup) return c.json({ received: true, duplicate: true }, 200);

  const id = newId();
  const now = nowIso();
  await db.run(
    `INSERT INTO leads (id, name, email, company, workspace_slug, team_size, region, plan, kind, message, consent, consent_at, consent_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    id, b.name, email, b.company, b.workspace_slug || null, b.team_size || null, b.region || null, plan, kind,
    b.message || null, now, b.consent_version || null, now
  );
  const origin = new URL(c.req.url).origin;
  const sig = '— Infovantage Consulting';
  const text = kind === 'waitlist'
    ? `Hi ${b.name},\n\nThanks — you're on the waitlist for the ${PLAN_LABEL[plan] || 'Infovantage ITSM'} plan for ${b.company}.\n\nThis plan is not available yet. We'll email you when it is. There is no obligation, and no payment details are needed or taken.\n\nYou can ask us to remove your details at any time by replying to this email or using the contact options at ${origin}/support.\n\n${sig}`
    : `Hi ${b.name},\n\nThanks for asking about Infovantage ITSM for ${b.company}. We'll contact you by email to arrange a demo.\n\nWe never ask for payment details to arrange a demo. You can ask us to remove your details at any time by replying to this email or using the contact options at ${origin}/support.\n\n${sig}`;
  fire(c, makeNotifier(c).sendMail({
    to: email,
    subject: kind === 'waitlist' ? "You're on the Infovantage ITSM waitlist" : 'Your Infovantage ITSM demo request',
    text,
  }));
  await audit(db, 'lead', id, 'submitted', null, { company: b.company, plan, kind });
  return c.json({ received: true }, 201);
});

// Trial tracking (admin only): a trial or pilot period of one month runs from the day the workspace was set up.
// This is bookkeeping for you — it is NOT advertised publicly, because nothing enforces or converts a trial yet.
const withTrial = (lead) => ({ ...lead, trial_ends_at: lead.provisioned_at ? addMonths(lead.provisioned_at, 1) : null });
const STATUSES = ['new', 'contacted', 'provisioned', 'closed'];

r.get('/export', authRequired, requireRole('admin'), async (c) => {
  const rows = (await c.get('db').all('SELECT * FROM leads ORDER BY created_at DESC')).map(withTrial);
  return csvResponse(c, 'demo_and_waitlist_requests.csv', rows, [
    { key: 'created_at', label: 'Received' }, { key: 'kind', label: 'Type' }, { key: 'plan', label: 'Plan' }, { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' }, { key: 'company', label: 'Organisation' }, { key: 'team_size', label: 'Agents' },
    { key: 'message', label: 'Message' }, { key: 'consent', label: 'Consent given' }, { key: 'consent_at', label: 'Consent recorded' },
    { key: 'consent_version', label: 'Consent wording version' }, { key: 'status', label: 'Status' },
    { key: 'provisioned_at', label: 'Workspace ready' }, { key: 'trial_ends_at', label: 'Trial/pilot ends' }, { key: 'notes', label: 'Notes' },
  ]);
});

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
  const notesBad = validate({ notes }, { notes: { max: MAX.text } });
  if (notesBad) return c.json({ error: notesBad }, 400);

  if (status !== undefined && !STATUSES.includes(status)) {
    return c.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, 400);
  }
  const hasDate = provisioned_at !== undefined && provisioned_at !== null && provisioned_at !== '';
  if (hasDate && !isValidDay(provisioned_at)) {
    return c.json({ error: 'provisioned_at must be a real date in YYYY-MM-DD format' }, 400);
  }

  const newStatus = status ?? lead.status;
  let start = hasDate ? provisioned_at : lead.provisioned_at;
  // Setting a workspace to "provisioned" starts the one-month pilot (today, unless a date is given).
  if (newStatus === 'provisioned' && !start) start = todayUtc();

  await db.run('UPDATE leads SET status = ?, notes = ?, provisioned_at = ? WHERE id = ?',
    newStatus, notes ?? lead.notes, start, id);
  await audit(db, 'lead', id, 'updated', c.get('user').id, { status: newStatus, provisioned_at: start });
  return c.json(withTrial(await db.get('SELECT * FROM leads WHERE id = ?', id)));
});

export default r;
