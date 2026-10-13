// Public-site settings. Edit here; nothing else needs to change.
export const SITE = {
  name: 'Infovantage ITSM',
  // Used for canonical links and the sitemap. Update when a custom domain is attached.
  baseUrl: 'https://itsm.markiesxprz.workers.dev',
  organisation: 'Infovantage Consulting',
  // Leave blank until a real, monitored address exists — the site then directs people to the request form
  // instead of publishing an address nobody reads.
  supportEmail: '',
  supportPhone: '',
  // Turn these on ONLY after the PayPal sandbox checks have passed and billing is live.
  onlineBilling: false,   // true: the pricing page and FAQ say customers can pay by monthly PayPal subscription
  freeTrialMonths: 0,     // e.g. 1: the pages say every PayPal subscription starts with that many free months (the plan must really have a trial)
  policyUpdated: '12 October 2026',
  // Bump when the consent wording on the request form changes; it is stored with every request.
  consentVersion: '2026-10-12',
};
