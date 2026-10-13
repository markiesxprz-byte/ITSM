// Unit tests for the SLA time maths. Expected values are worked out by hand (see the comments), not by calling the code.
// Run: node cloudflare/scripts/sla.test.mjs
import { normalizeConfig, addBusinessMinutes, businessMinutesBetween, addSla, measureSla, computeSla } from '../src/lib/sla.js';
let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  [' + detail + ']'}`); };
// SAST = UTC+2. Local times below are written as the UTC instant that equals them.
const sast = (iso) => Date.parse(iso + '+02:00');
const show = (ms) => new Date(ms + 120 * 60000).toISOString().slice(0, 16).replace('T', ' ') + ' SAST';
const cfg = normalizeConfig({}); // Mon-Fri 08:00-17:00, +02:00, no holidays   (2026-10-16 is a Friday, 10-17 Saturday, 10-19 Monday)

const eq = (name, got, want) => t(name, got === sast(want), `got ${show(got)}, want ${want}`);
eq('Fri 16:30 + 240 working min -> Mon 11:30 (30 min left Friday, 210 on Monday)', addBusinessMinutes(sast('2026-10-16T16:30:00'), 240, cfg), '2026-10-19T11:30:00');
eq('Sat 10:00 + 60 -> Mon 09:00 (counting starts at Monday opening)', addBusinessMinutes(sast('2026-10-17T10:00:00'), 60, cfg), '2026-10-19T09:00:00');
eq('Mon 07:00 + 30 -> Mon 08:30 (counting starts at 08:00)', addBusinessMinutes(sast('2026-10-19T07:00:00'), 30, cfg), '2026-10-19T08:30:00');
eq('Mon 08:00 + 540 -> Mon 17:00 (exactly one working day)', addBusinessMinutes(sast('2026-10-19T08:00:00'), 540, cfg), '2026-10-19T17:00:00');
eq('Mon 08:00 + 1080 -> Tue 17:00 (two working days)', addBusinessMinutes(sast('2026-10-19T08:00:00'), 1080, cfg), '2026-10-20T17:00:00');
eq('Mon 10:00 + 1 -> Mon 10:01', addBusinessMinutes(sast('2026-10-19T10:00:00'), 1, cfg), '2026-10-19T10:01:00');
eq('0 minutes returns the start unchanged', addBusinessMinutes(sast('2026-10-17T10:00:00'), 0, cfg), '2026-10-17T10:00:00');
eq('Fri 16:59 + 2 -> Mon 08:01 (one minute Friday, one Monday)', addBusinessMinutes(sast('2026-10-16T16:59:00'), 2, cfg), '2026-10-19T08:01:00');
eq('Fri 17:00 sharp + 30 -> Mon 08:30 (the day has already closed)', addBusinessMinutes(sast('2026-10-16T17:00:00'), 30, cfg), '2026-10-19T08:30:00');
const hol = normalizeConfig({ holidays: ['2026-10-19'] });
eq('a holiday on Monday: Fri 16:30 + 240 -> Tue 11:30', addBusinessMinutes(sast('2026-10-16T16:30:00'), 240, hol), '2026-10-20T11:30:00');
const long = normalizeConfig({ days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '13:00' });
eq('Saturday working half-day (09:00-13:00, Mon-Sat): Sat 11:00 + 300 -> Mon 12:00 (120 Sat, 180 Mon... 09:00+180=12:00)', addBusinessMinutes(sast('2026-10-17T11:00:00'), 300, long), '2026-10-19T12:00:00');

t('between: Fri 16:30 -> Mon 09:00 = 30 + 60 = 90 working minutes', businessMinutesBetween(sast('2026-10-16T16:30:00'), sast('2026-10-19T09:00:00'), cfg) === 90);
t('between: all inside a weekend = 0', businessMinutesBetween(sast('2026-10-17T08:00:00'), sast('2026-10-18T20:00:00'), cfg) === 0);
t('between: Mon 06:00 -> Mon 20:00 = the full 540-minute day', businessMinutesBetween(sast('2026-10-19T06:00:00'), sast('2026-10-19T20:00:00'), cfg) === 540);
t('between: across the holiday Monday counts nothing for that day (Fri 16:00 -> Tue 09:00 = 60 + 60)', businessMinutesBetween(sast('2026-10-16T16:00:00'), sast('2026-10-20T09:00:00'), hol) === 120);
t('between: end before start = 0', businessMinutesBetween(sast('2026-10-19T12:00:00'), sast('2026-10-19T09:00:00'), cfg) === 0);
t('between is the inverse of add: add 300 then measure back = 300', businessMinutesBetween(sast('2026-10-15T10:15:00'), addBusinessMinutes(sast('2026-10-15T10:15:00'), 300, cfg), cfg) === 300);
t('calendar mode ignores working hours: Sat 10:00 + 60 = Sat 11:00', addSla(sast('2026-10-17T10:00:00'), 60, 'calendar', cfg) === sast('2026-10-17T11:00:00'));
t('calendar measure = elapsed minutes', measureSla(sast('2026-10-17T10:00:00'), sast('2026-10-18T10:00:00'), 'calendar', cfg) === 1440);

// configuration safety
const bad = normalizeConfig({ start: '18:00', end: '08:00', days: [] , offset: 9999, atRiskPct: 500, raisePriority: 'yes' });
t('an impossible configuration falls back to safe defaults (08:00-17:00, Mon-Fri, +02:00)', bad.startMin === 480 && bad.endMin === 1020 && bad.days.join() === '1,2,3,4,5' && bad.offset === 120 && bad.atRiskPct === 80 && bad.raisePriority === false);
const ok = normalizeConfig({ start: '07:30', end: '16:00', days: [1, 2, 3], offset: 0, atRiskPct: 70, raisePriority: true, holidays: ['2026-12-25', 'junk'] });
t('a valid configuration is honoured; junk holiday entries are dropped', ok.startMin === 450 && ok.endMin === 960 && ok.days.join() === '1,2,3' && ok.offset === 0 && ok.atRiskPct === 70 && ok.raisePriority === true && ok.holidays.size === 1);

// states
const T = (over) => ({ created_at: '2026-10-19T06:00:00.000Z', sla_response_due: '2026-10-19T07:00:00.000Z', sla_resolution_due: '2026-10-19T10:00:00.000Z', responded_at: null, resolved_at: null, sla_mode: 'calendar', sla_paused_at: null, ...over }); // 4h window
const at = (iso) => Date.parse(iso);
let s = computeSla(T(), at('2026-10-19T06:30:00.000Z'), cfg);
t('early: response pending, resolution on_track at 12% used', s.response.state === 'pending' && s.resolution.state === 'on_track' && s.resolution.pct_used === 13 || s.resolution.pct_used === 12, JSON.stringify(s.resolution));
s = computeSla(T(), at('2026-10-19T09:15:00.000Z'), cfg);
t('3h15m of a 4h window = 81% -> at_risk (threshold 80%)', s.resolution.state === 'at_risk' && s.resolution.pct_used === 81, JSON.stringify(s.resolution));
s = computeSla(T(), at('2026-10-19T09:11:00.000Z'), cfg);
t('3h11m = 79.6% -> still on_track', s.resolution.state === 'on_track', JSON.stringify(s.resolution));
s = computeSla(T(), at('2026-10-19T10:01:00.000Z'), cfg);
t('one minute past due -> breached, remaining = -1', s.resolution.state === 'breached' && s.resolution.remaining_mins === -1 && s.response.state === 'breached');
s = computeSla(T({ responded_at: '2026-10-19T06:50:00.000Z' }), at('2026-10-19T09:00:00.000Z'), cfg);
t('responded before the response due -> response met', s.response.state === 'met');
s = computeSla(T({ responded_at: '2026-10-19T07:05:00.000Z' }), at('2026-10-19T08:00:00.000Z'), cfg);
t('responded after the response due -> response breached (and stays breached)', s.response.state === 'breached');
s = computeSla(T({ resolved_at: '2026-10-19T09:59:59.000Z' }), at('2026-10-20T00:00:00.000Z'), cfg, false);
t('resolved just before due -> resolution met, even much later', s.resolution.state === 'met');
s = computeSla(T({ resolved_at: '2026-10-19T10:00:01.000Z' }), at('2026-10-20T00:00:00.000Z'), cfg, false);
t('resolved one second late -> breached', s.resolution.state === 'breached');
s = computeSla(T({ sla_paused_at: '2026-10-19T08:00:00.000Z' }), at('2026-10-19T20:00:00.000Z'), cfg);
t('paused (on hold) -> never breaches while the clock is stopped', s.paused === true && s.resolution.state === 'paused' && s.response.state === 'pending');
s = computeSla(T(), at('2026-10-19T20:00:00.000Z'), cfg, false);
t('a ticket closed without ever being resolved/answered -> "na", not a breach', s.resolution.state === 'na' && s.response.state === 'na');
t('a ticket with no SLA at all returns null', computeSla({ created_at: '2026-10-19T06:00:00.000Z' }, Date.now(), cfg) === null);
// business-mode window: created Fri 16:30 SAST, 240 working min -> due Mon 11:30. At Mon 10:00 used = 30+120 = 150 of 240 = 62.5% -> on_track; at Mon 11:00 = 210/240 = 87.5% -> at_risk
const bt = { created_at: new Date(sast('2026-10-16T16:30:00')).toISOString(), sla_response_due: null, sla_resolution_due: new Date(sast('2026-10-19T11:30:00')).toISOString(), responded_at: null, resolved_at: null, sla_mode: 'business', sla_paused_at: null };
t('business mode: Mon 10:00 -> 63% used, on_track (the weekend does not count)', (x => x.resolution.state === 'on_track' && x.resolution.pct_used === 63)(computeSla(bt, sast('2026-10-19T10:00:00'), cfg)));
t('business mode: Mon 11:00 -> 88% used, at_risk', (x => x.resolution.state === 'at_risk' && x.resolution.pct_used === 88)(computeSla(bt, sast('2026-10-19T11:00:00'), cfg)));
t('business mode: Sunday noon is NOT breached (due Monday 11:30)', computeSla(bt, sast('2026-10-18T12:00:00'), cfg).resolution.state !== 'breached');
t('business mode: Mon 11:31 -> breached, 1 working minute over', (x => x.resolution.state === 'breached' && x.resolution.remaining_mins === -1)(computeSla(bt, sast('2026-10-19T11:31:00'), cfg)));

console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} checks`);
process.exit(fail ? 1 : 0);
