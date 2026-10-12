import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from './MarketingLayout';
import AscendingMotif from './AscendingMotif';

const MODULES = [
  { icon: '▲', name: 'Incidents', desc: 'Log, triage, and resolve service interruptions with SLA timers and internal notes.' },
  { icon: '◇', name: 'Service Requests', desc: 'A service catalog with built-in approval routing for things like new hardware or access.' },
  { icon: '●', name: 'Problems', desc: 'Track root causes behind repeat incidents through to a permanent fix or known error.' },
  { icon: '▣', name: 'Changes', desc: 'Standard, normal, and emergency changes with risk levels and rollback plans.' },
  { icon: '▦', name: 'CMDB', desc: 'Configuration items and their dependencies — know what breaks when something goes down.' },
  { icon: '▤', name: 'Knowledge Base', desc: 'Self-service articles so people can solve common issues without opening a ticket.' },
];

const COMPARE = [
  { label: 'Time to first ticket', enterprise: 'Weeks of implementation', us: 'Same day' },
  { label: 'Contract', enterprise: 'Annual, seat minimums', us: 'Month to month, no minimums' },
  { label: 'Who sets it up', enterprise: 'A certified ITIL consultant', us: 'You — or we do it for you' },
  { label: 'Pricing model', enterprise: 'Per agent + platform fee + add-ons', us: 'One price per agent, everything included' },
];

export default function Landing() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-16 pt-14 md:grid-cols-2 md:pt-24">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-patina-50 px-3 py-1 text-xs font-semibold text-patina-600">
            ITIL-aligned ITSM, sized for real teams
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
            Enterprise ITSM, without the enterprise tax.
          </h1>
          <p className="mt-5 text-lg text-ink/60">
            Incidents, service requests, problems, changes, a CMDB, and a knowledge base — the core ITIL workflow, without the six-figure contract or the six-week implementation.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/start" className="rounded-md bg-patina-500 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-patina-600">
              Start free trial
            </Link>
            <Link to="/pricing" className="rounded-md border border-stone-200 px-6 py-3 text-center text-sm font-semibold text-ink hover:bg-stone-50">
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink/60"><span className="font-semibold text-patina-600">Free for your first month.</span> No credit card required.</p>
        </div>
        <div className="flex justify-center">
          <AscendingMotif className="w-full max-w-sm" />
        </div>
      </section>

      {/* Module showcase */}
      <section id="modules" className="border-t border-stone-200 bg-stone-50 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mb-10 max-w-xl">
            <h2 className="font-display text-3xl font-bold text-ink">Six modules. One tool.</h2>
            <p className="mt-3 text-ink/60">Most SMB helpdesks stop at tickets and a knowledge base. This is the full ITIL core — the same modules a $50k/year platform charges enterprise rates for.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div key={m.name} className="rounded-xl border border-stone-200 bg-white p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-850 text-sm text-white">
                  {m.icon}
                </div>
                <div className="font-display mb-1 font-semibold text-ink">{m.name}</div>
                <p className="text-sm text-ink/60">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-5">
          <h2 className="font-display mb-10 text-center text-3xl font-bold text-ink">Built for the team that doesn't have an ITIL administrator</h2>
          <div className="overflow-hidden rounded-xl border border-stone-200">
            <div className="grid grid-cols-3 bg-stone-50 text-sm font-semibold text-ink/60">
              <div className="px-5 py-3"></div>
              <div className="px-5 py-3">Typical enterprise ITSM</div>
              <div className="px-5 py-3 text-patina-600">Infovantage</div>
            </div>
            {COMPARE.map((row, i) => (
              <div key={row.label} className={`grid grid-cols-3 text-sm ${i % 2 ? 'bg-white' : 'bg-stone-50/50'}`}>
                <div className="px-5 py-4 font-medium text-ink">{row.label}</div>
                <div className="px-5 py-4 text-ink/50">{row.enterprise}</div>
                <div className="px-5 py-4 font-medium text-ink">{row.us}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-slate-850 py-16 text-white">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="font-display text-3xl font-bold">Get your service desk running this week.</h2>
          <p className="mt-3 text-white/70">Tell us about your team and we'll set up your workspace. Your first month is free.</p>
          <Link
            to="/start"
            className="mt-8 inline-block rounded-md bg-amber-500 px-8 py-3 text-sm font-semibold text-ink hover:bg-amber-400"
          >
            Start free trial
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
