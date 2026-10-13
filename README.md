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

**Roles** — `admin` (everything), `agent` (works tickets, problems, changes, CMDB, knowledge base), `requester` (raises and tracks only their own tickets and sees published knowledge-base articles; cannot see internal notes, other people's tickets, the user directory, changes, problems, the CMDB or the activity feed).

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
Open the `*.workers.dev` URL and **register your own account at once. The first account created becomes the administrator** — there are no demo accounts, and until you register, anyone who finds the URL could claim it. After that first account, **self-registration is closed**: an administrator creates accounts (Administration → Users) or opens registration deliberately, optionally limited to one email domain.

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

## Public site, demo requests and waitlist

The public pages are `/` (home), `/software` (the SaaS landing page: capabilities, pricing, available-versus-planned comparison, security, FAQ, contact), `/start` (demo request or waitlist form), `/support`, `/privacy` and `/terms`. `/pricing` redirects to the pricing section. The application itself lives at `/login` and `/dashboard`. Public-site settings (support email, canonical URL, consent wording version) are in `frontend/src/siteConfig.js`.

**Plans as advertised:** Starter **R199 per agent per month** (available by request); Professional **R349** and MSP / Business Plus **R549** are shown as **Coming soon** with a waitlist button only. Nothing on the site can be purchased, there is no checkout, and no payment details are collected. A billable agent is a user with the Agent or Administrator role; requesters are not billed. The site makes **no trial offer** — a free trial may be shown only once trial start, expiry, conversion and cancellation are built and tested.

**Requests:** `/start` posts to `POST /api/leads`. The server requires explicit consent, validates every field, drops submissions that fill a hidden spam-trap field, refuses more than 10 per hour per address, ignores an identical request from the same person within 24 hours, and stores the consent time and the version of the wording shown. The visitor sees the confirmation page only after the server confirms the record was saved; failures show an error. Admins work the queue under **Administration → Demo & waitlist** (status, notes, CSV export). Setting a request to *provisioned* records the date and shows when a one-month pilot would end — internal tracking only; nothing is advertised, billed or switched off automatically.

**Before this goes live you must supply:** a monitored support email or phone (`siteConfig.js`), the organisation's legal name and an Information Officer for the privacy notice, and a lawyer's review of the privacy notice and terms (the pages say they have not been reviewed).

## SLA management (built and tested locally; not yet verified in production)

- **Policies** (Administration → SLA Policies): response and resolution targets per ticket type and priority. Each policy either counts **round the clock** or **working hours only**, and policies can now be edited.
- **Working hours, holidays and alerts** (same screen): working days, opening and closing time, a UTC offset (South Africa is +02:00, with no daylight saving), public holidays, the "at risk" percentage (default 80%), and an optional "raise priority when breached".
- **How time is counted:** in working-hours mode, only minutes inside the configured hours on working days count; a ticket that arrives out of hours starts counting at the next opening. The counting mode is fixed when a ticket is created.
- **Clock pause:** moving a ticket to *On hold* stops its clock. When it leaves On hold, the time held is credited by pushing the unfinished due dates back. Changing a ticket's priority recalculates its due dates from its creation time.
- **First response:** the first *public* reply from staff (or moving the ticket to in-progress). Internal notes and the requester's own comments do not count.
- **States:** on track, at risk, breached, paused, met. Staff see them as badges in the incident and service-request lists and a "Service level" block in the ticket. **Requesters never see SLA state or the internal bookkeeping.**
- **Alerts and escalation:** a Cron Trigger runs every five minutes (`wrangler.jsonc`). It emails the assignee when a ticket is at risk, and the assignee and every administrator when a response or resolution target is breached, once per event. A paused ticket is never alerted. Without `RESEND_API_KEY`, emails are logged instead of sent.
- **Reports** (Reports in the menu; admin and agent): attainment %, average first response and resolution, by priority and by type, for a date range.

**Limits:** a priority raised by escalation does not recalculate due dates; the counting mode of an existing ticket does not change if the policy changes; average times are calendar minutes (including time on hold); there is no multi-timezone support per customer; emails depend on a configured Resend key.

Tests: `node cloudflare/scripts/sla.test.mjs` (36 time-maths checks), `bash cloudflare/scripts/sla-check.sh` (77 API and scheduled-job checks), `python3 cloudflare/scripts/sla-browser.py` (37 screen checks).

## PayPal billing (built and tested against a MOCK of PayPal; not yet run against PayPal itself)

**What it does.** Administration → Billing lets a workspace administrator start a monthly PayPal subscription, billed **per billable agent** (agents and administrators; requesters are free), in **US dollars**. South African customers pay **15% VAT on top**; international customers choose "outside South Africa" and are billed with **no VAT added** (they are responsible for taxes in their own country). The server decides the number of agents and the plan; the browser cannot. A subscription stays **pending until PayPal itself confirms it**; a success page alone never activates anything. Webhooks are verified with PayPal and processed once per event. Payments appear in a history. Changing the number of agents means **cancelling and subscribing again**. No card or PayPal login details are ever stored or seen.

**Free trial.** `paypal-setup.mjs --trial-months 1` makes the plan start with a free month. PayPal runs the trial and starts charging by itself; the app shows "Free trial" with the end date, and the first payment ends the trial. Nothing about a trial or online billing appears on the public site until you set `onlineBilling` and `freeTrialMonths` in `frontend/src/siteConfig.js`.

**Subscription enforcement (OFF by default).** An administrator can switch it on in Billing. Then: (a) the number of agents and administrators cannot exceed what is paid for (adding, promoting or re-activating one gets a clear "cancel and subscribe again" message); (b) if the subscription lapses, the workspace becomes **read-only** after a grace period (7 days, or `BILLING_GRACE_DAYS`): people can still sign in, read, export to CSV and fix billing, and a banner explains why. Nothing is deleted. A cancelled subscription keeps working until the end of what was paid for. Starting a new subscription and not paying does not restore access. **Customers with no PayPal subscription (for example those invoiced directly) are never restricted.**

**Configuration (Cloudflare secrets for the `itsm` Worker; never in GitHub)**
| Name | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | The PayPal REST app's credentials |
| `PAYPAL_PLAN_ID` | The South Africa plan (VAT added) |
| `PAYPAL_PLAN_ID_INTL` | Optional: the international plan (no VAT). Without it only South Africa is offered |
| `PAYPAL_WEBHOOK_ID` | The id of the webhook you create in PayPal's dashboard |
| `PAYPAL_ENV` | Leave **unset** for the sandbox (the safe default). Set to `live` only when you have approved real charges |
| `BILLING_GRACE_DAYS` | Optional: days of grace before a lapsed workspace goes read-only (default 7) |

If any of the first four (client id, secret, `PAYPAL_PLAN_ID`, webhook id) is missing, billing is off: the screen says so and nothing can be charged.

**Set-up, in order**
1. PayPal developer dashboard → create a **sandbox** REST app (client id and secret) and a sandbox *business* and a sandbox *buyer* account.
2. Create the plans on your computer: `PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node cloudflare/scripts/paypal-setup.mjs --price 12.00` (South Africa; add `--trial-months 1` for a free first month), and again with `--region intl` for the international plan. Each prints the plan id to store. See `docs/PRICING_RECOMMENDATION.md`.
3. PayPal dashboard → Webhooks → add `https://<your-site>/api/billing/webhook` for: `BILLING.SUBSCRIPTION.ACTIVATED`, `.CANCELLED`, `.SUSPENDED`, `.EXPIRED`, `.PAYMENT.FAILED` and `PAYMENT.SALE.COMPLETED`. Note the webhook id.
4. Store the secrets in Cloudflare.
5. **Run the sandbox check:** `PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node cloudflare/scripts/paypal-sandbox-check.mjs --plan-id P-... --plan-id-intl P-... --webhook-id <id>`. It checks your plans (active, per-agent, US dollars, monthly, VAT or none, trial), creates a test subscription, confirms your webhook is registered with all six events, and confirms PayPal rejects a forged webhook. It stops at "READY FOR THE BUYER STEPS".
6. **Buyer steps, by hand** (the script cannot approve as a buyer): subscribe with the sandbox buyer; confirm the status stays "Waiting for PayPal" until PayPal confirms, then becomes Active (or Free trial); confirm a payment appears in the history and a repeated webhook does not duplicate it; cancel; subscribe again with a different number of agents and check the quantity and the VAT line on PayPal's side; simulate a failed payment; try the international option.
7. Only then, with your explicit approval: repeat steps 1-4 on PayPal's **live** system (`--live`), switch the secrets to the live values and set `PAYPAL_ENV=live`. Switch on enforcement only after that, and set `onlineBilling` (and `freeTrialMonths`) on the public site.

**Limits (read these)**
- The PayPal API calls were written from PayPal's documentation and exercised only against a local mock. Steps 5 and 6 are what prove them.
- No proration or automatic mid-term seat changes (re-subscribe instead). Refunds are made in PayPal, not in this app.
- The region (VAT or not) is the customer's own answer; the app cannot check it. Confirm the VAT treatment with your accountant (`docs/LEGAL_REVIEW_BRIEF.md`).
- Customers invoiced directly (in rand) are unaffected: leave billing unconfigured for them.

Tests: `CHROMIUM=<path> bash cloudflare/scripts/billing-check.sh` (115 API checks and 41 screen checks against the mock) and `node cloudflare/scripts/entitlement.test.mjs` (18 access-rule checks).

## API documentation
`/api/docs` serves interactive Swagger UI (loaded from a public CDN) for every endpoint; the raw spec is at `/api/openapi.yaml`.

## Access model and customer data separation

**Between customers:** one customer = one deployment (its own Worker **and its own D1 database**). Separation is the deployment boundary; there is no multi-tenant row-level isolation inside a database. **Never reuse a `database_name` / `database_id` across customers** — two Workers bound to the same database would share every ticket. Check this on every new deployment.

**Inside a workspace** (enforced by the API, not just hidden in the menu, and covered by `npm run test:api`):

| | Requester | Agent | Admin |
|---|---|---|---|
| Own tickets: raise, read, comment | yes | yes | yes |
| Other people's tickets | no | yes | yes |
| Internal notes | no | yes | yes |
| Problems, changes, CMDB, user directory, activity feed | no | yes | yes |
| Users, SLA policies, catalog, trial leads, registration setting | no | no | yes |

- Every request is checked against the database, so **deactivating or demoting someone takes effect immediately**, not when their token expires. The last active administrator cannot be removed or demoted.
- Assignees must be active staff; every write is validated (allowed values, lengths, email format, password of 8–128 characters).
- Throttling (per client address): 5 wrong passwords per account and 30 per address in 15 minutes; 10 registrations/hour; 10 trial-form submissions/hour; 5 wrong "current password" guesses per account in 15 minutes.
- Browser protections: strict Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, referrer policy and HSTS on the site; `no-store` on every API response.
- Password recovery: an admin can reset any password (Administration → Users); everyone can change their own (sidebar → Change password).

## Known gaps — not yet production-grade
1. **Plan limits are not enforced.** Every workspace has every module and unlimited agents, whatever plan the customer chose. The pricing page's tiering (Change and CMDB on Pro, etc.) is currently a promise, not a control.
2. **No email-based password reset, no MFA, no email verification.** Recovery is by an administrator.
3. **Tokens last 12 hours and cannot be revoked one by one** (deactivating the user does revoke them). Changing a password does not end other sessions.
4. **Ticket status changes are not constrained** — any valid status can follow any other (for example `new` straight to `closed`). Whether to enforce a stricter lifecycle is a process decision for you.
5. **Password hashing is capped by the platform** at 100,000 PBKDF2 iterations (OWASP recommends 600,000); the throttling above compensates, and Cloudflare rate-limiting rules add a further layer.
6. **Separation between customers depends on correct provisioning** (see above); nothing in the software can detect two customers sharing a database.
7. **No data-subject tooling** (export or deletion of one person's data) beyond CSV export, and no documented backup/restore procedure — check D1's point-in-time recovery on your plan.

## Decisions and roadmap (recorded)
1. **Starter stays at R199 per agent per month** as the public price.
2. **Production readiness of the ticket workflow, access controls and customer separation comes first** — see the two sections above.
3. **Next: SLA tracking and notifications, then reporting.**
   - Exists today: SLA policies per priority, due dates set when a ticket is raised, a past-due count on the dashboard, and emails on ticket events (needs a Resend key).
   - Not built: business hours and holidays, pausing the clock while a ticket waits on the customer, recalculating when priority changes, "at risk" and "breached" notifications (needs a scheduled Worker), escalation, and first-response measurement.
   - Reporting (SLA attainment, volumes, resolution times) follows once SLA data is trustworthy.
4. **No payment processing until** a paid plan exists in the software and these are handled: a subscription record per workspace (plan, seats, trial start and end, active / past due / cancelled, renewal date), plan and seat limits actually enforced, what happens when a trial ends, renewals, cancellations and failed payments, invoices with VAT, and terms. None of this exists yet and no payment code has been added.
5. **Review pricing after the first 10 paying organisations or 90 days, whichever comes first.** The 90 days should start from the first paying customer's start date (confirm). Collect the count of paying organisations, trial-to-paid conversion and cancellations so the review has data; there is no tooling for this yet.

## Changing the schema later
Edit `cloudflare/src/schema.sql` and add a numbered entry in `cloudflare/src/lib/migrate.js`. Several Worker instances can start at once, so **every statement in a migration must be idempotent** (`CREATE … IF NOT EXISTS`, `INSERT OR IGNORE`; guard an `ALTER TABLE` with `pragma_table_info`).

## Branding
Royal-blue palette and logo from Infovantage Consulting. Logo files are in `frontend/src/assets/`; colours are in `frontend/tailwind.config.js`.
