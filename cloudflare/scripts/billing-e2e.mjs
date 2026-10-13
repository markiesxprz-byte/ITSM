// End-to-end billing tests against a local MOCK of PayPal (see paypal-mock.mjs). Run through billing-check.sh.
//   node cloudflare/scripts/billing-e2e.mjs <configuredBase> <unconfiguredBase> <mockBase>
// These prove our code's behaviour against PayPal's documented API. They do NOT prove it works against PayPal itself.
import { execFileSync } from 'node:child_process';
const [CONF, UNCONF, MOCK] = process.argv.slice(2).map((x) => x.replace(/\/$/, ''));
let pass = 0, fail = 0, ipn = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  [' + String(detail).slice(0, 240) + ']'}`); };
const every = []; // every response body seen, to prove no secret ever leaks

async function call(base, method, path, { token, json, raw, headers } = {}) {
  const h = { 'cf-connecting-ip': `203.0.113.${(++ipn % 240) + 1}`, ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (raw !== undefined) { body = raw; h['content-type'] = 'application/json'; } else if (json !== undefined) { body = JSON.stringify(json); h['content-type'] = 'application/json'; }
  const res = await fetch(base + path, { method, headers: h, body });
  const text = await res.text(); every.push(text);
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, text };
}
const mock = async (path, json) => (await fetch(MOCK + path, { method: json ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: json ? JSON.stringify(json) : undefined })).json();

async function people(base) {
  const r = await call(base, 'POST', '/api/auth/register', { json: { name: 'Admin', email: 'admin@bill.test', password: 'Str0ng-pass-1' } });
  const admin = r.data.token;
  await call(base, 'POST', '/api/users', { token: admin, json: { name: 'Agent Amy', email: 'amy@bill.test', password: 'Str0ng-pass-2', role: 'agent' } });
  await call(base, 'POST', '/api/users', { token: admin, json: { name: 'Requester Rob', email: 'rob@bill.test', password: 'Str0ng-pass-3', role: 'requester' } });
  const login = async (e, p) => (await call(base, 'POST', '/api/auth/login', { json: { email: e, password: p } })).data.token;
  return { admin, agent: await login('amy@bill.test', 'Str0ng-pass-2'), requester: await login('rob@bill.test', 'Str0ng-pass-3') };
}

// ================================================================ a workspace with NO PayPal settings
const U = await people(UNCONF);
let r = await call(UNCONF, 'GET', '/api/billing', { token: U.admin });
t('unconfigured: billing reports "not configured", no subscription, USD', r.status === 200 && r.data.configured === false && r.data.subscription === null && r.data.currency === 'USD', r.text);
r = await call(UNCONF, 'POST', '/api/billing/subscribe', { token: U.admin });
t('unconfigured: subscribing is refused with a clear message (503), nothing is created', r.status === 503 && /not set up/i.test(r.data.error), r.text);
for (const p of ['sync', 'cancel']) t(`unconfigured: ${p} is refused (503)`, (await call(UNCONF, 'POST', `/api/billing/${p}`, { token: U.admin })).status === 503);
r = await call(UNCONF, 'POST', '/api/billing/webhook', { json: { id: 'WH-1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-X' } } });
t('unconfigured: the webhook address does nothing (503)', r.status === 503);

// ================================================================ who may use billing
const C = await people(CONF);
for (const [who, tok] of [['an agent', C.agent], ['a requester', C.requester], ['an anonymous visitor', undefined]]) {
  for (const [m, p] of [['GET', '/api/billing'], ['POST', '/api/billing/subscribe'], ['POST', '/api/billing/sync'], ['POST', '/api/billing/cancel']]) {
    r = await call(CONF, m, p, { token: tok });
    t(`${who} cannot ${m} ${p} (${tok ? 403 : 401})`, r.status === (tok ? 403 : 401), `${r.status}`);
  }
}

// ================================================================ configured: the happy path
r = await call(CONF, 'GET', '/api/billing', { token: C.admin });
t('configured: billing reports configured, mode "test", USD, a VAT note, and no subscription yet', r.data.configured === true && r.data.mode === 'test' && r.data.currency === 'USD' && /15%/.test(r.data.vat_note) && r.data.subscription === null, r.text);
t('seats in use = administrators + agents (the requester is not billed): 2', r.data.seats_in_use === 2, String(r.data.seats_in_use));

r = await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin, json: { seats: 999, plan_id: 'P-EVIL', price: '0.01', quantity: 1, currency: 'ZAR' } });
const approve = r.data && r.data.approve_url;
t('subscribe: returns a PayPal approval link; the customer is sent there to pay', r.status === 200 && /\/approve\/I-MOCK1$/.test(approve || ''), r.text);
let st = await mock('/__mock/state'), req1 = st.subscriptionRequests[0];
t('subscribe: the quantity is the SERVER\'s seat count (2), not the 999 the request tried to send', req1 && req1.quantity === '2' && r.data.seats === 2, JSON.stringify(req1));
t('subscribe: the plan is the configured plan, not the one the request supplied', req1 && req1.plan_id === 'P-MOCKPLAN');
t('subscribe: PayPal is told where to send the customer back to', /\/admin\?billing=return$/.test(req1.application_context.return_url) && /billing=cancelled$/.test(req1.application_context.cancel_url));
r = await call(CONF, 'GET', '/api/billing', { token: C.admin });
t('the subscription is PENDING, not active: paying has not been confirmed by PayPal', r.data.subscription.status === 'pending' && r.data.subscription.seats === 2, r.text);
r = await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });
t('sync while PayPal still says "approval pending" does NOT activate it (a success page alone proves nothing)', r.status === 200 && r.data.subscription.status === 'pending', r.text);
r = await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin });
t('a second subscribe while one is awaiting approval is refused (409)', r.status === 409, r.text);

await mock('/__mock/set', { id: 'I-MOCK1', patch: { status: 'ACTIVE', billing_info: { next_billing_time: '2026-11-13T10:00:00Z', failed_payments_count: 0, last_payment: { amount: { value: '12.65', currency_code: 'USD' }, time: '2026-10-13T10:00:00Z' } } } });
r = await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });
t('once PayPal says ACTIVE, sync activates it, with the next billing date and last payment', r.data.subscription.status === 'active' && r.data.subscription.next_billing_at === '2026-11-13T10:00:00Z' && r.data.subscription.last_payment_amount === '12.65', r.text);
r = await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin });
t('subscribing again while active is refused, with the "cancel then re-subscribe" instruction (409)', r.status === 409 && /cancel it and subscribe again/.test(r.data.error), r.text);

// ================================================================ webhooks
const hdr = (sig = 'VALID-SIGNATURE', drop) => {
  const h = { 'PAYPAL-AUTH-ALGO': 'SHA256withRSA', 'PAYPAL-CERT-URL': 'https://api.paypal.com/cert', 'PAYPAL-TRANSMISSION-ID': 'tx-1', 'PAYPAL-TRANSMISSION-SIG': sig, 'PAYPAL-TRANSMISSION-TIME': '2026-10-13T10:00:00Z' };
  if (drop) delete h[drop]; return h;
};
const hook = (id, type, resource, opt = {}) => call(CONF, 'POST', '/api/billing/webhook', { json: { id, event_type: type, resource }, headers: hdr(opt.sig, opt.drop) });
const status = async () => (await call(CONF, 'GET', '/api/billing', { token: C.admin })).data;

r = await hook('EV-FORGED', 'BILLING.SUBSCRIPTION.CANCELLED', { id: 'I-MOCK1' }, { sig: 'FORGED' });
t('a webhook with a bad signature is refused (400) and changes nothing', r.status === 400 && (await status()).subscription.status === 'active', r.text);
r = await hook('EV-NOHDR', 'BILLING.SUBSCRIPTION.CANCELLED', { id: 'I-MOCK1' }, { drop: 'PAYPAL-TRANSMISSION-SIG' });
t('a webhook missing signature headers is refused (400)', r.status === 400 && (await status()).subscription.status === 'active');
r = await call(CONF, 'POST', '/api/billing/webhook', { raw: '{nope', headers: hdr() });
t('a webhook with a broken body is refused (400)', r.status === 400);
r = await call(CONF, 'POST', '/api/billing/webhook', { json: { hello: 'world' }, headers: hdr() });
t('a request that is not a PayPal event is refused (400)', r.status === 400);
r = await call(CONF, 'POST', '/api/billing/webhook', { raw: JSON.stringify({ id: 'BIG', event_type: 'X', pad: 'x'.repeat(70000) }), headers: hdr() });
t('an oversize webhook is refused (413)', r.status === 413);

const sale = (saleId, amt = '12.65') => ({ id: saleId, billing_agreement_id: 'I-MOCK1', amount: { total: amt, currency: 'USD' }, create_time: '2026-10-13T10:00:05Z' });
r = await hook('EV-PAY-1', 'PAYMENT.SALE.COMPLETED', sale('SALE-1'));
let b = await status();
t('a genuine payment event is accepted and recorded in the billing history (US$12.65)', r.status === 200 && b.payments.length === 1 && b.payments[0].id === 'SALE-1' && b.payments[0].amount === '12.65' && b.payments[0].currency === 'USD', JSON.stringify(b.payments));
r = await hook('EV-PAY-1', 'PAYMENT.SALE.COMPLETED', sale('SALE-1'));
t('the SAME event delivered again is acknowledged as a duplicate and does nothing', r.status === 200 && r.data.duplicate === true && (await status()).payments.length === 1, r.text);
r = await hook('EV-PAY-1B', 'PAYMENT.SALE.COMPLETED', sale('SALE-1'));
t('the same payment under a different event id is still recorded only once', r.status === 200 && (await status()).payments.length === 1);
r = await hook('EV-PAY-2', 'PAYMENT.SALE.COMPLETED', sale('SALE-2', '12.65'));
t('a second, different payment is added (history now has 2)', (await status()).payments.length === 2);

r = await hook('EV-FAIL', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', { id: 'I-MOCK1', billing_info: { failed_payments_count: 1 } });
b = await status();
t('a failed payment marks the subscription past due, with the failure count', b.subscription.status === 'past_due' && b.subscription.failed_payments === 1, JSON.stringify(b.subscription));
r = await hook('EV-PAY-3', 'PAYMENT.SALE.COMPLETED', sale('SALE-3'));
b = await status();
t('a later successful payment returns it to active and clears the failures', b.subscription.status === 'active' && b.subscription.failed_payments === 0, JSON.stringify(b.subscription));
r = await hook('EV-SUSP', 'BILLING.SUBSCRIPTION.SUSPENDED', { id: 'I-MOCK1' });
t('a suspension event suspends it', (await status()).subscription.status === 'suspended');
// An activation event is confirmed with PayPal itself, so PayPal's state is what must carry the new date.
await mock('/__mock/set', { id: 'I-MOCK1', patch: { status: 'ACTIVE', billing_info: { next_billing_time: '2026-12-13T10:00:00Z', failed_payments_count: 0 } } });
r = await hook('EV-REACT', 'BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-MOCK1' });
b = await status();
t('an activation event is confirmed with PayPal, re-activates it and takes the next billing date from PayPal\'s own record', b.subscription.status === 'active' && b.subscription.next_billing_at === '2026-12-13T10:00:00Z');
r = await hook('EV-UNKNOWN', 'BILLING.SUBSCRIPTION.CANCELLED', { id: 'I-SOMEONE-ELSE' });
t('a genuine event about a subscription we do not know is acknowledged and ignored', r.status === 200 && (await status()).subscription.status === 'active');
r = await hook('EV-ODD', 'CUSTOMER.DISPUTE.CREATED', { id: 'I-MOCK1' });
t('an event type we do not use is acknowledged and ignored', r.status === 200 && (await status()).subscription.status === 'active');

// ================================================================ seats vs paid
await call(CONF, 'POST', '/api/users', { token: C.admin, json: { name: 'Agent Bo', email: 'bo@bill.test', password: 'Str0ng-pass-4', role: 'agent' } });
b = await status();
t('adding a third agent shows 3 in use against 2 paid (re-subscribing is how seats change)', b.seats_in_use === 3 && b.subscription.seats === 2);

// ================================================================ cancel, then re-subscribe with the new seat count
r = await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
t('cancelling asks PayPal to cancel, then confirms the result with PayPal: status cancelled, request time recorded', r.status === 200 && r.data.subscription.status === 'cancelled' && !!r.data.subscription.cancel_requested_at, r.text);
t('PayPal really was told to cancel (its record says CANCELLED)', (await mock('/__mock/set', { id: 'I-MOCK1', patch: {} })).status === 'CANCELLED');
r = await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
t('cancelling again is refused (409): nothing is active', r.status === 409);
r = await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin });
st = await mock('/__mock/state');
t('re-subscribing is allowed after cancelling, now with 3 seats', r.status === 200 && /I-MOCK2$/.test(r.data.approve_url) && st.subscriptionRequests[1].quantity === '3', r.text);
b = await status();
t('the new subscription is the current one (pending, 3 seats) and the old payment history is not shown against it', b.subscription.status === 'pending' && b.subscription.seats === 3 && b.payments.length === 0, JSON.stringify(b));

// ================================================================ regions: South Africa (VAT added) / international (no VAT)
const nowIsoPlus = (d) => new Date(Date.now() + d * 86400000).toISOString();
const newestSub = async () => `I-MOCK${(await mock('/__mock/state')).subscriptionRequests.length}`;
const sale2 = (subId, saleId, amt = '12.65') => ({ id: saleId, billing_agreement_id: subId, amount: { total: amt, currency: 'USD' }, create_time: new Date().toISOString() });
r = await call(CONF, 'GET', '/api/billing', { token: C.admin });
t('the international plan is offered because it is configured (regions: ZA, INTL)', JSON.stringify(r.data.regions) === '["ZA","INTL"]', r.text);
t('the subscription record says which region it is for (ZA)', r.data.subscription.region === 'ZA');
r = await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin, json: { region: 'MARS' } });
t('an unknown region is refused (400)', r.status === 400, r.text);
await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
r = await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin, json: { region: 'INTL' } });
st = await mock('/__mock/state');
t('international: the INTERNATIONAL plan is used (no VAT added), with the server\'s seat count (3)', r.status === 200 && r.data.region === 'INTL' && st.subscriptionRequests.at(-1).plan_id === 'P-MOCKINTL' && st.subscriptionRequests.at(-1).quantity === '3', JSON.stringify(st.subscriptionRequests.at(-1)));
t('...and the record says INTL', (await status()).subscription.region === 'INTL');
await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
r = await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin });
st = await mock('/__mock/state');
t('no region given: the South African plan (VAT added) is the default, the safe choice', r.status === 200 && r.data.region === 'ZA' && st.subscriptionRequests.at(-1).plan_id === 'P-MOCKPLAN');
const pp = await import('../src/lib/paypal.js');
t('without the international plan configured: only ZA is offered and INTL has no plan', JSON.stringify(pp.availableRegions({ PAYPAL_PLAN_ID: 'P-A' })) === '["ZA"]' && pp.planFor({ PAYPAL_PLAN_ID: 'P-A' }, 'INTL') === null && pp.planFor({ PAYPAL_PLAN_ID: 'P-A' }, 'ZA') === 'P-A');

// ================================================================ free trial (PayPal runs it; we reflect it)
let cur = await newestSub();
const trialEnd = nowIsoPlus(25);
await mock('/__mock/set', { id: cur, patch: { status: 'ACTIVE', billing_info: { next_billing_time: trialEnd, failed_payments_count: 0, cycle_executions: [{ tenure_type: 'TRIAL', sequence: 1, cycles_completed: 0, cycles_remaining: 1, total_cycles: 1 }] } } });
r = await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });
t('trial: PayPal ACTIVE with a trial cycle still to run -> in_trial is true and the trial end date is the next billing date', r.data.subscription.status === 'active' && r.data.subscription.in_trial === true && r.data.subscription.trial_ends_at === trialEnd, r.text);
t('trial: what is "paid through" runs to the end of the trial (the free period is honoured)', r.data.subscription.paid_through === trialEnd);
r = await hook('EV-TRIAL-PAY', 'PAYMENT.SALE.COMPLETED', sale2(cur, 'SALE-T1'));
b = await status();
t('trial: the first real payment ends the trial (conversion): in_trial false', b.subscription.in_trial === false && b.subscription.trial_ends_at === null && b.payments.some((p) => p.id === 'SALE-T1'), JSON.stringify(b.subscription));
// a trial confirmed by the webhook alone (no browser return): the app asks PayPal for the full picture
await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin });
cur = await newestSub();
await mock('/__mock/set', { id: cur, patch: { status: 'ACTIVE', billing_info: { next_billing_time: nowIsoPlus(30), failed_payments_count: 0, cycle_executions: [{ tenure_type: 'TRIAL', sequence: 1, cycles_completed: 0, cycles_remaining: 1, total_cycles: 1 }] } } });
r = await hook('EV-ACT-TRIAL', 'BILLING.SUBSCRIPTION.ACTIVATED', { id: cur });
b = await status();
t('trial: an ACTIVATED webhook alone is enough: the app confirms with PayPal and records active + in_trial', b.subscription.status === 'active' && b.subscription.in_trial === true, JSON.stringify(b.subscription));

// ================================================================ subscription enforcement (off by default)
const asUser = async (email) => (await call(CONF, 'GET', '/api/users', { token: C.admin })).data.find((u) => u.email === email);
r = await call(CONF, 'GET', '/api/billing/access', { token: C.requester });
t('anyone signed in can see the access state; enforcement starts OFF and the workspace is writable', r.status === 200 && r.data.enforce === false && r.data.writable === true, r.text);
t('...but an anonymous visitor cannot (401)', (await call(CONF, 'GET', '/api/billing/access')).status === 401);
const addUser = (name, email, role) => call(CONF, 'POST', '/api/users', { token: C.admin, json: { name, email, password: 'Str0ng-pass-9', role } });
r = await addUser('Dee', 'dee@bill.test', 'agent');
t('enforcement OFF: more agents than are paid for are still allowed (4th agent, 3 paid)', r.status === 201, r.text);
const dee = r.data;
await call(CONF, 'PUT', `/api/users/${dee.id}`, { token: C.admin, json: { is_active: false } });
t('an agent cannot switch enforcement on (403)', (await call(CONF, 'PUT', '/api/billing/enforcement', { token: C.agent, json: { enabled: true } })).status === 403);
t('a non-boolean value is refused (400)', (await call(CONF, 'PUT', '/api/billing/enforcement', { token: C.admin, json: { enabled: 'yes' } })).status === 400);
t('enforcement cannot be switched on where billing is not set up (503)', (await call(UNCONF, 'PUT', '/api/billing/enforcement', { token: U.admin, json: { enabled: true } })).status === 503);
const incId = (await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Before enforcement', description: 'x' } })).data.id;
r = await call(CONF, 'PUT', '/api/billing/enforcement', { token: C.admin, json: { enabled: true } });
t('the administrator switches enforcement on; the workspace is still writable because the subscription is active', r.status === 200 && r.data.enforce === true && r.data.writable === true && r.data.status === 'active', r.text);

r = await addUser('Eve', 'eve@bill.test', 'agent');
t('seat limit: a 4th agent is refused (402, code seat_limit) with the "cancel and subscribe again" instruction', r.status === 402 && r.data.code === 'seat_limit' && /cancel the subscription and subscribe again/.test(r.data.error), r.text);
r = await addUser('Req Two', 'req2@bill.test', 'requester');
t('seat limit: requesters are free, so adding one is still allowed', r.status === 201, r.text);
const req2 = r.data;
r = await call(CONF, 'PUT', `/api/users/${req2.id}`, { token: C.admin, json: { role: 'agent' } });
t('seat limit: promoting a requester to agent is refused (402)', r.status === 402 && r.data.code === 'seat_limit', r.text);
r = await call(CONF, 'PUT', `/api/users/${dee.id}`, { token: C.admin, json: { is_active: true } });
t('seat limit: re-activating a deactivated agent is refused (402)', r.status === 402, r.text);
const bo = await asUser('bo@bill.test');
await call(CONF, 'PUT', `/api/users/${bo.id}`, { token: C.admin, json: { is_active: false } });
r = await addUser('Eve', 'eve@bill.test', 'agent');
t('seat limit: after deactivating one agent, another can be added (a swap keeps the count at 3)', r.status === 201, r.text);
r = await call(CONF, 'PUT', `/api/users/${bo.id}`, { token: C.admin, json: { name: 'Agent Bo (renamed)' } });
t('seat limit: editing a deactivated person without re-activating them is fine', r.status === 200, r.text);

// lapse: SUSPENDED with a grace period of 0 days (this test server sets BILLING_GRACE_DAYS=0)
await mock('/__mock/set', { id: cur, patch: { status: 'SUSPENDED' } });
r = await hook('EV-LAPSE', 'BILLING.SUBSCRIPTION.SUSPENDED', { id: cur });
const lapsedMsg = (x) => x.status === 402 && x.data && x.data.code === 'subscription_lapsed';
t('lapsed: creating a ticket is refused (402, subscription_lapsed)', lapsedMsg(await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Blocked', description: 'x' } })));
t('lapsed: updating a ticket is refused', lapsedMsg(await call(CONF, 'PUT', `/api/incidents/${incId}`, { token: C.agent, json: { status: 'in_progress' } })));
t('lapsed: commenting is refused', lapsedMsg(await call(CONF, 'POST', `/api/incidents/${incId}/comments`, { token: C.agent, json: { content: 'hi' } })));
t('lapsed: creating a user is refused', lapsedMsg(await addUser('Fay', 'fay@bill.test', 'requester')));
t('lapsed: READING still works (ticket list and detail)', (await call(CONF, 'GET', '/api/incidents', { token: C.agent })).status === 200 && (await call(CONF, 'GET', `/api/incidents/${incId}`, { token: C.agent })).status === 200);
r = await call(CONF, 'GET', '/api/incidents/export', { token: C.admin });
t('lapsed: exporting to CSV still works (people can always take their data)', r.status === 200 && /Number/.test(r.text));
t('lapsed: signing in still works', (await call(CONF, 'POST', '/api/auth/login', { json: { email: 'rob@bill.test', password: 'Str0ng-pass-3' } })).status === 200);
t('lapsed: the public demo/waitlist form still works', (await call(CONF, 'POST', '/api/leads', { json: { name: 'Lead', email: 'lead@x.co', company: 'X', consent: true } })).status === 201);
r = await call(CONF, 'GET', '/api/billing/access', { token: C.requester });
t('lapsed: the access state tells every signed-in person why (suspended, lapsed, not writable)', r.data.writable === false && r.data.status === 'suspended' && r.data.reason === 'lapsed', r.text);
r = await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });
t('lapsed: the administrator can still reach billing (sync works and shows suspended)', r.status === 200 && r.data.subscription.status === 'suspended', r.text);
await mock('/__mock/set', { id: cur, patch: { status: 'ACTIVE', billing_info: { next_billing_time: nowIsoPlus(30), failed_payments_count: 0 } } });
r = await hook('EV-RECOVER', 'BILLING.SUBSCRIPTION.ACTIVATED', { id: cur });
t('recovery: PayPal reports it ACTIVE again -> the workspace is writable again', (await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Back', description: 'x' } })).status === 201);

// cancelled but paid for the rest of the period: keep working until it ends
await mock('/__mock/set', { id: cur, patch: { status: 'ACTIVE', billing_info: { next_billing_time: nowIsoPlus(10), failed_payments_count: 0 } } });
await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });
r = await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
t('cancelled with 10 days still paid for: status is cancelled', r.data.subscription.status === 'cancelled', r.text);
r = await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Still paid', description: 'x' } });
t('...and the workspace stays writable until the paid period ends (as the terms promise)', r.status === 201, r.text);
r = await call(CONF, 'GET', '/api/billing/access', { token: C.agent });
t('...the access state shows the reason and the date it runs to', r.data.writable === true && r.data.reason === 'paid_through' && Math.abs(Date.parse(r.data.until) - (Date.now() + 10 * 86400000)) < 3 * 86400000, r.text);
// re-subscribe, activate, then let PayPal's paid-through date be in the PAST before cancelling
await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin });
cur = await newestSub();
await mock('/__mock/set', { id: cur, patch: { status: 'ACTIVE', billing_info: { next_billing_time: nowIsoPlus(-1), failed_payments_count: 0 } } });
await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });
await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
t('cancelled with the paid period already over: the workspace is read-only', lapsedMsg(await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Too late', description: 'x' } })));
// the loophole: starting a new subscription and not paying must not restore access
await call(CONF, 'POST', '/api/billing/subscribe', { token: C.admin });
cur = await newestSub();
t('a NEW subscription that is only pending does not restore access (no free ride by starting one)', lapsedMsg(await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Loophole', description: 'x' } })));
await mock('/__mock/set', { id: cur, patch: { status: 'ACTIVE', billing_info: { next_billing_time: nowIsoPlus(30), failed_payments_count: 0 } } });
await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });
t('...once PayPal confirms it, access returns', (await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Paid', description: 'x' } })).status === 201);
// the switch: with enforcement OFF nothing is restricted, even when lapsed
await mock('/__mock/set', { id: cur, patch: { status: 'ACTIVE', billing_info: { next_billing_time: nowIsoPlus(-2), failed_payments_count: 0 } } });
await call(CONF, 'POST', '/api/billing/sync', { token: C.admin });   // PayPal says the paid period ended 2 days ago
await call(CONF, 'POST', '/api/billing/cancel', { token: C.admin });
t('(lapsed again, enforcement on) writes are refused', lapsedMsg(await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'x', description: 'x' } })));
r = await call(CONF, 'PUT', '/api/billing/enforcement', { token: C.admin, json: { enabled: false } });
t('the administrator can switch enforcement off, and then nothing is restricted even though it is lapsed', r.status === 200 && r.data.enforce === false && r.data.entitled === false && (await call(CONF, 'POST', '/api/incidents', { token: C.requester, json: { title: 'Off', description: 'x' } })).status === 201, r.text);
t('seat limits also stop when enforcement is off', (await addUser('Gus', 'gus@bill.test', 'agent')).status === 201);

// ================================================================ the plan-setup script
const run = (args, env = {}, script = 'paypal-setup.mjs') => { try { return { code: 0, out: execFileSync('node', [`cloudflare/scripts/${script}`, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; } };
const cred = { PAYPAL_CLIENT_ID: 'mock-client', PAYPAL_CLIENT_SECRET: 'mock-secret' };
t('setup script: refuses to run without credentials', run(['--price', '11.00', '--api-base', MOCK], { PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' }).code === 2);
t('setup script: refuses to run without a price, or with a nonsense price', run(['--api-base', MOCK], cred).code === 2 && run(['--price', 'cheap', '--api-base', MOCK], cred).code === 2 && run(['--price', '-5', '--api-base', MOCK], cred).code === 2);
t('setup script: refuses wrong credentials (PayPal says 401, nothing is created)', run(['--price', '11.00', '--api-base', MOCK], { PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'y' }).code === 1 && (await mock('/__mock/state')).plans.length === 0);
const ok = run(['--price', '11.00', '--api-base', MOCK], cred);
const plan = (await mock('/__mock/state')).plans[0] || {};
t('setup script: creates the plan and prints its id', ok.code === 0 && /P-MOCKPLAN/.test(ok.out), ok.out);
const cyc = (plan.billing_cycles || [])[0] || {};
t('setup script: plan is monthly, in US dollars, US$11.00 per unit, per-agent quantities supported', plan.quantity_supported === true && cyc.frequency?.interval_unit === 'MONTH' && cyc.frequency?.interval_count === 1 && cyc.pricing_scheme?.fixed_price?.value === '11.00' && cyc.pricing_scheme?.fixed_price?.currency_code === 'USD', JSON.stringify(plan));
t('setup script: VAT is 15%, added on top (not inside the price)', plan.taxes && plan.taxes.percentage === '15' && plan.taxes.inclusive === false, JSON.stringify(plan.taxes));
t('setup script: by default it uses the sandbox and says so (it never mentions LIVE)', ok.code === 0 && /sandbox/.test(ok.out) && !/LIVE/.test(ok.out.split('PAYPAL_ENV')[0].replace(/PAYPAL_ENV.*/s, '')), ok.out);
const plansBefore = (await mock('/__mock/state')).plans.length;
const liveTry = run(['--price', '11.00', '--live'], cred);   // no confirmation is typed, so it must stop before touching PayPal
t('setup script: --live without typing LIVE is refused and creates nothing', liveTry.code !== 0 && !/Created on PayPal/.test(liveTry.out) && (await mock('/__mock/state')).plans.length === plansBefore, `${liveTry.code} ${liveTry.out}`);

// trial and international options of the setup script
const tr = run(['--price', '11.00', '--trial-months', '1', '--api-base', MOCK], cred);
const trPlan = (await mock('/__mock/state')).plans.at(-1) || {};
t('setup script --trial-months 1: a free first month at US$0, then the paid monthly cycle (sequence 2, US$11.00)', tr.code === 0 && trPlan.billing_cycles?.[0]?.tenure_type === 'TRIAL' && trPlan.billing_cycles[0].pricing_scheme.fixed_price.value === '0' && trPlan.billing_cycles[0].frequency.interval_count === 1 && trPlan.billing_cycles[1]?.tenure_type === 'REGULAR' && trPlan.billing_cycles[1].sequence === 2 && trPlan.billing_cycles[1].pricing_scheme.fixed_price.value === '11.00', JSON.stringify(trPlan.billing_cycles));
t('setup script: the trial plan still carries 15% VAT', trPlan.taxes?.percentage === '15');
const intl = run(['--price', '11.00', '--region', 'intl', '--api-base', MOCK], cred);
const intlPlan = (await mock('/__mock/state')).plans.at(-1) || {};
t('setup script --region intl: no VAT is added (no tax block), and it is named international', intl.code === 0 && intlPlan.taxes === undefined && /international/i.test(intlPlan.name), JSON.stringify(intlPlan));
t('setup script --region intl: tells you to store it as PAYPAL_PLAN_ID_INTL', /PAYPAL_PLAN_ID_INTL/.test(intl.out), intl.out);
t('setup script: rejects an unknown region and nonsense trial lengths', run(['--price', '11.00', '--region', 'mars', '--api-base', MOCK], cred).code === 2 && run(['--price', '11.00', '--trial-months', '13', '--api-base', MOCK], cred).code === 2 && run(['--price', '11.00', '--trial-months', '-1', '--api-base', MOCK], cred).code === 2 && run(['--price', '11.00', '--trial-months', '1.5', '--api-base', MOCK], cred).code === 2);

// the sandbox verification script (here against the mock; the owner runs it against PayPal's sandbox)
const sbArgs = (extra = []) => ['--plan-id', 'P-MOCKPLAN', '--webhook-id', 'WH-MOCK', '--api-base', MOCK, ...extra];
const sbOk = run(sbArgs(['--plan-id-intl', 'P-MOCKINTL']), cred, 'paypal-sandbox-check.mjs');
t('sandbox check: a correct set-up reports READY, with both plans, the webhook and the forged-webhook test passing', sbOk.code === 0 && /READY FOR THE BUYER STEPS/.test(sbOk.out) && /PASS .*15% VAT is added/.test(sbOk.out) && /PASS .*no VAT is added/.test(sbOk.out) && /PASS .*subscribed to all six events/.test(sbOk.out) && /PASS .*rejected a forged webhook/.test(sbOk.out), sbOk.out);
t('sandbox check: it prints the buyer approval link for the manual steps and says it cannot approve itself', /approve with your sandbox buyer/.test(sbOk.out));
const sbHook = run(['--plan-id', 'P-MOCKPLAN', '--webhook-id', 'WH-WRONG', '--api-base', MOCK], cred, 'paypal-sandbox-check.mjs');
t('sandbox check: a webhook id that is not registered FAILS with a clear message', sbHook.code === 1 && /FAIL .*not registered/.test(sbHook.out), sbHook.out);
const sbQty = run(['--plan-id', 'P-NOQTY', '--webhook-id', 'WH-MOCK', '--api-base', MOCK], cred, 'paypal-sandbox-check.mjs');
t('sandbox check: a plan that cannot bill per agent FAILS', sbQty.code === 1 && /FAIL .*quantities/.test(sbQty.out), sbQty.out);
const sbMissing = run(['--plan-id', 'P-DOES-NOT-EXIST', '--webhook-id', 'WH-MOCK', '--api-base', MOCK], cred, 'paypal-sandbox-check.mjs');
t('sandbox check: a plan id that does not exist FAILS', sbMissing.code === 1 && /FAIL .*not found/.test(sbMissing.out));
t('sandbox check: wrong credentials FAIL before anything else', run(sbArgs(), { PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'y' }, 'paypal-sandbox-check.mjs').code === 1);
t('sandbox check: it refuses to run against the live system (--live)', run(sbArgs(['--live']), cred, 'paypal-sandbox-check.mjs').code === 2);
t('sandbox check: it needs credentials, a plan id and a webhook id', run(['--api-base', MOCK], cred, 'paypal-sandbox-check.mjs').code === 2);

// ================================================================ nothing secret ever leaves the server
const blob = every.join('\n');
t('no secret, token or credential appears in ANY response from the billing endpoints', !/mock-secret|mock-token|PAYPAL_CLIENT_SECRET|Bearer /.test(blob));

console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} checks`);
process.exit(fail ? 1 : 0);
