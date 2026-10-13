import { Hono } from 'hono';
import { newId, body, audit } from '../lib/helpers.js';
import { loadSlaConfig, configForUi } from '../lib/slaengine.js';
import { buildReport } from '../lib/slareport.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { validate, ENUM, MAX } from '../lib/validate.js';

const r = new Hono();
r.use('*', authRequired);

r.get('/', async (c) => c.json(await c.get('db').all('SELECT * FROM sla_policies ORDER BY applies_to, priority')));

// ---- Business hours, holidays and alert behaviour (administrators change them; staff can read them) ----
r.get('/settings', requireRole('admin', 'agent'), async (c) => c.json(configForUi(await loadSlaConfig(c.get('db')))));

r.put('/settings', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const b = await body(c);
  const time = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (!Array.isArray(b.days) || !b.days.length || b.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return c.json({ error: 'days must list the working weekdays as numbers 0 (Sunday) to 6 (Saturday)' }, 400);
  if (!time.test(b.start || '') || !time.test(b.end || '')) return c.json({ error: 'start and end must be times like 08:00' }, 400);
  const mins = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  if (mins(b.end) <= mins(b.start)) return c.json({ error: 'end must be later than start' }, 400);
  if (!Number.isInteger(b.offset) || Math.abs(b.offset) > 14 * 60 || b.offset % 15 !== 0) return c.json({ error: 'offset must be a UTC offset in minutes, in steps of 15 (South Africa is 120)' }, 400);
  if (!Array.isArray(b.holidays) || b.holidays.length > 200 || b.holidays.some((d) => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return c.json({ error: 'holidays must be a list of dates like 2026-12-25 (at most 200)' }, 400);
  if (!Number.isInteger(b.atRiskPct) || b.atRiskPct < 1 || b.atRiskPct > 99) return c.json({ error: 'atRiskPct must be a whole number from 1 to 99' }, 400);
  if (typeof b.raisePriority !== 'boolean') return c.json({ error: 'raisePriority must be true or false' }, 400);
  const clean = { offset: b.offset, days: [...new Set(b.days)].sort(), start: b.start, end: b.end, holidays: [...new Set(b.holidays)].sort(), atRiskPct: b.atRiskPct, raisePriority: b.raisePriority };
  await db.run("INSERT INTO settings (key, value) VALUES ('sla_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(clean));
  await audit(db, 'settings', 'sla', 'updated', c.get('user').id, { days: clean.days, start: clean.start, end: clean.end, holidays: clean.holidays.length, atRiskPct: clean.atRiskPct, raisePriority: clean.raisePriority });
  return c.json(configForUi(await loadSlaConfig(db)));
});

// ---- Service report: SLA attainment, response and resolution times (staff only) ----
r.get('/report', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const { from, to } = c.req.query();
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !date.test(from)) || (to && !date.test(to))) return c.json({ error: 'from and to must be dates like 2026-10-01' }, 400);
  const where = [], args = [];
  if (from) { where.push('created_at >= ?'); args.push(`${from}T00:00:00.000Z`); }
  if (to) { const d = new Date(`${to}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + 1); where.push('created_at < ?'); args.push(d.toISOString()); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const cols = 'priority, status, created_at, responded_at, resolved_at, sla_response_due, sla_resolution_due, sla_mode, sla_paused_at';
  const inc = (await db.all(`SELECT ${cols} FROM incidents ${w} LIMIT 20000`, ...args)).map((t) => ({ ...t, kind: 'incident' }));
  const srq = (await db.all(`SELECT ${cols} FROM service_requests ${w} LIMIT 20000`, ...args)).map((t) => ({ ...t, kind: 'service_request' }));
  const report = buildReport([...inc, ...srq], Date.now(), await loadSlaConfig(db));
  return c.json({ range: { from: from || null, to: to || null }, generated_at: new Date().toISOString(), ...report });
});

r.post('/', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const b = await body(c);
  if (!b.name || !b.applies_to || !b.priority || !b.response_time_mins || !b.resolution_time_mins) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const bad = validate(b, {
    name: { max: MAX.name }, applies_to: { oneOf: ENUM.appliesTo }, priority: { oneOf: ENUM.priority },
    response_time_mins: { int: true, minValue: 1, maxValue: 525600 }, resolution_time_mins: { int: true, minValue: 1, maxValue: 525600 },
  });
  if (bad) return c.json({ error: bad }, 400);
  if (b.use_business_hours !== undefined && typeof b.use_business_hours !== 'boolean') return c.json({ error: 'use_business_hours must be true or false' }, 400);
  const id = newId();
  await db.run(
    `INSERT INTO sla_policies (id, name, applies_to, priority, response_time_mins, resolution_time_mins, use_business_hours) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, b.name, b.applies_to, b.priority, b.response_time_mins, b.resolution_time_mins, b.use_business_hours ? 1 : 0
  );
  return c.json(await db.get('SELECT * FROM sla_policies WHERE id = ?', id), 201);
});

r.put('/:id', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const p = await db.get('SELECT * FROM sla_policies WHERE id = ?', id);
  if (!p) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const bad = validate(b, {
    name: { max: MAX.name }, response_time_mins: { int: true, minValue: 1, maxValue: 525600 }, resolution_time_mins: { int: true, minValue: 1, maxValue: 525600 },
  });
  if (bad) return c.json({ error: bad }, 400);
  if (b.use_business_hours !== undefined && typeof b.use_business_hours !== 'boolean') return c.json({ error: 'use_business_hours must be true or false' }, 400);
  await db.run('UPDATE sla_policies SET name=?, response_time_mins=?, resolution_time_mins=?, use_business_hours=? WHERE id=?',
    b.name ?? p.name, b.response_time_mins ?? p.response_time_mins, b.resolution_time_mins ?? p.resolution_time_mins,
    b.use_business_hours === undefined ? p.use_business_hours : (b.use_business_hours ? 1 : 0), id);
  return c.json(await db.get('SELECT * FROM sla_policies WHERE id = ?', id));
});

r.delete('/:id', requireRole('admin'), async (c) => {
  await c.get('db').run('DELETE FROM sla_policies WHERE id = ?', c.req.param('id'));
  return c.body(null, 204);
});

export default r;
