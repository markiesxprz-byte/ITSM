// Unit tests for the access rules. Expected answers are worked out by hand from the dates, not by calling the code.
// Run: node cloudflare/scripts/entitlement.test.mjs
import { evaluateAccess } from '../src/lib/entitlement.js';
let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  [' + detail + ']'}`); };
const NOW = Date.parse('2026-10-13T12:00:00.000Z');
const sub = (status, over = {}) => ({ status, lapsed_at: null, paid_through: null, ...over });
const ev = (s, prev, grace) => evaluateAccess(s, prev, NOW, grace);

t('no subscription at all (e.g. invoiced directly): never restricted', ev(null, null).entitled === true && ev(null, null).reason === 'no_subscription');
t('active: entitled', ev(sub('active'), null).entitled === true);
t('a first subscription still waiting for approval: entitled (a new customer is not locked out while paying)', ev(sub('pending'), null).entitled === true);

// grace after a failed payment (7 days by default)
t('past due since 10 Oct, 7 days grace -> until 17 Oct: still entitled', (r => r.entitled && r.reason === 'grace' && r.until === '2026-10-17T00:00:00.000Z')(ev(sub('past_due', { lapsed_at: '2026-10-10T00:00:00.000Z' }), null)));
t('past due since 10 Oct, only 2 days grace -> ended 12 Oct: NOT entitled', (r => !r.entitled && r.reason === 'lapsed')(ev(sub('past_due', { lapsed_at: '2026-10-10T00:00:00.000Z' }), null, 2)));
t('suspended since 1 Oct, 7 days grace -> ended 8 Oct: NOT entitled', !ev(sub('suspended', { lapsed_at: '2026-10-01T00:00:00.000Z' }), null).entitled);
t('past due with no recorded start: the grace period starts now (entitled)', ev(sub('past_due'), null).entitled === true);
t('grace of 0 days: past due since one millisecond ago -> NOT entitled', !evaluateAccess(sub('past_due', { lapsed_at: new Date(NOW - 1).toISOString() }), null, NOW, 0).entitled);
t('grace of 0 days: past due since exactly now -> NOT entitled (the period has ended)', !evaluateAccess(sub('past_due', { lapsed_at: new Date(NOW).toISOString() }), null, NOW, 0).entitled);

// cancelled: keep what was paid for
t('cancelled, paid through 20 Oct: entitled until then (the terms promise this)', (r => r.entitled && r.reason === 'paid_through' && r.until === '2026-10-20T00:00:00.000Z')(ev(sub('cancelled', { paid_through: '2026-10-20T00:00:00.000Z', lapsed_at: '2026-10-12T00:00:00.000Z' }), null)));
t('cancelled, paid through 12 Oct (already past): NOT entitled', !ev(sub('cancelled', { paid_through: '2026-10-12T00:00:00.000Z', lapsed_at: '2026-10-12T00:00:00.000Z' }), null).entitled);
t('cancelled with no paid-through date, cancelled this morning: NOT entitled', !ev(sub('cancelled', { lapsed_at: '2026-10-13T08:00:00.000Z' }), null).entitled);
t('cancelled, paid through the end of the trial in 20 days: entitled (the trial is honoured)', ev(sub('cancelled', { paid_through: '2026-11-02T12:00:00.000Z', lapsed_at: '2026-10-13T11:00:00.000Z' }), null).entitled);
t('expired: NOT entitled', !ev(sub('expired', { lapsed_at: '2026-10-01T00:00:00.000Z' }), null).entitled);

// the loophole: a lapsed customer starting a new subscription and never paying
const lapsed = sub('cancelled', { paid_through: '2026-09-01T00:00:00.000Z', lapsed_at: '2026-09-01T00:00:00.000Z' });
t('a NEW pending subscription does not restore access for someone whose previous one lapsed', !ev(sub('pending'), lapsed).entitled);
t('...but a pending one after a previous one that is still paid through keeps access', ev(sub('pending'), sub('cancelled', { paid_through: '2026-10-30T00:00:00.000Z', lapsed_at: '2026-10-12T00:00:00.000Z' })).entitled);
t('...and a pending one after an active one is entitled', ev(sub('pending'), sub('active')).entitled);
t('an unrecognised status is not treated as a lock (fails open)', ev(sub('mystery'), null).entitled === true);

console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} checks`);
process.exit(fail ? 1 : 0);
