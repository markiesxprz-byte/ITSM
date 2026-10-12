# Infovantage ITSM

IT service management for small and mid-size teams: **Incidents, Service Requests, Problems, Changes, a CMDB, a Knowledge Base and SLA tracking**, plus a public marketing site with trial signup. It runs entirely on **Cloudflare**:

- **API** — one Cloudflare Worker ([Hono](https://hono.dev)), using the Workers runtime (no Node server)
- **Database** — D1 (Cloudflare's SQLite). The Worker creates its own tables on first request; there is no migration step.
- **Website + app UI** — the React frontend, served as static assets with SPA fallback. Only `/api/*` runs Worker code.
- **One URL, one deployment.** No servers, containers or proxies, and no environment variables are required.

```
wrangler.jsonc          Cloudflare config (Worker + assets + D1 binding)
package.json            scripts: build, dev, deploy, test:api
cloudflare/
  src/                  the Worker: index.js, routes/ (11 modules), lib/, schema.sql, openapi.yaml
  scripts/              build-web.mjs (bundles the UI), test-api.mjs (+ baseline)
frontend/               React + Vite + Tailwind (marketing site and the app)
```

## What's included

| Module | Capabilities |
|---|---|
| **Incidents** | Log, triage, assign, resolve. P1–P4 priority, SLA response/resolution timers, public comments vs. internal notes, linked configuration items. |
| **Service Requests** | Service catalog with optional approval routing, fulfilment tracking, SLA timers. |
| **Problems** | Root cause, workaround, known-error lifecycle, links to the incidents they explain. |
| **Changes** | Standard / normal / emergency types, risk, approval workflow, implementation and backout plans, scheduling. |
| **CMDB** | Configuration items (servers, applications, databases, network devices, workstations, services), dependencies, related incidents. |
| **Knowledge Base** | Publish and search articles, helpful/not-helpful feedback, drafts visible to staff only. |
| **Administration** | Users and roles, SLA policies, service catalog, trial-lead queue. |
| **Dashboard & CSV** | Open/breached counts, status charts, activity feed; CSV export on every list. |
| **Marketing site** | Landing page, pricing (ZAR/USD, monthly/annual), trial signup. |

**Roles** — `admin` (everything), `agent` (works tickets, problems, changes, CMDB, knowledge base), `requester` (raises and tracks their own tickets; cannot see internal notes or other people's tickets).

## Deploy to Cloudflare

Pick one. All three result in the same thing.

**A. Connect the GitHub repo** (works with private repos; every push to `main` redeploys)
1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → choose the repo.
2. Root directory `/`, build command `npm run build`, deploy command `npx wrangler deploy`.

**B. From a terminal**
```bash
npm install
npx wrangler login
npm run deploy
```

**C. "Deploy to Cloudflare" button** — `https://deploy.workers.cloudflare.com/?url=<public-repo-url>` copies the repo into the visitor's own GitHub and Cloudflare accounts. It needs a **public** repo, which makes the source public; use a separate template repo if that matters.

Cloudflare creates the D1 database from the binding in `wrangler.jsonc` on first deploy. *(This automatic provisioning is from my knowledge of recent Wrangler behaviour and was not tested against a live account. If the first deploy complains about the database, run `npx wrangler d1 create infovantage-itsm` once and paste the printed `database_id` into the `d1_databases` entry in `wrangler.jsonc`.)*

### Immediately after the first deploy
Open the `*.workers.dev` URL and **register your own account at once. The first account created becomes the administrator** — there are no demo accounts, and until you register, anyone who finds the URL could claim it.

On that first request the app seeds default SLA policies, a starter service catalog and a welcome article, and generates its own signing secret (stored in D1). To use your own secret instead: `npx wrangler secret put JWT_SECRET`.

### Customers, domains and cost
- **One customer per deployment.** Each customer gets their own Worker and their own D1 database (change `name` and `database_name` in `wrangler.jsonc` for each). This is cheap, but there is no multi-tenant isolation inside a single database.
- **Custom domains need the domain's DNS on Cloudflare.** If it lives elsewhere (e.g. at your registrar), use the free `workers.dev` address, a separate domain on Cloudflare, or move the whole zone — copying every existing record first, especially MX/SPF/DKIM so email keeps working.
- **Plan for the Workers Paid plan (about US$5/month).** Workers Free allows 10 ms of CPU per request and password hashing costs more than that: PBKDF2 at 100,000 iterations took ~46 ms of raw CPU on the machine I tested on (Cloudflare's hardware differs, but it is very unlikely to be under 10 ms). Sign-in and registration are the endpoints that hash. This comes from my testing plus recollection of Cloudflare's limits — verify on their pricing page.

## Local development
```bash
npm install
npm run dev          # builds the UI and runs the real workerd runtime with a local D1 (http://localhost:8787)
npm run test:api     # in another terminal: 125-step API regression test -> PASS/FAIL
npm run dev:ui       # optional: Vite hot-reload UI on :5173, proxying /api to the local Worker
```
Reset the local database by deleting `.wrangler/state`. `test:api` creates users and tickets and expects an **empty** database — never point it at production.

## Email notifications
Tickets created, assigned, updated, commented on and approved all send email. Workers cannot open SMTP connections, so this uses the [Resend](https://resend.com) HTTP API:
```bash
npx wrangler secret put RESEND_API_KEY
```
and add `"vars": { "FROM_EMAIL": "no-reply@yourdomain" }` (a sender verified in Resend) to `wrangler.jsonc`. Optional: `APP_URL` for links in emails, `NOTIFICATIONS_ENABLED=false` to switch emails off. With no key, emails are written to the Worker log instead and everything else keeps working.

## Marketing site and trial signups
`/` landing page, `/pricing`, `/start` trial form. The app itself lives at `/login` and `/dashboard`.

Submitting `/start` stores a row in the `leads` table and emails the submitter a confirmation. **Nothing is provisioned automatically.** Admins work the queue in **Administration → Trial Leads** (`new → contacted → provisioned → closed`) and stand up each customer's deployment by hand. Don't collect payment until that step is fast and reliable.

## API documentation
`/api/docs` serves interactive Swagger UI (loaded from a public CDN) for every endpoint; the raw spec is at `/api/openapi.yaml`.

## Security notes
1. **Password hashing is capped by the platform.** Workers allows at most 100,000 PBKDF2 iterations, below OWASP's current recommendation (600,000). Add a Cloudflare **rate-limiting rule** (and ideally Turnstile) on `/api/auth/*` to compensate.
2. **No built-in rate limiting or lockout** — use the Cloudflare rule above.
3. Requesters can never read internal notes or other people's tickets; this is covered by `npm run test:api`.
4. The signing secret is generated per deployment and stored in D1. Anyone with access to your D1 database can read it, so treat database access as admin access.

## Changing the schema later
Edit `cloudflare/src/schema.sql` and add a numbered entry in `cloudflare/src/lib/migrate.js`. Several Worker instances can start at once, so **every statement in a migration must be idempotent** (`CREATE … IF NOT EXISTS`, `INSERT OR IGNORE`; guard an `ALTER TABLE` with `pragma_table_info`).

## Branding
Royal-blue palette and logo from Infovantage Consulting. Logo files are in `frontend/src/assets/`; colours are in `frontend/tailwind.config.js`.
