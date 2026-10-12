import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import MarketingLayout from './MarketingLayout';
import usePageMeta from './usePageMeta';
import { SITE } from '../siteConfig';

const PLANS = [
  { v: 'starter', l: 'Starter — R199 per agent / month (demo available)' },
  { v: 'professional', l: 'Professional — R349 (coming soon, waitlist)' },
  { v: 'msp', l: 'MSP / Business Plus — R549 (coming soon, waitlist)' },
  { v: 'not_sure', l: 'Not sure yet' },
];
const AGENTS = ['1-3', '4-10', '11-25', '26-50', '51+'];

export default function DemoRequest() {
  const [params] = useSearchParams();
  const planParam = PLANS.some((p) => p.v === params.get('plan')) ? params.get('plan') : 'starter';
  const [form, setForm] = useState({ name: '', email: '', company: '', team_size: '4-10', plan: planParam, message: '', consent: false, website: '' });
  const [state, setState] = useState({ busy: false, error: '', done: false });

  // Professional and MSP are not purchasable: asking for them means joining the waitlist.
  const kind = form.plan === 'professional' || form.plan === 'msp' || params.get('kind') === 'waitlist' ? 'waitlist' : 'demo';
  const heading = kind === 'waitlist' ? 'Join the waitlist' : 'Request a demo';
  usePageMeta({
    title: `${heading} — Infovantage ITSM`,
    description: kind === 'waitlist' ? 'Join the waitlist for the Infovantage ITSM Professional and MSP plans. No payment details needed.' : 'Request a demo of Infovantage ITSM. No payment details needed.',
    path: '/start',
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, error: '', done: false });
    try {
      await client.post('/leads', {
        name: form.name.trim(), email: form.email.trim(), company: form.company.trim(), team_size: form.team_size,
        plan: form.plan, kind, message: form.message.trim() || undefined,
        consent: form.consent, consent_version: SITE.consentVersion, website: form.website,
      });
      setState({ busy: false, error: '', done: true });
    } catch (err) {
      const status = err.response?.status;
      const msg = status === 429 ? 'You have sent several requests in a short time. Please try again later.'
        : err.response?.data?.error || 'We could not save your request just now. Please try again in a few minutes.';
      setState({ busy: false, error: msg, done: false });
    }
  }

  if (state.done) {
    return (
      <MarketingLayout>
        <section className="mx-auto max-w-lg px-5 py-24 text-center" aria-live="polite">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-patina-50 text-2xl text-patina-500" aria-hidden="true">✓</div>
          <h1 className="font-display text-2xl font-bold text-ink">{kind === 'waitlist' ? 'You are on the waitlist' : 'Request received'}</h1>
          <p className="mt-3 text-ink/70">
            Thank you, {form.name.trim().split(' ')[0] || 'there'}. {kind === 'waitlist'
              ? `We will email ${form.email} when this plan is available. There is no obligation and no payment is taken.`
              : `We will email ${form.email} to arrange a demo. We never ask for payment details to arrange one.`}
          </p>
          <p className="mt-2 text-sm text-ink/60">If you do not see our email, check your spam folder.</p>
          <Link to="/" className="mt-8 inline-block text-sm font-medium text-patina-600 hover:underline">← Back to home</Link>
        </section>
      </MarketingLayout>
    );
  }

  const input = 'w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-patina-500';
  return (
    <MarketingLayout>
      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-12 px-5 py-14 md:grid-cols-2 md:py-20">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{heading}</h1>
          <p className="mt-4 text-ink/70">
            {kind === 'waitlist'
              ? 'The Professional and MSP plans are still in development. Join the waitlist and we will email you when they open.'
              : 'Tell us about your team and we will reply by email to arrange a demo of Infovantage ITSM.'}
          </p>
          <ul className="mt-8 space-y-4 text-sm text-ink/70">
            <li className="flex gap-3"><span aria-hidden="true" className="text-patina-500">✓</span>No payment details are asked for or taken.</li>
            <li className="flex gap-3"><span aria-hidden="true" className="text-patina-500">✓</span>We only use your details to reply to this request.</li>
            <li className="flex gap-3"><span aria-hidden="true" className="text-patina-500">✓</span>You can ask us to delete them at any time. See the <Link to="/privacy" className="underline">privacy notice</Link>.</li>
          </ul>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-stone-200 p-6" noValidate={false}>
          <div className="mb-4">
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">Full name</label>
            <input id="name" required autoComplete="name" value={form.name} onChange={set('name')} className={input} maxLength={200} />
          </div>
          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">Work email</label>
            <input id="email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} className={input} maxLength={254} />
          </div>
          <div className="mb-4">
            <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-ink">Organisation</label>
            <input id="company" required autoComplete="organization" value={form.company} onChange={set('company')} className={input} maxLength={200} />
          </div>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="plan" className="mb-1.5 block text-sm font-medium text-ink">Plan of interest</label>
              <select id="plan" value={form.plan} onChange={set('plan')} className={input}>
                {PLANS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="team_size" className="mb-1.5 block text-sm font-medium text-ink">Number of agents</label>
              <select id="team_size" value={form.team_size} onChange={set('team_size')} className={input}>
                {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-ink">Anything we should know? <span className="font-normal text-ink/50">(optional)</span></label>
            <textarea id="message" rows={3} value={form.message} onChange={set('message')} className={input} maxLength={2000} />
          </div>

          {/* Spam trap: hidden from people and assistive technology; bots tend to fill it in. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', height: 0, overflow: 'hidden' }}>
            <label>Leave this empty <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
          </div>

          <div className="mb-5 flex items-start gap-3">
            <input id="consent" type="checkbox" required checked={form.consent} onChange={set('consent')} className="mt-1 h-4 w-4" />
            <label htmlFor="consent" className="text-sm text-ink/80">
              I agree that Infovantage Consulting may contact me by email about this request. I have read the <Link to="/privacy" className="underline">privacy notice</Link>.
            </label>
          </div>

          {state.error && <div role="alert" className="mb-4 rounded-md bg-brick-50 px-3 py-2 text-sm text-brick-600">{state.error}</div>}

          <button type="submit" disabled={state.busy} className="w-full rounded-md bg-patina-500 px-4 py-3 text-sm font-semibold text-white hover:bg-patina-600 disabled:opacity-60">
            {state.busy ? 'Sending…' : kind === 'waitlist' ? 'Join the waitlist' : 'Request a demo'}
          </button>
          <p className="mt-3 text-center text-xs text-ink/50">Already a customer? <Link to="/login" className="text-patina-600 hover:underline">Sign in</Link></p>
        </form>
      </section>
    </MarketingLayout>
  );
}
