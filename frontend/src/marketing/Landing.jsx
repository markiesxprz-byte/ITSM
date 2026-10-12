import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from './MarketingLayout';
import AscendingMotif from './AscendingMotif';
import usePageMeta from './usePageMeta';

export default function Landing() {
  usePageMeta({
    title: 'Infovantage ITSM — IT incident and ticket management for small teams',
    description: 'Simple, affordable IT incident and ticket management for small businesses and IT support teams. Starter plan from R199 per agent per month.',
    path: '/',
  });
  return (
    <MarketingLayout>
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-16 pt-14 md:grid-cols-2 md:pt-24">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-patina-50 px-3 py-1 text-xs font-semibold text-patina-600">Incident and ticket management</p>
          <h1 className="font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
            Simple, affordable IT incident and ticket management.
          </h1>
          <p className="mt-5 text-lg text-ink/70">
            Built for small businesses and IT support teams that need to log incidents, track every ticket to resolution and keep a record of what was done, without the cost of an enterprise platform.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/start?plan=starter" className="rounded-md bg-patina-500 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-patina-600">Request a demo</Link>
            <Link to="/software#pricing" className="rounded-md border border-stone-300 px-6 py-3 text-center text-sm font-semibold text-ink hover:bg-stone-50">See pricing from R199</Link>
          </div>
          <p className="mt-4 text-sm text-ink/60">Per agent per month. Requesters are not billed.</p>
        </div>
        <div className="flex justify-center" aria-hidden="true">
          <AscendingMotif className="w-full max-w-sm" />
        </div>
      </section>

      <section className="border-t border-stone-200 bg-stone-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-2xl font-bold text-ink">What it does today</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {[
              ['Log incidents', 'Record what happened, how urgent it is and who raised it.'],
              ['Track tickets', 'Follow each ticket from new to closed, assign it and keep a written history.'],
              ['Keep it private', 'Requesters see only their own tickets. Internal notes stay with your team.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-stone-200 bg-white p-6">
                <h3 className="font-display mb-1 font-semibold text-ink">{t}</h3>
                <p className="text-sm text-ink/70">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink/70">
            SLA targets, escalation, email notifications, reporting and multi-client workspaces are planned and not available yet.{' '}
            <Link to="/software" className="font-medium text-patina-600 underline">See what is available now and what is planned</Link>.
          </p>
        </div>
      </section>

      <section className="bg-slate-850 py-14 text-white">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="font-display text-3xl font-bold">See it with your own team.</h2>
          <p className="mt-3 text-white/80">Request a demo and we will reply by email. No payment details are needed.</p>
          <Link to="/start?plan=starter" className="mt-7 inline-block rounded-md bg-amber-500 px-8 py-3 text-sm font-semibold text-ink hover:bg-amber-400">Request a demo</Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
