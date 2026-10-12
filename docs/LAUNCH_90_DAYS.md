# Infovantage ITSM — 90-day launch plan

Targets below are **planning targets to revise after four weeks of real data**, not forecasts or promises. Nothing here
has been launched; no campaign, list or message has been sent.

## 1. Positioning (use exactly this)
**Infovantage ITSM — Simple, affordable IT incident and ticket management for small businesses and IT support teams.**

**Can say:** log incidents; track tickets from new to closed; assign; comments and internal notes; search and filter; CSV
export; requesters see only their own tickets and are not billed as agents; Starter is R199 per agent per month, by request.
**Must not say:** SLA, escalation, breach alerts, email notifications, reporting, multiple client workspaces, audit history,
online billing, a free trial (see §8), uptime guarantees, certifications, customer counts or testimonials. Professional
(R349) and MSP (R549) are **waitlist only**.

## 2. Target customers
| Profile | Pain | Fit today |
|---|---|---|
| Small businesses (10-100 staff) with one to five IT people | Support lives in email and chat; no record of what was fixed | Good: Starter covers this |
| Internal IT teams outgrowing spreadsheets | No ownership, no history | Good |
| Independent IT support consultants | Need to track client issues | Partial: one workspace per client today; true multi-client is the planned MSP tier, so **waitlist** |

## 3. Pipeline (matches Administration → Demo & waitlist)
New → Contacted → Provisioned (workspace set up; records the date and shows when a one-month pilot would end) → Closed.
Waitlist sign-ups for Professional/MSP stay as `waitlist` type; do not call them leads for Starter.

## 4. Search titles, descriptions and keywords
Home: "Infovantage ITSM — IT incident and ticket management for small teams". Software: "Infovantage ITSM — simple, affordable IT incident and ticket management".
Keyword themes (verify volumes first): affordable IT ticketing system, incident management software for small business, helpdesk ticketing South Africa, IT support ticket tracker, ServiceNow alternative for small teams (only if you can explain the difference honestly).

## 5. Weekly rhythm (planning targets)
- 20 personalised messages to small-business IT contacts and independent IT consultants.
- 2-3 demos booked from replies.
- Reply to every request within one business day (state this is a goal; none is promised publicly).
- One short post: a real problem and how a ticket record solves it.

## 6. Messages
**LinkedIn note:** "Hi {name}, I'm building Infovantage ITSM, a simple, affordable incident and ticket tracker for small IT teams. Starter is R199 per agent per month. If your support still runs through email and chat, I'd value 15 minutes to show it and hear what's missing."
**Independent consultant version:** "...If you support several clients, the multi-client plan isn't ready yet, but I'm collecting a waitlist and would value your view on what it must do."
**After a demo:** "Thanks for your time. As discussed, Starter covers incident logging and ticket tracking for R199 per agent per month, invoiced directly while online billing is built. Next step: if you'd like to go ahead I'll set up your workspace and create your administrator account. No payment details are needed to proceed with set-up."
**Follow-up (7 days):** "Checking whether you'd like to move ahead, or whether something was missing. A straight 'no' helps me too."
Email follow-ups are manual (outbound automation is not built).

## 7. Demo script (about 10 minutes, uses only working features)
1. **Problem (1 min):** where do their support requests live today? 2. **Requester view (2 min):** sign in as a requester, log an incident, show they see only their own tickets. 3. **Agent view (3 min):** open the incident, assign it, add a public comment and an internal note (confirm the requester cannot see the note), move it through statuses. 4. **Find things (1 min):** search and filter. 5. **Admin (2 min):** add a user and set a role; reset a password; export to CSV. 6. **Be explicit (1 min):** show the Planned items in the comparison table and say what is not available. Close with the Starter price and how set-up works.

## 8. Trial policy
No public trial is offered. A "one-month free trial" may be shown only once trial start, expiry, conversion and cancellation are built and tested. Until then, any pilot is a manual, agreed arrangement; Administration records the set-up date and shows when a one-month pilot would end, but nothing is billed, locked or converted automatically.

## 9. 90-day checklist
**Days 1-14:** back up the database; deploy (approval required); register your admin account; supply the support email and legal entity details in `siteConfig.js`; get the privacy notice and terms reviewed; run the demo script on yourself.
**Days 15-45:** weekly rhythm; run 3-5 demos; set up the first workspaces by hand (each customer **must** have its own D1 database; never reuse one); record every objection and missing feature.
**Days 46-90:** decide from real feedback whether Professional (SLA, escalation, breach alerts, notifications, reporting) comes first; define billing, cancellation and refund terms **before** any payment integration; review pricing after the first 10 paying organisations or 90 days from the first paying customer's start, whichever comes first.

## 10. Metrics
Requests by type (admin export) → demos held → workspaces set up → paying agents (record yourself; billing is manual) → cancellations. The software does not track revenue.

## 11. Operational rules
Each customer = one Worker + one D1 database. Take a restore point and export before changing a customer's workspace. Never reuse a database across customers. Keep ITSM and GovernancePro contacts in separate lists.
