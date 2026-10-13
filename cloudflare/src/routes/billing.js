import { Hono } from 'hono';
import { newId, nowIso, audit, body } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { clientIp, throttleCheck, throttleHit, tooMany } from '../lib/throttle.js';
import { paypalConfigured, paypalMode, planFor, availableRegions, createSubscription, getSubscription, cancelSubscription, verifyWebhook, localStatus } from '../lib/paypal.js';
import { workspaceAccess } from '../lib/entitlement.js';

const r = new Hono();
const LIVE = ['pending', 'active', 'past_due', 'suspended']; // a subscription in any of these blocks starting another
const admin = [authRequired, requireRole('admin')];

const current = (db) => db.get('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 1');
// Billable agents: people who work tickets (agents and administrators). Requesters are never billed.
const seatsInUse = async (db) => (await db.get("SELECT COUNT(*) AS c FROM users WHERE is_active = 1 AND role IN ('admin', 'agent')")).c;
const publicSub = (s) => s && {
  status: s.status, seats: s.seats, region: s.region, currency: s.currency, in_trial: !!s.in_trial, trial_ends_at: s.trial_ends_at, paid_through: s.paid_through,
  next_billing_at: s.next_billing_at, last_payment_at: s.last_payment_at, last_payment_amount: s.last_payment_amount,
  failed_payments: s.failed_payments, cancel_requested_at: s.cancel_requested_at, created_at: s.created_at,
};
const publicAccess = (a) => ({ enforce: a.enforce, entitled: a.entitled, writable: a.writable, status: a.status, reason: a.reason, until: a.until });
const notConfigured = (c) => c.json({ error: 'Online billing is not set up for this workspace. Billing is arranged directly with us.' }, 503);
const providerDown = (c, err) => { console.error('[billing]', err && err.message); return c.json({ error: 'We could not reach PayPal just now. Nothing was charged. Please try again in a few minutes.' }, 502); };

// Moves a subscription to a new status and keeps track of when it stopped being in good standing.
async function setStatus(db, row, status, extra = {}) {
  const now = nowIso();
  const lapsed = status === 'active' ? null : (row.lapsed_at || now);
  const sets = ['status = ?', 'lapsed_at = ?', 'updated_at = ?'], args = [status, lapsed, now];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?`); args.push(v); }
  await db.run(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = ?`, ...args, row.id);
}

// Copy what PayPal says about a subscription onto our record. This is the ONLY way a subscription becomes active.
async function applyPayPalState(db, row, p) {
  const bi = p.billing_info || {};
  const failed = Number(bi.failed_payments_count || 0);
  const status = localStatus(p.status, failed);
  if (!status) return row;
  const trial = (bi.cycle_executions || []).find((e) => e.tenure_type === 'TRIAL');
  const inTrial = status === 'active' && !!trial && Number(trial.cycles_remaining) > 0;
  const next = bi.next_billing_time || null;
  const last = bi.last_payment;
  await setStatus(db, row, status, {
    next_billing_at: next || row.next_billing_at,
    last_payment_at: last?.time || row.last_payment_at,
    last_payment_amount: last?.amount?.value || row.last_payment_amount,
    failed_payments: failed,
    in_trial: inTrial ? 1 : 0,
    trial_ends_at: inTrial ? next : null,
    // What has been paid for (or, in a trial, promised free) runs until PayPal's next billing date. Kept when cancelled.
    paid_through: status === 'active' && next ? next : row.paid_through,
  });
  return db.get('SELECT * FROM subscriptions WHERE id = ?', row.id);
}

// ---------------------------------------------------------------- administrator screens
r.get('/', ...admin, async (c) => {
  const db = c.get('db');
  const sub = await current(db);
  const payments = sub ? await db.all('SELECT id, amount, currency, paid_at, status FROM payments WHERE paypal_subscription_id = ? ORDER BY paid_at DESC LIMIT 24', sub.paypal_subscription_id) : [];
  return c.json({
    configured: paypalConfigured(c.env), mode: paypalMode(c.env), currency: 'USD',
    regions: availableRegions(c.env), vat_note: '15% VAT is added for South African customers; international customers are billed without VAT added',
    seats_in_use: await seatsInUse(db), subscription: publicSub(sub), payments, access: publicAccess(await workspaceAccess(db, c.env)),
  });
});

// Anyone signed in can see whether the workspace is read-only (the app shows a banner); it reveals nothing about payments.
r.get('/access', authRequired, async (c) => c.json(publicAccess(await workspaceAccess(c.get('db'), c.env))));

// The administrator switches subscription enforcement on or off. It starts OFF.
r.put('/enforcement', ...admin, async (c) => {
  const db = c.get('db');
  if (!paypalConfigured(c.env)) return notConfigured(c);
  const b = await body(c);
  if (typeof b.enabled !== 'boolean') return c.json({ error: 'enabled must be true or false' }, 400);
  await db.run("INSERT INTO settings (key, value) VALUES ('billing_enforce', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", b.enabled ? '1' : '0');
  await audit(db, 'billing', 'enforcement', b.enabled ? 'enabled' : 'disabled', c.get('user').id, null);
  return c.json(publicAccess(await workspaceAccess(db, c.env)));
});

// Starts a subscription. Seats and price come from the server, never from the request; the only choice the customer makes
// is where their business is based (which decides whether VAT is added). It stays "pending" until PayPal confirms it.
r.post('/subscribe', ...admin, async (c) => {
  const db = c.get('db');
  if (!paypalConfigured(c.env)) return notConfigured(c);
  const b = await body(c);
  const region = b.region === undefined ? 'ZA' : b.region;
  if (region !== 'ZA' && region !== 'INTL') return c.json({ error: 'region must be ZA (South Africa) or INTL (international)' }, 400);
  const planId = planFor(c.env, region);
  if (!planId) return c.json({ error: 'International billing is not available for this workspace.' }, 400);
  const existing = await current(db);
  if (existing && LIVE.includes(existing.status)) {
    return c.json({ error: existing.status === 'pending' ? 'A subscription is already waiting for approval in PayPal. Finish it there, or cancel it first.' : 'You already have a subscription. To change the number of agents, cancel it and subscribe again.' }, 409);
  }
  const seats = Math.max(1, await seatsInUse(db));
  const origin = c.env.APP_URL || new URL(c.req.url).origin;
  let created;
  try {
    created = await createSubscription(c.env, { planId, quantity: seats, returnUrl: `${origin}/admin?billing=return`, cancelUrl: `${origin}/admin?billing=cancelled`, customId: 'workspace' });
  } catch (err) { return providerDown(c, err); }
  const approve = (created.links || []).find((l) => l.rel === 'approve');
  if (!created.id || !approve || !/^https?:\/\//.test(approve.href)) return providerDown(c, new Error('PayPal returned no approval link'));
  const now = nowIso();
  await db.run(
    `INSERT INTO subscriptions (id, paypal_subscription_id, paypal_plan_id, status, seats, currency, region, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, 'USD', ?, ?, ?)`,
    newId(), created.id, planId, seats, region, now, now
  );
  await audit(db, 'billing', created.id, 'subscription_started', c.get('user').id, { seats, region });
  return c.json({ approve_url: approve.href, seats, region });
});

// Called when the customer comes back from PayPal. It asks PayPal what happened; it does not believe the browser.
r.post('/sync', ...admin, async (c) => {
  const db = c.get('db');
  if (!paypalConfigured(c.env)) return notConfigured(c);
  const row = await current(db);
  if (!row) return c.json({ error: 'There is no subscription to check.' }, 404);
  try {
    const updated = await applyPayPalState(db, row, await getSubscription(c.env, row.paypal_subscription_id));
    await audit(db, 'billing', row.paypal_subscription_id, 'synced', c.get('user').id, { status: updated.status });
    return c.json({ subscription: publicSub(updated) });
  } catch (err) { return providerDown(c, err); }
});

r.post('/cancel', ...admin, async (c) => {
  const db = c.get('db');
  if (!paypalConfigured(c.env)) return notConfigured(c);
  const row = await current(db);
  if (!row || !LIVE.includes(row.status)) return c.json({ error: 'There is no active subscription to cancel.' }, 409);
  try {
    await cancelSubscription(c.env, row.paypal_subscription_id, 'Cancelled by the customer');
    await db.run('UPDATE subscriptions SET cancel_requested_at = ?, updated_at = ? WHERE id = ?', nowIso(), nowIso(), row.id);
    const updated = await applyPayPalState(db, row, await getSubscription(c.env, row.paypal_subscription_id)); // confirmed by PayPal, not assumed
    await audit(db, 'billing', row.paypal_subscription_id, 'cancelled', c.get('user').id, { status: updated.status });
    return c.json({ subscription: publicSub(updated) });
  } catch (err) { return providerDown(c, err); }
});

// ---------------------------------------------------------------- PayPal -> us (public, but only genuine events are acted on)
r.post('/webhook', async (c) => {
  const db = c.get('db');
  if (!paypalConfigured(c.env)) return c.json({ error: 'Billing is not configured' }, 503);
  const key = `webhook:${clientIp(c)}`;
  const t = await throttleCheck(db, key, 600, 3600);
  if (t.blocked) return tooMany(c, t.retryAfter);
  await throttleHit(db, key, 3600);

  const raw = await c.req.text();
  if (raw.length > 65536) return c.json({ error: 'Too large' }, 413);
  let event;
  try { event = JSON.parse(raw); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  if (!event || typeof event !== 'object' || typeof event.id !== 'string' || typeof event.event_type !== 'string') return c.json({ error: 'Not a PayPal event' }, 400);

  let genuine = false;
  try { genuine = await verifyWebhook(c.env, c.req.raw.headers, event); } catch (err) { return providerDown(c, err); }
  if (!genuine) return c.json({ error: 'Signature not verified' }, 400); // PayPal retries; a forged call changes nothing

  const res = event.resource || {};
  const subId = event.event_type.startsWith('PAYMENT.SALE') ? res.billing_agreement_id : res.id;
  const seen = await db.run('INSERT OR IGNORE INTO billing_events (event_id, event_type, paypal_subscription_id, received_at, outcome) VALUES (?, ?, ?, ?, ?)', event.id, event.event_type, subId || null, nowIso(), 'received');
  if (!seen.meta.changes) return c.json({ received: true, duplicate: true }); // already handled: acknowledge, do nothing

  const row = subId ? await db.get('SELECT * FROM subscriptions WHERE paypal_subscription_id = ?', subId) : null;
  let outcome = 'ignored';
  if (row) {
    const now = nowIso();
    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        // Ask PayPal for the full picture (trial, next billing date) instead of trusting the event's partial copy.
        try { await applyPayPalState(db, row, await getSubscription(c.env, subId)); outcome = 'activated (confirmed with PayPal)'; }
        catch { await setStatus(db, row, 'active', { next_billing_at: res.billing_info?.next_billing_time || row.next_billing_at }); outcome = 'active'; }
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED': await setStatus(db, row, 'cancelled'); outcome = 'cancelled'; break;
      case 'BILLING.SUBSCRIPTION.SUSPENDED': await setStatus(db, row, 'suspended'); outcome = 'suspended'; break;
      case 'BILLING.SUBSCRIPTION.EXPIRED': await setStatus(db, row, 'expired'); outcome = 'expired'; break;
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await setStatus(db, row, 'past_due', { failed_payments: Number(res.billing_info?.failed_payments_count) || row.failed_payments + 1 }); outcome = 'past_due'; break;
      case 'PAYMENT.SALE.COMPLETED': {
        const amount = res.amount?.total || null, cur = res.amount?.currency || null, paidAt = res.create_time || now;
        if (res.id) await db.run('INSERT OR IGNORE INTO payments (id, paypal_subscription_id, amount, currency, paid_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', res.id, subId, amount, cur, paidAt, 'completed', now);
        // A completed payment ends any trial (the first real charge is the conversion) and puts a failing subscription back in good standing.
        await setStatus(db, row, ['past_due', 'pending'].includes(row.status) ? 'active' : row.status, { last_payment_at: paidAt, last_payment_amount: amount, failed_payments: 0, in_trial: 0, trial_ends_at: null });
        outcome = 'payment recorded'; break;
      }
      default: outcome = 'ignored: event type not used';
    }
  } else outcome = 'ignored: unknown subscription';
  await db.run('UPDATE billing_events SET outcome = ? WHERE event_id = ?', outcome, event.id);
  return c.json({ received: true });
});

export default r;
