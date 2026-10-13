// Who may change things in a workspace, given its subscription. Customers who never subscribed through PayPal (for
// example those invoiced directly) are NEVER restricted. Nothing here deletes data: a lapsed workspace becomes
// read-only (people can still sign in, read, export to CSV, and fix their billing).
//
// Enforcement is an explicit switch the administrator turns on (setting 'billing_enforce'); until then these rules
// only produce information for the screen.
const DAY = 86400000;

// Pure: decides from the subscription records alone. `sub` is the newest row, `prev` the newest row before it.
export function evaluateAccess(sub, prev, nowMs, graceDays = 7) {
  if (!sub) return { entitled: true, reason: 'no_subscription', status: 'none', until: null };
  let s = sub;
  // A new subscription still waiting for approval must not erase the standing of the one before it, or a lapsed customer
  // could regain write access by starting a subscription and never paying.
  if (sub.status === 'pending') {
    if (!prev) return { entitled: true, reason: 'first_subscription_pending', status: 'pending', until: null };
    s = prev;
  }
  const t = (iso) => (iso ? Date.parse(iso) : null);
  const lapsed = t(s.lapsed_at);
  switch (s.status) {
    case 'active':
      return { entitled: true, reason: 'active', status: 'active', until: null };
    case 'past_due': case 'suspended': {
      const until = (lapsed ?? nowMs) + graceDays * DAY;     // a short grace period while PayPal retries
      return { entitled: nowMs < until, reason: nowMs < until ? 'grace' : 'lapsed', status: s.status, until: new Date(until).toISOString() };
    }
    case 'cancelled': {
      // Cancelling stops future charges, but what was already paid for stays usable until the end of that period.
      const until = Math.max(t(s.paid_through) ?? 0, lapsed ?? 0);
      return { entitled: until > nowMs, reason: until > nowMs ? 'paid_through' : 'lapsed', status: 'cancelled', until: until ? new Date(until).toISOString() : null };
    }
    case 'expired':
      return { entitled: false, reason: 'lapsed', status: 'expired', until: s.lapsed_at || null };
    default:
      return { entitled: true, reason: 'unknown_status', status: s.status, until: null };
  }
}

export async function enforcementOn(db) {
  const row = await db.get("SELECT value FROM settings WHERE key = 'billing_enforce'");
  return !!row && row.value === '1';
}

// The state the app acts on. `writable` is what a write request must check.
export async function workspaceAccess(db, env, nowMs = Date.now()) {
  const enforce = await enforcementOn(db);
  const rows = await db.all('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 2');
  const grace = Number(env.BILLING_GRACE_DAYS);
  const e = evaluateAccess(rows[0] || null, rows[1] || null, nowMs, Number.isFinite(grace) && grace >= 0 ? grace : 7);
  return { ...e, enforce, writable: !enforce || e.entitled };
}

// How many billable agents may exist right now, or null for "no limit".
export async function seatLimit(db, env, nowMs = Date.now()) {
  if (!(await enforcementOn(db))) return null;
  const sub = await db.get("SELECT * FROM subscriptions WHERE status IN ('active', 'past_due') ORDER BY created_at DESC LIMIT 1");
  if (!sub) return null;                                  // no live PayPal subscription: this customer is not on per-seat billing
  return sub.seats;
}
