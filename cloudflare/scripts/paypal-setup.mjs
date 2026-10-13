// One-off setup: creates the PayPal product and the monthly per-agent plan, and prints the plan id to store as
// the PAYPAL_PLAN_ID secret. Runs on YOUR computer with YOUR credentials; nothing is stored.
//
//   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node cloudflare/scripts/paypal-setup.mjs --price 11.00
//
//   --price <amount>   price per agent per month, in US dollars, EXCLUDING VAT   (required)
//   --vat <percent>    VAT added on top (default 15 for South Africa, 0 for international)
//   --region <za|intl> za = the plan for South African customers (VAT added); intl = the plan for everyone else (no VAT added). Run it once for each.
//   --trial-months <n> start with n free months (0 = no trial). PayPal runs the trial and starts charging automatically afterwards.
//   --live             use PayPal's LIVE system (default is the sandbox). Asks you to type LIVE to confirm.
//   --api-base <url>   test hook: talk to a different server (used by the automated tests)
import readline from 'node:readline/promises';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const price = arg('price'), region = (arg('region', 'za') || 'za').toLowerCase(), vat = arg('vat', region === 'intl' ? '0' : '15'), trial = Number(arg('trial-months', '0')), live = process.argv.includes('--live');
const base = (arg('api-base') || (live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')).replace(/\/$/, '');
const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;

if (!id || !secret) { console.error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first.'); process.exit(2); }
if (!price || !/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0) { console.error('Give the monthly price per agent in US dollars, e.g. --price 11.00'); process.exit(2); }
if (!/^\d+(\.\d+)?$/.test(vat) || Number(vat) < 0 || Number(vat) > 100) { console.error('--vat must be a percentage such as 15'); process.exit(2); }
if (region !== 'za' && region !== 'intl') { console.error('--region must be za or intl'); process.exit(2); }
if (!Number.isInteger(trial) || trial < 0 || trial > 12) { console.error('--trial-months must be a whole number from 0 to 12'); process.exit(2); }
if (live && !arg('api-base')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('This will create a plan on PayPal\'s LIVE system. Type LIVE to continue: ');
  rl.close();
  if (answer.trim() !== 'LIVE') { console.error('Cancelled. Nothing was created.'); process.exit(1); }
}

async function api(method, path, body, token, basic) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: basic ? `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` : `Bearer ${token}`, 'Content-Type': basic ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: body === undefined ? undefined : (basic ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`PayPal said ${res.status} for ${method} ${path}: ${text.slice(0, 300)}`); process.exit(1); }
  return text ? JSON.parse(text) : null;
}

const token = (await api('POST', '/v1/oauth2/token', 'grant_type=client_credentials', null, true)).access_token;
const product = await api('POST', '/v1/catalogs/products', { name: 'Infovantage ITSM', description: 'IT incident and ticket management, per agent per month', type: 'SERVICE', category: 'SOFTWARE' }, token);
const plan = await api('POST', '/v1/billing/plans', {
  product_id: product.id,
  name: `Infovantage ITSM Starter - per agent per month (${region === 'intl' ? 'international' : 'South Africa'})${trial ? ` - ${trial}-month free trial` : ''}`,
  description: `Monthly subscription, charged per billable agent. ${Number(vat) > 0 ? `${vat}% VAT is added on top.` : 'No VAT is added; the customer is responsible for any taxes in their own country.'}`,
  status: 'ACTIVE',
  quantity_supported: true,
  billing_cycles: [
    // A free trial is a first billing cycle at zero. PayPal runs it, then starts the paid cycle on its own.
    ...(trial ? [{ frequency: { interval_unit: 'MONTH', interval_count: trial }, tenure_type: 'TRIAL', sequence: 1, total_cycles: 1, pricing_scheme: { fixed_price: { value: '0', currency_code: 'USD' } } }] : []),
    { frequency: { interval_unit: 'MONTH', interval_count: 1 }, tenure_type: 'REGULAR', sequence: trial ? 2 : 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: Number(price).toFixed(2), currency_code: 'USD' } } },
  ],
  payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
  ...(Number(vat) > 0 ? { taxes: { percentage: String(vat), inclusive: false } } : {}),
}, token);
console.log(`\nCreated on PayPal's ${live ? 'LIVE' : 'sandbox'} system.\n  Product: ${product.id}\n  Plan:    ${plan.id}   (US$${Number(price).toFixed(2)} per agent per month${Number(vat) > 0 ? ` + ${vat}% VAT` : ', no VAT added'}${trial ? `, ${trial}-month free trial first` : ''})\n  For:     ${region === 'intl' ? 'international customers' : 'South African customers'}\n`);
console.log('Next: store these as Cloudflare secrets for the itsm Worker (never in GitHub):');
console.log(`  ${region === 'intl' ? 'PAYPAL_PLAN_ID_INTL' : 'PAYPAL_PLAN_ID'} = ${plan.id}`);
console.log('  (plus PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID, from your PayPal developer dashboard)');
console.log(live ? '  PAYPAL_ENV = live' : '  (leave PAYPAL_ENV unset: the Worker uses the sandbox)');
