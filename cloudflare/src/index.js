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

// Only /api/* reaches this Worker (see "run_worker_first" in wrangler.jsonc).
// Everything else — the marketing site and the React app — is served straight from
// Cloudflare's static asset layer with SPA fallback, at no Worker cost.
const app = new Hono();

app.use('/api/*', cors()); // bearer-token auth (no cookies), so open CORS is safe

app.use('/api/*', async (c, next) => {
  const db = makeDb(c.env.DB);
  c.set('db', db);
  await migrate(db);
  await bootstrapDefaults(db);
  await next();
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

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
