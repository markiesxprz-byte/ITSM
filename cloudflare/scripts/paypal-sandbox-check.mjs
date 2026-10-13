// Checks your PayPal SANDBOX set-up against PayPal's real service, step by step, and says what is wrong.
// Run it on your computer once the sandbox app, plan and webhook exist. Nothing is charged, nothing is stored.
//
//   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node cloudflare/scripts/paypal-sandbox-check.mjs --plan-id P-... --webhook-id <id> [--plan-id-intl P-...]
//
// It cannot click "approve" as a buyer. After it passes, do the buyer steps in the README's sandbox checklist by hand.
// It refuses to run against PayPal's live system.
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
if (process.argv.includes('--live')) { console.error('This check only runs against the sandbox.'); process.exit(2); }
const base = (arg('api-base') || 'https://api-m.sandbox.paypal.com').replace(/\/$/, '');
const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET, planId = arg('plan-id'), webhookId = arg('webhook-id'), planIntl = arg('plan-id-intl');
if (!id || !secret || !planId || !webhookId) { console.error('Needs PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, --plan-id and --webhook-id.'); process.exit(2); }

let token = '', fails = 0, warns = 0;
const say = (kind, msg) => { console.log(`${kind.padEnd(5)} ${msg}`); if (kind === 'FAIL') fails++; if (kind === 'WARN') warns++; };
async function api(method, path, body, form) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: form ? `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` : `Bearer ${token}`, 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: body === undefined ? undefined : (form ? body : JSON.stringify(body)),
  });
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, data };
}

// 1. credentials
const tok = await api('POST', '/v1/oauth2/token', 'grant_type=client_credentials', true);
if (tok.status !== 200 || !tok.data?.access_token) { say('FAIL', `Could not sign in to PayPal (HTTP ${tok.status}). Check the client id and secret are the SANDBOX ones.`); process.exit(1); }
token = tok.data.access_token; say('PASS', 'Signed in to PayPal with your client id and secret.');

// 2. each plan
async function checkPlan(pid, label, expectVat) {
  const p = await api('GET', `/v1/billing/plans/${encodeURIComponent(pid)}`);
  if (p.status !== 200) { say('FAIL', `${label}: plan ${pid} was not found (HTTP ${p.status}).`); return null; }
  const d = p.data;
  d.status === 'ACTIVE' ? say('PASS', `${label}: the plan is ACTIVE.`) : say('FAIL', `${label}: the plan status is ${d.status}, not ACTIVE.`);
  d.quantity_supported ? say('PASS', `${label}: per-agent quantities are supported.`) : say('FAIL', `${label}: the plan does not support quantities, so it cannot bill per agent. Recreate it with paypal-setup.mjs.`);
  const regular = (d.billing_cycles || []).find((c) => c.tenure_type === 'REGULAR');
  const price = regular?.pricing_scheme?.fixed_price;
  price?.currency_code === 'USD' ? say('PASS', `${label}: billed in US dollars, ${price.value} per agent.`) : say('FAIL', `${label}: the plan is not in US dollars (${price?.currency_code || 'unknown'}).`);
  regular?.frequency?.interval_unit === 'MONTH' && Number(regular?.frequency?.interval_count) === 1 ? say('PASS', `${label}: billed monthly.`) : say('FAIL', `${label}: the plan is not billed every 1 month.`);
  const vat = Number(d.taxes?.percentage || 0);
  if (expectVat) vat === 15 && d.taxes?.inclusive === false ? say('PASS', `${label}: 15% VAT is added on top of the price.`) : say('FAIL', `${label}: expected 15% VAT added on top; found ${vat}% (inclusive: ${d.taxes?.inclusive}).`);
  else vat === 0 ? say('PASS', `${label}: no VAT is added (international).`) : say('WARN', `${label}: this international plan adds ${vat}% tax. Is that intended?`);
  const trial = (d.billing_cycles || []).find((c) => c.tenure_type === 'TRIAL');
  say('INFO', trial ? `${label}: starts with a free trial of ${trial.frequency?.interval_count} ${String(trial.frequency?.interval_unit).toLowerCase()}(s).` : `${label}: no free trial.`);
  return d;
}
await checkPlan(planId, 'South Africa plan', true);
if (planIntl) await checkPlan(planIntl, 'International plan', false);

// 3. creating a subscription (it will wait for a buyer's approval, which this script cannot give)
const sub = await api('POST', '/v1/billing/subscriptions', { plan_id: planId, quantity: '2', custom_id: 'sandbox-check', application_context: { brand_name: 'Infovantage ITSM', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW', return_url: 'https://example.com/return', cancel_url: 'https://example.com/cancel' } });
const approve = sub.data?.links?.find((l) => l.rel === 'approve');
if (sub.status === 201 && sub.data?.status === 'APPROVAL_PENDING' && approve) {
  say('PASS', 'Created a test subscription for 2 agents; PayPal wants a buyer to approve it (APPROVAL_PENDING).');
  say('INFO', `To finish by hand, open this link and approve with your sandbox buyer account: ${approve.href}`);
  const got = await api('GET', `/v1/billing/subscriptions/${sub.data.id}`);
  got.status === 200 && String(got.data?.quantity) === '2' ? say('PASS', 'Read the subscription back: quantity is 2.') : say('FAIL', `Reading the subscription back gave HTTP ${got.status}, quantity ${got.data?.quantity}.`);
  const cancel = await api('POST', `/v1/billing/subscriptions/${sub.data.id}/cancel`, { reason: 'Sandbox check' });
  cancel.status === 204 ? say('PASS', 'Cancelled the test subscription.') : say('WARN', `PayPal would not cancel a subscription that is still awaiting approval (HTTP ${cancel.status}); it will simply expire.`);
} else say('FAIL', `Could not create a subscription (HTTP ${sub.status}). ${JSON.stringify(sub.data || {}).slice(0, 200)}`);

// 4. the webhook
const hooks = await api('GET', '/v1/notifications/webhooks');
const mine = (hooks.data?.webhooks || []).find((w) => w.id === webhookId);
if (!mine) say('FAIL', `Webhook ${webhookId} is not registered on this PayPal app. Create it in the developer dashboard and copy its id.`);
else {
  say('PASS', `Webhook ${webhookId} exists.`);
  /\/api\/billing\/webhook$/.test(mine.url || '') ? say('PASS', `Its address ends in /api/billing/webhook (${mine.url}).`) : say('FAIL', `Its address is ${mine.url}; it must end in /api/billing/webhook.`);
  const have = new Set((mine.event_types || []).map((e) => e.name));
  const need = ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'PAYMENT.SALE.COMPLETED'];
  const missing = need.filter((n) => !have.has(n) && !have.has('*'));
  missing.length ? say('FAIL', `The webhook is not subscribed to: ${missing.join(', ')}.`) : say('PASS', 'The webhook is subscribed to all six events the app uses.');
}
// 5. signature verification: a made-up event must be REJECTED by PayPal (that proves the endpoint works and the id is accepted)
const ver = await api('POST', '/v1/notifications/verify-webhook-signature', { auth_algo: 'SHA256withRSA', cert_url: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-FAKE', transmission_id: 'fake', transmission_sig: 'fake', transmission_time: new Date().toISOString(), webhook_id: webhookId, webhook_event: { id: 'WH-FAKE', event_type: 'TEST' } });
ver.status === 200 && ver.data?.verification_status === 'FAILURE' ? say('PASS', 'PayPal correctly rejected a forged webhook, so signature checking works.') :
  ver.status === 200 && ver.data?.verification_status === 'SUCCESS' ? say('FAIL', 'PayPal ACCEPTED a forged webhook. Do not go live; contact PayPal.') :
  say('WARN', `Signature check returned HTTP ${ver.status}; treat as inconclusive and re-test with a real sandbox webhook.`);

console.log(`\n${fails ? 'NOT READY' : 'READY FOR THE BUYER STEPS'}: ${fails} problem(s), ${warns} warning(s).`);
process.exit(fails ? 1 : 0);
