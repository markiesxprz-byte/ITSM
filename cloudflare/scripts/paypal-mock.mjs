// A tiny stand-in for PayPal's REST API, used only by the automated tests. It checks the things the real service checks
// (credentials, bearer token, webhook signature) and lets a test change a subscription's state.
//   node cloudflare/scripts/paypal-mock.mjs <port>
import http from 'node:http';
const PORT = Number(process.argv[2] || 8902);
const CLIENT = 'mock-client', SECRET = 'mock-secret', WEBHOOK = 'WH-MOCK';
const subs = {}; const recorded = { plans: [], products: [], subscriptionRequests: [], tokenRequests: 0, verifyRequests: 0 };
let n = 0;
const send = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(data === null ? '' : JSON.stringify(data)); };
const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const raw = await readBody(req);
  let body = {}; try { body = raw && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch { /* leave empty */ }
  const path = url.pathname;
  // test controls
  if (path === '/__mock/state') return send(res, 200, recorded);
  if (path === '/__mock/set' && req.method === 'POST') { Object.assign(subs[body.id] ||= {}, body.patch); return send(res, 200, subs[body.id]); }

  if (path === '/v1/oauth2/token') {
    recorded.tokenRequests++;
    const ok = req.headers.authorization === `Basic ${Buffer.from(`${CLIENT}:${SECRET}`).toString('base64')}` && raw === 'grant_type=client_credentials';
    return ok ? send(res, 200, { access_token: 'mock-token', expires_in: 3600 }) : send(res, 401, { error: 'invalid_client' });
  }
  if (req.headers.authorization !== 'Bearer mock-token') return send(res, 401, { name: 'AUTHENTICATION_FAILURE' });

  if (path === '/v1/catalogs/products' && req.method === 'POST') { recorded.products.push(body); return send(res, 201, { id: 'PROD-MOCK' }); }
  if (path === '/v1/billing/plans' && req.method === 'POST') { recorded.plans.push(body); return send(res, 201, { id: 'P-MOCKPLAN', status: 'ACTIVE' }); }
  let pm = path.match(/^\/v1\/billing\/plans\/([^/]+)$/);
  if (pm && req.method === 'GET') {   // plan lookup: P-MOCKPLAN (South Africa, 15% VAT), P-MOCKINTL (no VAT), P-NOQTY (a bad plan)
    const base = { status: 'ACTIVE', quantity_supported: true, billing_cycles: [{ tenure_type: 'REGULAR', sequence: 1, frequency: { interval_unit: 'MONTH', interval_count: 1 }, pricing_scheme: { fixed_price: { value: '11.00', currency_code: 'USD' } } }] };
    if (pm[1] === 'P-MOCKPLAN') return send(res, 200, { id: pm[1], ...base, taxes: { percentage: '15', inclusive: false } });
    if (pm[1] === 'P-MOCKINTL') return send(res, 200, { id: pm[1], ...base });
    if (pm[1] === 'P-NOQTY') return send(res, 200, { id: pm[1], ...base, quantity_supported: false, taxes: { percentage: '15', inclusive: false } });
    return send(res, 404, { name: 'RESOURCE_NOT_FOUND' });
  }
  if (path === '/v1/notifications/webhooks' && req.method === 'GET') {
    return send(res, 200, { webhooks: [{ id: WEBHOOK, url: 'https://itsm.example/api/billing/webhook', event_types: ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'PAYMENT.SALE.COMPLETED'].map((name) => ({ name })) }] });
  }
  if (path === '/v1/billing/subscriptions' && req.method === 'POST') {
    recorded.subscriptionRequests.push(body);
    const id = `I-MOCK${++n}`;
    subs[id] = { id, status: 'APPROVAL_PENDING', plan_id: body.plan_id, quantity: body.quantity, billing_info: { failed_payments_count: 0 } };
    return send(res, 201, { id, status: 'APPROVAL_PENDING', links: [{ rel: 'approve', href: `http://localhost:${PORT}/approve/${id}`, method: 'GET' }] });
  }
  let m = path.match(/^\/v1\/billing\/subscriptions\/([^/]+)(\/cancel)?$/);
  if (m) {
    const sub = subs[m[1]];
    if (!sub) return send(res, 404, { name: 'RESOURCE_NOT_FOUND' });
    if (m[2] && req.method === 'POST') { sub.status = 'CANCELLED'; return send(res, 204, null); }
    if (req.method === 'GET') return send(res, 200, sub);
  }
  if (path === '/v1/notifications/verify-webhook-signature' && req.method === 'POST') {
    recorded.verifyRequests++;
    const good = body.transmission_sig === 'VALID-SIGNATURE' && body.webhook_id === WEBHOOK && body.auth_algo && body.cert_url && body.transmission_id && body.transmission_time && body.webhook_event;
    return send(res, 200, { verification_status: good ? 'SUCCESS' : 'FAILURE' });
  }
  send(res, 404, { name: 'NOT_FOUND', path });
}).listen(PORT, () => console.log(`paypal mock on ${PORT}`));
