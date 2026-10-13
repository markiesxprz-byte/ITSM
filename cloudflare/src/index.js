import { Hono } from 'hono';
import { cors } from 'hono/cors';
import openapiYaml from './openapi.yaml';
import { makeDb } from './lib/db.js';
import { migrate } from './lib/migrate.js';
import { bootstrapDefaults } from './lib/bootstrap.js';

import auth from './routes/auth.js';
import users from './routes/users.js';
import incidents from './routes/incidents.js';
import serviceRequests from './routes/serviceRequests.js';
import problems from './routes/problems.js';
import changes from './routes/changes.js';
import cmdb from './routes/cmdb.js';
import knowledge from './routes/knowledge.js';
import sla from './routes/sla.js';
import dashboard from './routes/dashboard.js';
import leads from './routes/leads.js';
import settings from './routes/settings.js';
import billing from './routes/billing.js';
import { enforcementOn, workspaceAccess } from './lib/entitlement.js';
import { runSlaChecks } from './lib/slacheck.js';

// Only /api/* reaches this Worker (see "run_worker_first" in wrangler.jsonc).
// Everything else — the marketing site and the React app — is served straight from
// Cloudflare's static asset layer with SPA fallback, at no Worker cost.
const app = new Hono();

app.use('/api/*', cors()); // bearer-token auth (no cookies), so open CORS is safe

// Browser protections for every API response: never sniffed, never cached by browsers or shared
// proxies (responses contain customer data), never framed, no referrer leakage.
app.use('/api/*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
});

app.use('/api/*', async (c, next) => {
  const db = makeDb(c.env.DB);
  c.set('db', db);
  await migrate(db);
  await bootstrapDefaults(db);
  await next();
});

// When the administrator has switched subscription enforcement on and a PayPal subscription has lapsed, the workspace is
// read-only: people can still sign in, read, export and sort out billing, but cannot change tickets. Nothing is deleted.
// Customers with no PayPal subscription (for example those invoiced directly) are never affected.
app.use('/api/*', async (c, next) => {
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
  const p = c.req.path;
  if (p.startsWith('/api/auth/') || p.startsWith('/api/billing') || p === '/api/leads') return next();
  const db = c.get('db');
  if (!(await enforcementOn(db))) return next();
  const a = await workspaceAccess(db, c.env);
  if (a.writable) return next();
  return c.json({ error: 'This workspace is read-only because its subscription is no longer in good standing. You can still sign in, read tickets and export them. An administrator can fix this under Administration → Billing.', code: 'subscription_lapsed', until: a.until }, 402);
});

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'itsm-worker' }));

// --- API documentation (Swagger UI loaded from a CDN; the spec is served from here) ---
app.get('/api/openapi.yaml', (c) => c.body(openapiYaml, 200, { 'Content-Type': 'text/yaml' }));
app.get('/api/docs', (c) =>
  c.html(`<!doctype html><html><head><meta charset="utf-8"><title>Infovantage ITSM API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/api/openapi.yaml', dom_id: '#ui' });</script></body></html>`));

app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/incidents', incidents);
app.route('/api/service-requests', serviceRequests);
app.route('/api/problems', problems);
app.route('/api/changes', changes);
app.route('/api/cmdb', cmdb);
app.route('/api/knowledge', knowledge);
app.route('/api/sla', sla);
app.route('/api/dashboard', dashboard);
app.route('/api/leads', leads);
app.route('/api/settings', settings);
app.route('/api/billing', billing);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

// A Cron Trigger (see wrangler.jsonc) runs the SLA checker every five minutes.
export default {
  fetch: app.fetch,
  scheduled: (event, env, ctx) => {
    ctx.waitUntil(runSlaChecks(env).then((r) => console.log('[sla-check]', JSON.stringify(r))).catch((e) => console.error('[sla-check] failed:', e && e.message)));
  },
};
