import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from './MarketingLayout';
import usePageMeta from './usePageMeta';
import { SITE } from '../siteConfig';

function LegalPage({ title, path, description, children }) {
  usePageMeta({ title: `${title} — Infovantage ITSM`, description, path });
  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-5 py-14 text-ink/80">
        <h1 className="font-display text-3xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink/60">Last updated {SITE.policyUpdated}</p>
        <div role="note" className="mt-5 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-600">
          This document is a plain-language statement of how the service works today. It has not yet been reviewed by a lawyer.
        </div>
        <div className="mt-8 space-y-8 text-[15px] leading-relaxed [&_h2]:font-display [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </article>
    </MarketingLayout>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy notice" path="/privacy" description="How Infovantage ITSM handles personal information: what we collect, why, how long we keep it and how to exercise your rights.">
      <section><h2>Who we are</h2>
        <p>{SITE.organisation} (“we”) operates Infovantage ITSM, an incident and ticket management service. This notice covers this website and the demo and waitlist forms. It is written with South Africa’s Protection of Personal Information Act (POPIA) in mind.</p></section>
      <section><h2>What we collect on this website</h2>
        <ul>
          <li>From the demo or waitlist form: your name, work email, organisation, number of agents, the plan you are interested in, an optional message, and a record that you agreed to be contacted (the time and the version of the wording).</li>
          <li>Your IP address is used to limit abusive or repeated requests. It is held in short-lived counters that are cleared within about a day. It is not added to your request record.</li>
          <li>We do not use advertising cookies or analytics on this site. When you sign in to the application, your browser stores a sign-in token and your display preference locally, so you stay signed in.</li>
          <li>We do not collect payment card details.</li>
        </ul></section>
      <section><h2>Why we use it</h2>
        <p>To reply to your request, arrange a demo, tell you when a plan you asked about becomes available, and keep a record that you agreed to be contacted. We do not sell personal information or use it for unrelated marketing.</p></section>
      <section><h2>Customer workspaces</h2>
        <p>If your organisation uses Infovantage ITSM, the tickets, comments and user accounts in its workspace belong to your organisation. We operate the workspace on your organisation’s behalf. Passwords are stored as salted hashes. Your organisation’s administrator decides who has access.</p></section>
      <section><h2>Who we share it with</h2>
        <p>The service is hosted on Cloudflare, which stores and processes the data on our behalf and may do so outside South Africa. When email notifications are enabled, an email delivery provider will also process recipients’ email addresses. We will list any additional provider here before it is used.</p></section>
      <section><h2>How long we keep it</h2>
        <p>We keep demo and waitlist requests only as long as they are needed to deal with them, and we review them at least once a year and delete those no longer needed. You can ask us to delete yours sooner. Customer workspace data is kept for as long as the customer’s agreement lasts and is deleted or returned afterwards on request.</p></section>
      <section><h2>Your rights</h2>
        <p>You may ask to see the personal information we hold about you, to correct it, to delete it, or to withdraw your consent to be contacted. To do so, {SITE.supportEmail ? <>email <a className="underline" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a></> : <>use the <Link to="/start" className="underline">request form</Link> and say that your message is a privacy request</>}. You may also complain to the Information Regulator (South Africa) if you believe your information has been mishandled.</p></section>
      <section><h2>Security</h2>
        <p>Access is controlled by roles that are enforced on the server, repeated wrong passwords are slowed down, and the site sends browser security headers. No system is perfectly secure, and the service has not yet had an independent security audit.</p></section>
      <section><h2>Changes</h2>
        <p>We will update this notice when our practices change and show the date at the top.</p></section>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of service" path="/terms" description="The terms that apply to using Infovantage ITSM: what is and is not available, accounts, fees and your data.">
      <section><h2>The service</h2>
        <p>Infovantage ITSM lets an organisation record incidents and manage tickets. The Starter plan covers incident logging and ticket management. Features marked “Planned” or “Coming soon” on our website are in development; they are not available, are not promised for a particular date, and cannot be purchased.</p></section>
      <section><h2>Demos, waitlists and set-up</h2>
        <p>Requesting a demo or joining a waitlist does not create a contract and costs nothing. During the launch period we set up each customer’s workspace by hand after agreeing the details with you.</p></section>
      <section><h2>Fees and billing</h2>
        <p>Starter is priced per agent per month in South African rand. A billable agent is a user with the Agent or Administrator role. Requesters are not billed as agents. Launch prices are proposals and may change before the paid plans open; any change applying to an existing customer will be agreed with that customer first. VAT treatment is confirmed on your quote. During launch we invoice directly; online subscription billing is not available.</p></section>
      <section><h2>Accounts and acceptable use</h2>
        <ul>
          <li>You are responsible for the accounts in your workspace and for keeping passwords secure.</li>
          <li>Do not use the service to break the law, to attack or probe the service, or to store content you have no right to hold.</li>
          <li>We may suspend access that threatens the security or operation of the service.</li>
        </ul></section>
      <section><h2>Your data</h2>
        <p>Your organisation’s tickets and records remain yours. You can export tickets to CSV. See the <Link to="/privacy" className="underline">privacy notice</Link> for how personal information is handled.</p></section>
      <section><h2>Availability and support</h2>
        <p>We do not offer an uptime guarantee or a service-level agreement at this stage. We reply to requests by email, with no response-time commitment during the launch period.</p></section>
      <section><h2>Liability</h2>
        <p>To the extent the law allows, the service is provided as it is, and we are not liable for indirect or consequential loss. Nothing in these terms limits liability that cannot lawfully be limited.</p></section>
      <section><h2>Ending the agreement</h2>
        <p>Either party may end the arrangement by written notice. The notice period and any refund terms will be set out in your quote or order.</p></section>
      <section><h2>Law</h2>
        <p>These terms are governed by the laws of the Republic of South Africa.</p></section>
    </LegalPage>
  );
}

export function Support() {
  return (
    <LegalPage title="Support and contact" path="/support" description="How to get help with Infovantage ITSM, ask a question, or make a privacy request.">
      <section><h2>How to reach us</h2>
        {SITE.supportEmail || SITE.supportPhone ? (
          <ul>
            {SITE.supportEmail && <li>Email: <a className="underline" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a></li>}
            {SITE.supportPhone && <li>Phone: {SITE.supportPhone}</li>}
          </ul>
        ) : (
          <p>For now, the quickest way to reach us is the <Link to="/start" className="underline">request form</Link>. Say what you need in the message box and we will reply by email.</p>
        )}</section>
      <section><h2>Existing customers</h2>
        <p>Sign in at <Link to="/login" className="underline">the sign-in page</Link>. If you cannot sign in, ask your organisation’s administrator to reset your password; they can do this under Administration → Users.</p></section>
      <section><h2>What to include in a support request</h2>
        <ul>
          <li>Your organisation’s name and the email address you sign in with.</li>
          <li>What you were trying to do and what happened instead.</li>
          <li>The ticket number, if the question is about a ticket.</li>
        </ul>
        <p>Please never send a password.</p></section>
      <section><h2>Response times</h2>
        <p>We reply by email. No response-time commitment applies during the launch period.</p></section>
      <section><h2>Privacy requests</h2>
        <p>To see, correct or delete personal information, or to withdraw consent, say so in your message. See the <Link to="/privacy" className="underline">privacy notice</Link>.</p></section>
    </LegalPage>
  );
}
