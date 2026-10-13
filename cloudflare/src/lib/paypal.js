// A small PayPal REST client (Subscriptions API). Everything here runs on the server; the browser never sees a
// credential, a price, a plan id or a seat count it could tamper with.
//
// NOTE: written from PayPal's documented API and tested against a local mock of it. It has NOT yet been run against
// PayPal's sandbox. Run the sandbox checks in the README before trusting it with money.
const enc = new TextEncoder();

export const paypalConfigured = (env) => !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_PLAN_ID && env.PAYPAL_WEBHOOK_ID);

// Sandbox unless the owner explicitly sets PAYPAL_ENV=live. PAYPAL_API_BASE exists so tests can point at a mock.
export function paypalBase(env) {
  if (env.PAYPAL_API_BASE) return env.PAYPAL_API_BASE.replace(/\/$/, '');
  return env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}
export const paypalMode = (env) => (env.PAYPAL_API_BASE ? 'test' : env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox');

let cached = { token: null, until: 0, key: '' };
async function accessToken(env) {
  const key = `${paypalBase(env)}|${env.PAYPAL_CLIENT_ID}`;
  if (cached.token && cached.key === key && Date.now() < cached.until - 60000) return cached.token;
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new PayPalError('PayPal sign-in failed', res.status);
  const j = await res.json();
  cached = { token: j.access_token, until: Date.now() + (Number(j.expires_in) || 300) * 1000, key };
  return cached.token;
}

export class PayPalError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(env, method, path, body) {
  const token = await accessToken(env);
  const res = await fetch(`${paypalBase(env)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new PayPalError(`PayPal request failed (${method} ${path.split('?')[0]})`, res.status);
  return data;
}

// Two plans can exist: South Africa (priced with 15% VAT) and international (no VAT added). The international one is optional.
export const planFor = (env, region) => (region === 'INTL' ? env.PAYPAL_PLAN_ID_INTL || null : env.PAYPAL_PLAN_ID || null);
export const availableRegions = (env) => ['ZA', ...(env.PAYPAL_PLAN_ID_INTL ? ['INTL'] : [])];

export const createSubscription = (env, { planId, quantity, returnUrl, cancelUrl, customId }) => call(env, 'POST', '/v1/billing/subscriptions', {
  plan_id: planId,
  quantity: String(quantity),
  custom_id: customId,
  application_context: { brand_name: 'Infovantage ITSM', locale: 'en-US', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW', return_url: returnUrl, cancel_url: cancelUrl },
});
export const getSubscription = (env, id) => call(env, 'GET', `/v1/billing/subscriptions/${encodeURIComponent(id)}`);
export const cancelSubscription = (env, id, reason) => call(env, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason: String(reason || 'Cancelled by the customer').slice(0, 128) });

// Asks PayPal itself whether a webhook is genuine. Returns true only when PayPal answers SUCCESS.
export async function verifyWebhook(env, headers, event) {
  const h = (n) => headers.get(n);
  const parts = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'].map(h);
  if (parts.some((p) => !p)) return false;
  const r = await call(env, 'POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: parts[0], cert_url: parts[1], transmission_id: parts[2], transmission_sig: parts[3], transmission_time: parts[4],
    webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: event,
  });
  return !!r && r.verification_status === 'SUCCESS';
}

// PayPal's status words -> ours.
export function localStatus(paypalStatus, failedPayments = 0) {
  switch (paypalStatus) {
    case 'ACTIVE': return failedPayments > 0 ? 'past_due' : 'active';
    case 'APPROVAL_PENDING': case 'APPROVED': return 'pending';
    case 'SUSPENDED': return 'suspended';
    case 'CANCELLED': return 'cancelled';
    case 'EXPIRED': return 'expired';
    default: return null;
  }
}
export { enc };
