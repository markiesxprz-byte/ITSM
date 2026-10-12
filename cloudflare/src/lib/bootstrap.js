import { newId, nowIso } from './helpers.js';

// First-run defaults. The flag insert is atomic (INSERT OR IGNORE): only the request
// that actually creates the row seeds data, so concurrent cold starts can't duplicate it.
let done = false;
export async function bootstrapDefaults(db) {
  if (done) return;
  const won = await db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('bootstrapped', '1')");
  if (!won.meta.changes) { done = true; return; }

  const now = nowIso();
  const sla = [
    ['Critical Incident SLA', 'incident', 'P1', 15, 240],
    ['High Incident SLA', 'incident', 'P2', 30, 480],
    ['Medium Incident SLA', 'incident', 'P3', 120, 1440],
    ['Low Incident SLA', 'incident', 'P4', 480, 4320],
    ['Standard Request SLA', 'service_request', 'P3', 240, 2880],
  ];
  const catalog = [
    ['New Laptop Request', 'hardware', 'Request a new company laptop', 1, 'IT Hardware'],
    ['Software License Request', 'software', 'Request access to licensed software', 1, 'IT Applications'],
    ['Password Reset', 'access', 'Reset your account password', 0, 'Service Desk'],
    ['New Employee Onboarding', 'access', 'Provision accounts and equipment for a new hire', 1, 'IT Operations'],
    ['VPN Access Request', 'access', 'Request remote VPN access', 0, 'Network Team'],
  ];
  try {
  await db.batch([
    ...sla.map(([n, a, p, r, s]) => [
      'INSERT INTO sla_policies (id, name, applies_to, priority, response_time_mins, resolution_time_mins) VALUES (?, ?, ?, ?, ?, ?)',
      newId(), n, a, p, r, s,
    ]),
    ...catalog.map(([n, cat, d, ap, t]) => [
      'INSERT INTO service_catalog (id, name, category, description, requires_approval, fulfillment_team) VALUES (?, ?, ?, ?, ?, ?)',
      newId(), n, cat, d, ap, t,
    ]),
    [
      "INSERT INTO kb_articles (id, title, content, category, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'published', ?, ?)",
      newId(), 'Welcome — how to get help',
      'To report something that is broken, raise an Incident. To ask for something new (equipment, access, software), submit a Service Request. Search this knowledge base first — your answer may already be here.',
      'general', 'welcome,getting started', now, now,
    ],
  ]);
  done = true;
  } catch (err) {
    // Release the claim so the next request retries, instead of leaving the
    // instance permanently flagged as seeded but empty.
    await db.run("DELETE FROM settings WHERE key = 'bootstrapped'");
    throw err;
  }
}
