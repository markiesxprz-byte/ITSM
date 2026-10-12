import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import client from '../api/client';
import MarketingLayout from './MarketingLayout';

const TEAM_SIZES = ['1-5', '6-10', '11-25', '26-50', '51+'];
const REGIONS = [
  { value: 'south-africa', label: 'South Africa' },
  { value: 'europe', label: 'Europe' },
  { value: 'us', label: 'United States' },
  { value: 'other', label: 'Other' },
];
const PLANS = ['starter', 'growth', 'pro', 'enterprise'];

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function TrialSignup() {
  const [params] = useSearchParams();
  const initialPlan = PLANS.includes(params.get('plan')) ? params.get('plan') : 'growth';

  const [form, setForm] = useState({
    name: '', email: '', company: '', team_size: '11-25', region: 'south-africa', plan: initialPlan,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const workspaceSlug = form.company ? slugify(form.company) : '';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await client.post('/leads', { ...form, workspace_slug: workspaceSlug });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong submitting this — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <MarketingLayout>
        <section className="mx-auto max-w-lg px-5 py-24 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-patina-50 text-2xl text-patina-500">✓</div>
          <h1 className="font-display text-2xl font-bold text-ink">Request received</h1>
          <p className="mt-3 text-ink/60">
            Thanks, {form.name.split(' ')[0] || 'there'} — we set up every trial workspace by hand so it's configured correctly from day one. You'll get an email at <span className="font-medium text-ink">{form.email}</span> with sign-in details within one business day. Your free month starts the day your workspace is ready.
          </p>
          <Link to="/" className="mt-8 inline-block text-sm font-medium text-patina-500 hover:underline">← Back to home</Link>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-12 px-5 py-14 md:grid-cols-2 md:py-20">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">Start your free trial</h1>
          <p className="mt-4 text-ink/60">
            Tell us about your team. Trial workspaces are set up by hand — usually within one business day — so nothing about your setup is a guess.
          </p>
          <div className="mt-8 space-y-4 text-sm text-ink/60">
            <div className="flex gap-3">
              <span className="text-patina-500">✓</span>
              <span>Your first month is free — it starts the day your workspace is ready</span>
            </div>
            <div className="flex gap-3">
              <span className="text-patina-500">✓</span>
              <span>No credit card required to start</span>
            </div>
            <div className="flex gap-3">
              <span className="text-patina-500">✓</span>
              <span>Full access to your chosen plan's features during the trial</span>
            </div>
            <div className="flex gap-3">
              <span className="text-patina-500">✓</span>
              <span>A real person reviews and provisions every workspace</span>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-stone-200 p-6">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Full name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-patina-500"
              placeholder="Jordan Lee"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Work email</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-patina-500"
              placeholder="you@company.com"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Company</span>
            <input
              required
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-patina-500"
              placeholder="Acme Logistics"
            />
            {workspaceSlug && (
              <span className="mt-1.5 block text-xs text-ink/40">Preferred workspace name: {workspaceSlug}</span>
            )}
          </label>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Team size</span>
              <select
                value={form.team_size}
                onChange={(e) => setForm({ ...form, team_size: e.target.value })}
                className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-patina-500"
              >
                {TEAM_SIZES.map((s) => <option key={s} value={s}>{s} agents</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Region</span>
              <select
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-patina-500"
              >
                {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          </div>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Plan you're interested in</span>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
              className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-patina-500"
            >
              {PLANS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </label>

          {error && <div className="mb-4 rounded-md bg-brick-50 px-3 py-2 text-sm text-brick-600">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-patina-500 px-4 py-3 text-sm font-semibold text-white hover:bg-patina-600 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Request my free month'}
          </button>
          <p className="mt-3 text-center text-xs text-ink/40">
            Already have an account? <Link to="/login" className="text-patina-500 hover:underline">Sign in</Link>
          </p>
        </form>
      </section>
    </MarketingLayout>
  );
}
