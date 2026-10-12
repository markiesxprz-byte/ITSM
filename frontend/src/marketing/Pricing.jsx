import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from './MarketingLayout';

const TIERS = [
  {
    id: 'starter', name: 'Starter', zar: 199, usd: 12,
    tagline: 'Basic ticketing for small teams just getting started.',
    features: ['Incidents + Knowledge Base', 'Email-to-ticket*', 'Unlimited requesters', 'Basic reporting', 'Email support'],
  },
  {
    id: 'growth', name: 'Growth', zar: 449, usd: 29, popular: true,
    tagline: 'The most common fit — adds requests and SLA discipline.',
    features: ['Everything in Starter', 'Service Requests + approvals', 'SLA policies + business hours', 'Problem management', 'Standard reporting', 'Email + chat support'],
  },
  {
    id: 'pro', name: 'Pro', zar: 849, usd: 55,
    tagline: 'For teams ready for full ITIL change and asset management.',
    features: ['Everything in Growth', 'Change management (risk, rollback)', 'CMDB + asset relationships', 'Advanced SLA analytics', 'Priority support'],
  },
  {
    id: 'enterprise', name: 'Enterprise', zar: null, usd: null,
    tagline: 'SSO, audit logs, and a dedicated rollout for larger orgs.',
    features: ['Everything in Pro', 'SSO / SAML + audit log', 'Custom onboarding', 'Dedicated CSM'],
  },
];

const COMPARE_ROWS = [
  ['Requesters', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Incidents + Knowledge Base', true, true, true, true],
  ['Email-to-ticket + portal*', true, true, true, true],
  ['Service Requests + approvals', false, true, true, true],
  ['SLA policies + business hours', false, true, true, true],
  ['Problem management', false, true, true, true],
  ['Change management (CAB, risk, rollback)', false, false, true, true],
  ['CMDB + asset relationships', false, false, true, true],
  ['Reporting & SLA analytics', 'Basic', 'Standard', 'Advanced', 'Advanced'],
  ['SSO / SAML, audit log', false, false, false, true],
  ['Support', 'Email', 'Email + chat', 'Priority', 'Dedicated CSM'],
];

function formatPrice(tier, currency, annual) {
  if (tier.zar === null) return 'Custom';
  const base = currency === 'ZAR' ? tier.zar : tier.usd;
  const symbol = currency === 'ZAR' ? 'R' : '$';
  const price = annual ? Math.round(base * 0.8) : base;
  return `${symbol}${price}`;
}

export default function Pricing() {
  const [currency, setCurrency] = useState('ZAR');
  const [annual, setAnnual] = useState(false);

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-6xl px-5 pb-8 pt-14 text-center">
        <h1 className="font-display text-4xl font-bold text-ink">Simple, per-agent pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink/60">
          Requesters — the people raising tickets — are always free and unlimited. You only pay for agents working the queue.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <div className="inline-flex rounded-md bg-stone-100 p-1 text-sm">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded px-4 py-1.5 font-medium ${!annual ? 'bg-white shadow-sm' : 'text-ink/50'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded px-4 py-1.5 font-medium ${annual ? 'bg-white shadow-sm' : 'text-ink/50'}`}
            >
              Annual <span className="text-patina-600">(-20%)</span>
            </button>
          </div>
          <div className="inline-flex rounded-md bg-stone-100 p-1 text-sm">
            <button
              onClick={() => setCurrency('ZAR')}
              className={`rounded px-4 py-1.5 font-medium ${currency === 'ZAR' ? 'bg-white shadow-sm' : 'text-ink/50'}`}
            >
              ZAR
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`rounded px-4 py-1.5 font-medium ${currency === 'USD' ? 'bg-white shadow-sm' : 'text-ink/50'}`}
            >
              USD
            </button>
          </div>
        </div>
      </section>

      {/* Tier cards */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`flex flex-col rounded-xl border p-6 ${tier.popular ? 'border-patina-500 shadow-lg' : 'border-stone-200'}`}
            >
              {tier.popular && (
                <div className="mb-3 w-fit rounded-full bg-patina-500 px-3 py-1 text-xs font-semibold text-white">Most popular</div>
              )}
              <div className="font-display text-lg font-bold text-ink">{tier.name}</div>
              <p className="mt-1 text-xs text-ink/50">{tier.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-3xl font-bold text-ink">{formatPrice(tier, currency, annual)}</span>
                {tier.zar !== null && <span className="text-sm text-ink/40">/ agent / mo</span>}
              </div>
              {tier.zar !== null && annual && (
                <div className="text-xs text-ink/40">billed annually</div>
              )}
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink/70">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-patina-500">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/start"
                className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-semibold ${
                  tier.popular ? 'bg-patina-500 text-white hover:bg-patina-600' : 'border border-stone-200 text-ink hover:bg-stone-50'
                }`}
              >
                {tier.zar === null ? 'Talk to us' : 'Start free trial'}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-ink/40">*Email-to-ticket is on the roadmap — see the trial signup for current status.</p>
      </section>

      {/* Comparison table */}
      <section className="border-t border-stone-200 bg-stone-50 py-16">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="font-display mb-8 text-center text-2xl font-bold text-ink">Compare plans</h2>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left">
                  <th className="px-5 py-3 text-ink/50">Feature</th>
                  {TIERS.map((t) => (
                    <th key={t.id} className="px-5 py-3 font-display text-ink">{t.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(([label, ...vals]) => (
                  <tr key={label} className="border-b border-stone-100 last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{label}</td>
                    {vals.map((v, i) => (
                      <td key={i} className="px-5 py-3 text-ink/70">
                        {typeof v === 'boolean' ? (v ? <span className="text-patina-500">✓</span> : <span className="text-ink/20">—</span>) : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-2xl px-5 text-center">
          <h2 className="font-display text-2xl font-bold text-ink">Not sure which tier fits?</h2>
          <p className="mt-3 text-ink/60">Start a free trial on any plan — we'll help you find the right fit once you're in.</p>
          <Link to="/start" className="mt-6 inline-block rounded-md bg-patina-500 px-6 py-3 text-sm font-semibold text-white hover:bg-patina-600">
            Start free trial
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
