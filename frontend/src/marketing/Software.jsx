import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from './MarketingLayout';
import usePageMeta from './usePageMeta';
import { SITE } from '../siteConfig';

// Everything claimed on this page is limited to behaviour that has been built AND tested.
// Anything else is labelled "Planned" or "Coming soon". Plans marked 'soon' have no purchase button.
const PLANS = [
  {
    id: 'starter', name: 'Starter', price: 'R199', status: 'available',
    who: 'Small businesses and IT support teams that need a straightforward way to log and track incidents.',
    features: [
      'Incident logging with priority and category',
      'Ticket tracking: new, in progress, on hold, resolved, closed',
      'Assign tickets to agents',
      'Search and filter by status, priority and assignee',
      'Comments, with internal notes only staff can see',
      'Requester accounts that see only their own tickets',
      'Export tickets to CSV',
      'Works on phones and desktops',
    ],
    cta: { label: 'Request a demo', to: '/start?plan=starter' },
  },
  {
    id: 'professional', name: 'Professional', price: 'R349', status: 'soon',
    who: 'Teams that need service-level discipline on top of ticket tracking.',
    features: [
      'Everything in Starter',
      'SLA response and resolution targets',
      'Priority-based escalation',
      'Breach alerts',
      'Service reporting',
      'Email notifications',
    ],
    cta: { label: 'Join the waitlist', to: '/start?plan=professional&kind=waitlist' },
  },
  {
    id: 'msp', name: 'MSP / Business Plus', price: 'R549', status: 'soon',
    who: 'IT support providers who look after several client organisations.',
    features: [
      'Everything in Professional',
      'Multiple client workspaces',
      'Strict client data separation',
      'Role-based permissions per client',
      'Client-specific reporting',
      'Administrative audit history',
    ],
    cta: { label: 'Join the waitlist', to: '/start?plan=msp&kind=waitlist' },
  },
];

const A = 'Included';
const P = 'Planned';
const N = '—';
const COMPARE = [
  ['Incident logging and ticket tracking', A, A, A],
  ['Assignment, comments and internal notes', A, A, A],
  ['Search, filters and CSV export', A, A, A],
  ['Requester accounts (own tickets only)', A, A, A],
  ['SLA response and resolution targets', N, P, P],
  ['Priority-based escalation', N, P, P],
  ['Breach alerts', N, P, P],
  ['Email notifications', N, P, P],
  ['Service reporting', N, P, P],
  ['Multiple client workspaces', N, N, P],
  ['Strict client data separation', N, N, P],
  ['Role-based permissions per client', N, N, P],
  ['Client-specific reporting', N, N, P],
  ['Administrative audit history', N, N, P],
];

const FAQ = [
  ['What counts as a billable agent?', 'A billable agent is a person with the Agent or Administrator role who works on tickets. People who only log requests and follow their own tickets (requesters) are not counted as agents.'],
  ['Can my staff log tickets without paying?', 'Yes. Requester accounts can raise tickets and follow only their own tickets. They are not billed as agents. Requesters cannot see other people’s tickets or internal notes.'],
  ['Can I try it first?', 'Request a demo and we will arrange one by email. A self-service trial is not available yet; we will announce trial terms once trial management has been built and tested.'],
  ['How do I pay?', 'Online subscription billing is not live. During the launch period billing is arranged with you directly and invoiced. We never ask for payment details to arrange a demo, and this site does not collect card details.'],
  ['How long does onboarding take?', 'During launch each workspace is set up by hand after your demo. We do not promise a fixed turnaround; we will give you a date when we agree your set-up.'],
  ['Is my data kept separate from other customers?', 'Each customer’s workspace is set up separately with its own database, and the software checks permissions on the server for every request. This has been tested with an automated test suite. It has not been independently audited or certified.'],
  ['Where is my data stored, and is it backed up?', 'The software runs on Cloudflare’s network. A specific data-residency region has not been configured yet. Cloudflare’s database provides point-in-time recovery for the previous seven days; a documented export routine for customers is being put in place.'],
  ['What is not available yet?', 'SLA targets, escalation, breach alerts, email notifications, service reporting, multiple client workspaces, client-specific reporting, an audit history, online billing, two-factor sign-in and email-based password reset. An administrator can reset a password.'],
  ['The software also contains service requests, problems, changes, CMDB and a knowledge base. Are they included?', 'Those modules exist in the software but are in preview. They are not part of the supported launch scope, and we have not yet run them with customers, so we do not offer them as part of the plans above.'],
];

function Cell({ v }) {
  if (v === A) return <span className="font-medium text-patina-600"><span aria-hidden="true">✓ </span>Included</span>;
  if (v === P) return <span className="text-amber-600">Planned</span>;
  return <span className="text-ink/30"><span aria-hidden="true">—</span><span className="sr-only">Not included</span></span>;
}

export default function Software() {
  usePageMeta({
    title: 'Infovantage ITSM — simple, affordable IT incident and ticket management',
    description: 'Simple, affordable IT incident and ticket management for small businesses and IT support teams. Starter plan from R199 per agent per month. Request a demo.',
    path: '/software',
  });

  return (
    <MarketingLayout>
      {/* 1. Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-14 pt-14 md:pt-20">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-patina-600">Infovantage ITSM</p>
        <h1 className="font-display max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Simple, affordable IT incident and ticket management for small businesses and IT support teams.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink/70">
          Log incidents, follow every ticket through to resolution and keep your support work in one place, without the cost or complexity of an enterprise platform.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/start?plan=starter" className="rounded-md bg-patina-500 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-patina-600">Request a demo</Link>
          <a href="#pricing" className="rounded-md border border-stone-300 px-6 py-3 text-center text-sm font-semibold text-ink hover:bg-stone-50">See pricing</a>
        </div>
        <p className="mt-4 text-sm text-ink/60">Demos and onboarding are arranged by hand during our launch period. No payment details are needed to ask for a demo.</p>
      </section>

      {/* 2. The problem */}
      <section className="border-t border-stone-200 bg-stone-50 py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Support work gets lost in inboxes and chat threads</h2>
            <p className="mt-3 text-ink/70">When requests arrive by phone, message and email, nobody can say who owns what, what has been fixed, or what keeps coming back. Enterprise service-management products solve that, but cost and complicate far more than a small team needs.</p>
          </div>
          <ul className="space-y-3 text-ink/80">
            <li className="flex gap-3"><span aria-hidden="true" className="text-patina-500">●</span>One place to record every incident, with who raised it and who is working on it.</li>
            <li className="flex gap-3"><span aria-hidden="true" className="text-patina-500">●</span>A clear status on every ticket, from new to closed.</li>
            <li className="flex gap-3"><span aria-hidden="true" className="text-patina-500">●</span>A written history of comments and internal notes, so knowledge stays with the team.</li>
            <li className="flex gap-3"><span aria-hidden="true" className="text-patina-500">●</span>A price a small business can justify per agent.</li>
          </ul>
        </div>
      </section>

      {/* 3 + 4. What works today / highlights */}
      <section id="features" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-2xl font-bold text-ink">What works today</h2>
          <p className="mt-2 max-w-2xl text-ink/70">The Starter plan covers incident logging and ticket management. Everything listed here has been built and tested.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Log incidents quickly', 'Record what happened, how urgent it is and what it relates to. Priorities run from P1 to P4.'],
              ['Track every ticket', 'Tickets move through new, in progress, on hold, resolved and closed, with the time each step happened.'],
              ['Assign and collaborate', 'Give each ticket an owner. Add comments for the requester, or internal notes only your team can read.'],
              ['Find things fast', 'Search by title or number and filter by status, priority or assignee.'],
              ['Let staff raise their own tickets', 'Requester accounts see only their own tickets and are not billed as agents. Roles are enforced on the server.'],
              ['Take your data with you', 'Export tickets to CSV at any time.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-stone-200 bg-white p-6">
                <h3 className="font-display mb-1 font-semibold text-ink">{t}</h3>
                <p className="text-sm text-ink/70">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. How it works */}
      <section className="border-t border-stone-200 bg-stone-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-2xl font-bold text-ink">How it works</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ['Request a demo', 'Tell us about your team. We reply by email and arrange a demo.'],
              ['We set up your workspace', 'During launch we set up each customer’s workspace separately, by hand, and create the first administrator account.'],
              ['Your team logs and resolves incidents', 'Agents work the queue; requesters raise tickets and follow their own.'],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-stone-200 bg-white p-6">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-850 text-sm font-semibold text-white" aria-hidden="true">{i + 1}</div>
                <h3 className="font-display mb-1 font-semibold text-ink">{t}</h3>
                <p className="text-sm text-ink/70">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6. Pricing */}
      <section id="pricing" className="scroll-mt-20 py-14" aria-labelledby="pricing-heading">
        <div className="mx-auto max-w-6xl px-5">
          <h2 id="pricing-heading" className="font-display text-2xl font-bold text-ink">Pricing</h2>
          <p className="mt-2 max-w-3xl text-ink/70">
            Priced per agent per month in South African rand. Requesters are not billed. These are proposed launch prices and may change before the paid plans open; VAT treatment is confirmed on your quote.
          </p>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p) => (
              <article key={p.id} className={`flex flex-col rounded-xl border p-6 ${p.status === 'available' ? 'border-patina-500 shadow-lg' : 'border-stone-200 bg-stone-50/60'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-ink">{p.name}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.status === 'available' ? 'bg-patina-50 text-patina-600' : 'bg-amber-50 text-amber-600'}`}>
                    {p.status === 'available' ? 'Available by request' : 'Coming soon'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink/60">{p.who}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-ink">{p.price}</span>
                  <span className="text-sm text-ink/60">per agent / month</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink/80">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2"><span aria-hidden="true" className={p.status === 'available' ? 'text-patina-500' : 'text-amber-600'}>{p.status === 'available' ? '✓' : '○'}</span><span>{f}</span></li>
                  ))}
                </ul>
                {p.status !== 'available' && <p className="mt-4 text-xs text-ink/60">Not available yet. These features are in development and cannot be purchased.</p>}
                <Link to={p.cta.to} className={`mt-5 rounded-md px-4 py-2.5 text-center text-sm font-semibold ${p.status === 'available' ? 'bg-patina-500 text-white hover:bg-patina-600' : 'border border-stone-300 text-ink hover:bg-white'}`}>
                  {p.cta.label}<span className="sr-only"> for {p.name}</span>
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-5 text-xs text-ink/60">Starter is available by request. Billing is arranged and invoiced directly during launch; online subscription billing is not live and no free-trial terms are offered yet.</p>
        </div>
      </section>

      {/* 7. Comparison */}
      <section className="border-t border-stone-200 bg-stone-50 py-14" aria-labelledby="compare-heading">
        <div className="mx-auto max-w-6xl px-5">
          <h2 id="compare-heading" className="font-display text-2xl font-bold text-ink">Available now and planned</h2>
          <div className="relative mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Comparison of Starter, Professional and MSP plans, showing which features are included and which are planned</caption>
              <thead>
                <tr className="border-b border-stone-200 text-left">
                  <th scope="col" className="px-5 py-3 text-ink/60">Feature</th>
                  <th scope="col" className="px-5 py-3 font-display">Starter</th>
                  <th scope="col" className="px-5 py-3 font-display">Professional <span className="text-xs font-normal text-amber-600">(coming soon)</span></th>
                  <th scope="col" className="px-5 py-3 font-display">MSP <span className="text-xs font-normal text-amber-600">(coming soon)</span></th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([f, s, pr, m]) => (
                  <tr key={f} className="border-b border-stone-100 last:border-0">
                    <th scope="row" className="px-5 py-3 text-left font-medium text-ink">{f}</th>
                    <td className="px-5 py-3"><Cell v={s} /></td>
                    <td className="px-5 py-3"><Cell v={pr} /></td>
                    <td className="px-5 py-3"><Cell v={m} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink/60">“Planned” means in development and not available. Preview modules (service requests, problems, changes, CMDB, knowledge base) exist in the software but are not part of any plan yet.</p>
        </div>
      </section>

      {/* 8. Security and data handling */}
      <section id="security" className="scroll-mt-20 py-14" aria-labelledby="security-heading">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-2">
          <div>
            <h2 id="security-heading" className="font-display text-2xl font-bold text-ink">Security and data handling</h2>
            <p className="mt-2 text-ink/70">What we can state because it has been built and tested:</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink/80">
              {[
                'Passwords are stored as salted hashes, never in plain text.',
                'Permissions are checked on the server for every request, and covered by an automated test suite.',
                'Requesters can see only their own tickets; internal notes are visible to staff only.',
                'Repeated wrong passwords are slowed down.',
                'Deactivating a user ends their access straight away.',
                'The site sends browser security headers, including a strict content security policy.',
                'Each customer’s workspace is set up separately, with its own database.',
                'We do not collect payment card details on this site.',
              ].map((t) => <li key={t} className="flex gap-2"><span aria-hidden="true" className="text-patina-500">✓</span><span>{t}</span></li>)}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">What we cannot yet claim</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink/80">
              {[
                'No independent security audit or certification yet.',
                'No two-factor sign-in yet.',
                'No email-based password reset yet; an administrator can reset a password.',
                'No data-residency region has been configured.',
                'No uptime guarantee or service-level agreement at this stage.',
              ].map((t) => <li key={t} className="flex gap-2"><span aria-hidden="true" className="text-amber-600">○</span><span>{t}</span></li>)}
            </ul>
            <p className="mt-4 text-sm text-ink/70">Read how we handle personal information in our <Link to="/privacy" className="font-medium text-patina-600 underline">privacy notice</Link>.</p>
          </div>
        </div>
      </section>

      {/* 9. FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-stone-200 bg-stone-50 py-14" aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl px-5">
          <h2 id="faq-heading" className="font-display text-2xl font-bold text-ink">Frequently asked questions</h2>
          <div className="mt-6 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink">
                  {q}<span aria-hidden="true" className="text-ink/40 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-ink/70">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 10. Contact + CTA */}
      <section id="contact" className="scroll-mt-20 bg-slate-850 py-14 text-white" aria-labelledby="contact-heading">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 id="contact-heading" className="font-display text-3xl font-bold">Want to see it with your own team?</h2>
          <p className="mt-3 text-white/80">Tell us about your team and we will reply by email to arrange a demo.</p>
          <Link to="/start?plan=starter" className="mt-7 inline-block rounded-md bg-amber-500 px-8 py-3 text-sm font-semibold text-ink hover:bg-amber-400">Request a demo</Link>
          <p className="mt-6 text-sm text-white/70">
            {SITE.supportEmail ? <>Questions? Email <a className="underline" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>. </> : null}
            See <Link to="/support" className="underline">Support</Link>, our <Link to="/privacy" className="underline">privacy notice</Link> and <Link to="/terms" className="underline">terms of service</Link>.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
