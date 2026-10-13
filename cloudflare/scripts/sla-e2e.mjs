// End-to-end SLA tests. Run through sla-check.sh, which starts a fresh local Worker with --test-scheduled.
//   node cloudflare/scripts/sla-e2e.mjs <baseUrl> <persistDir> <serverLogFile>
// Uses `wrangler d1 execute --local` to move ticket timestamps into the past so breach states can be tested without waiting.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = process.argv[2].replace(/\/$/, '');
const PERSIST = process.argv[3];
const LOG = process.argv[4];
let pass = 0, fail = 0, ipn = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  [' + String(detail).slice(0, 220) + ']'}`); };
const MIN = 60000;
const iso = (ms) => new Date(ms).toISOString();

async function call(method, path, { token, json } = {}) {
  const h = { 'cf-connecting-ip': `198.51.100.${(++ipn % 240) + 1}` };
  if (token) h.Authorization = `Bearer ${token}`;
  if (json !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : undefined });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, text };
}
function sql(statements) {
  const file = `/tmp/sla-e2e-${process.pid}.sql`;
  writeFileSync(file, statements.join(';\n') + ';\n');
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', PERSIST, '--file', file], { stdio: 'ignore', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function trigger() {
  const r = await fetch(`${BASE}/cdn-cgi/handler/scheduled`);
  await sleep(2500);
  return r.status;
}
const emails = () => (readFileSync(LOG, 'utf8').match(/Subject: \[(?:INC|SR)\d+\] SLA (?:at risk|breached: (?:response|resolution))/g) || []);

// ---------------------------------------------------------------- people
let r = await call('POST', '/api/auth/register', { json: { name: 'Admin', email: 'admin@sla.test', password: 'Str0ng-pass-1' } });
const AT = r.data.token;
r = await call('POST', '/api/users', { token: AT, json: { name: 'Agent Amy', email: 'amy@sla.test', password: 'Str0ng-pass-2', role: 'agent' } });
const amy = r.data;
r = await call('POST', '/api/users', { token: AT, json: { name: 'Requester Rob', email: 'rob@sla.test', password: 'Str0ng-pass-3', role: 'requester' } });
const rob = r.data;
const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).data.token;
const GT = await login('amy@sla.test', 'Str0ng-pass-2');
const RT = await login('rob@sla.test', 'Str0ng-pass-3');
t('test users exist (admin, agent, requester)', !!AT && !!GT && !!RT && amy.id && rob.id);

// ---------------------------------------------------------------- settings
r = await call('GET', '/api/sla/settings', { token: GT });
t('settings default to Mon-Fri 08:00-17:00 at UTC+2, 80% at-risk, no auto-raise', r.status === 200 && r.data.days.join() === '1,2,3,4,5' && r.data.start === '08:00' && r.data.end === '17:00' && r.data.offset === 120 && r.data.atRiskPct === 80 && r.data.raisePriority === false && r.data.holidays.length === 0, JSON.stringify(r.data));
const good = { offset: 120, days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', holidays: ['2026-12-25', '2026-12-16'], atRiskPct: 80, raisePriority: false };
for (const [name, patch] of [['no working days', { days: [] }], ['a weekday of 9', { days: [1, 9] }], ['end before start', { start: '17:00', end: '08:00' }], ['a bad time', { start: '8am' }], ['an offset that is not a multiple of 15', { offset: 100 }], ['an offset beyond 14 hours', { offset: 900 }],
  ['a malformed holiday', { holidays: ['25/12/2026'] }], ['at-risk of 0%', { atRiskPct: 0 }], ['at-risk of 100%', { atRiskPct: 100 }], ['raisePriority as a string', { raisePriority: 'yes' }]]) {
  r = await call('PUT', '/api/sla/settings', { token: AT, json: { ...good, ...patch } });
  t(`settings rejected: ${name}`, r.status === 400, `${r.status} ${r.text}`);
}
r = await call('PUT', '/api/sla/settings', { token: GT, json: good });
t('an agent cannot change SLA settings (403)', r.status === 403);
r = await call('PUT', '/api/sla/settings', { token: RT, json: good });
t('a requester cannot change SLA settings (403)', r.status === 403);
r = await call('GET', '/api/sla/settings', { token: RT });
t('a requester cannot read SLA settings (403)', r.status === 403);
r = await call('PUT', '/api/sla/settings', { token: AT, json: good });
t('an administrator can save valid settings (holidays are kept, sorted)', r.status === 200 && r.data.holidays.join() === '2026-12-16,2026-12-25', r.text);

// ---------------------------------------------------------------- policies
r = await call('GET', '/api/sla', { token: AT });
const pol = (applies, p) => r.data.find((x) => x.applies_to === applies && x.priority === p);
t('seeded policies exist and default to 24x7 (calendar) counting', !!pol('incident', 'P1') && pol('incident', 'P1').use_business_hours === 0);
const p1 = pol('incident', 'P1');
r = await call('PUT', `/api/sla/${p1.id}`, { token: AT, json: { use_business_hours: 'yes' } });
t('a non-boolean business-hours flag is rejected', r.status === 400);
r = await call('PUT', `/api/sla/${p1.id}`, { token: GT, json: { use_business_hours: true } });
t('an agent cannot change an SLA policy (403)', r.status === 403);
r = await call('PUT', `/api/sla/${p1.id}`, { token: AT, json: { response_time_mins: 60, resolution_time_mins: 240, use_business_hours: true } });
t('an administrator can switch incident P1 to business-hours counting (60 / 240 working minutes)', r.status === 200 && r.data.use_business_hours === 1 && r.data.resolution_time_mins === 240, r.text);

// ---------------------------------------------------------------- creating tickets: due dates by policy
const get = async (token, id) => (await call('GET', `/api/incidents/${id}`, { token })).data;
// Tickets are created as the requester, then read back as an administrator so the raw SLA columns can be checked.
const mk = async (token, over = {}) => get(AT, (await call('POST', '/api/incidents', { token, json: { title: 'SLA test', description: 'x', ...over } })).data.id);
const incP2 = await mk(RT, { priority: 'P2' });
const dCal = (Date.parse(incP2.sla_resolution_due) - Date.parse(incP2.created_at)) / MIN;
const rCal = (Date.parse(incP2.sla_response_due) - Date.parse(incP2.created_at)) / MIN;
t('calendar policy (P2: 30 / 480): due dates are exactly 30 and 480 minutes after creation', incP2.sla_mode === 'calendar' && Math.abs(dCal - 480) < 0.01 && Math.abs(rCal - 30) < 0.01, `${incP2.sla_mode} ${dCal} ${rCal}`);
const incP1 = await mk(RT, { priority: 'P1' });
const local = (isoStr) => new Date(Date.parse(isoStr) + 120 * MIN);
const inHours = (isoStr) => { const d = local(isoStr), m = d.getUTCHours() * 60 + d.getUTCMinutes(), wd = d.getUTCDay(); return wd >= 1 && wd <= 5 && m >= 480 && m <= 1020; };
t('business policy (P1: 60 / 240): both due dates land inside working hours (Mon-Fri 08:00-17:00 SAST)', incP1.sla_mode === 'business' && inHours(incP1.sla_resolution_due) && inHours(incP1.sla_response_due), `${incP1.sla_mode} ${incP1.sla_response_due} ${incP1.sla_resolution_due}`);
t('...and are never earlier than the same targets counted round the clock', Date.parse(incP1.sla_resolution_due) >= Date.parse(incP1.created_at) + 240 * MIN - 1 && Date.parse(incP1.sla_response_due) >= Date.parse(incP1.created_at) + 60 * MIN - 1);
const sr0 = (await call('GET', `/api/service-requests/${(await call('POST', '/api/service-requests', { token: RT, json: { title: 'SR SLA', priority: 'P3' } })).data.id}`, { token: AT })).data;
t('service requests get SLA due dates and a mode too (seeded P3 request policy: 240 / 2880)', sr0.sla_mode === 'calendar' && Math.abs((Date.parse(sr0.sla_resolution_due) - Date.parse(sr0.created_at)) / MIN - 2880) < 0.01 && Math.abs((Date.parse(sr0.sla_response_due) - Date.parse(sr0.created_at)) / MIN - 240) < 0.01, `${sr0.sla_mode} ${(Date.parse(sr0.sla_resolution_due) - Date.parse(sr0.created_at)) / MIN}`);

// ---------------------------------------------------------------- requesters never see SLA internals
let view = await get(RT, incP2.id);
t('a requester\'s ticket detail has no SLA state', view.sla === undefined);
r = await call('GET', '/api/incidents', { token: RT });
t('a requester\'s ticket list has no SLA state', r.data.length >= 1 && r.data.every((x) => x.sla === undefined));
const INTERNAL = ['sla_mode', 'sla_paused_at', 'sla_hold_mins', 'sla_warned_at', 'sla_resp_breached_at', 'sla_res_breached_at', 'sla_escalated_at'];
const leaky = (obj) => INTERNAL.filter((k) => k in obj);
t('a requester\'s ticket detail contains none of the internal SLA bookkeeping columns', leaky(view).length === 0, leaky(view).join());
const madeInc = (await call('POST', '/api/incidents', { token: RT, json: { title: 'leak check', description: 'x' } })).data;
const madeSr = (await call('POST', '/api/service-requests', { token: RT, json: { title: 'leak check SR' } })).data;
t('...nor does the ticket they just created (create response, incident and service request)', madeInc.id && madeSr.id && leaky(madeInc).length === 0 && leaky(madeSr).length === 0, leaky(madeInc).concat(leaky(madeSr)).join());
t('...nor their ticket list (incidents and service requests)', r.data.every((x) => leaky(x).length === 0) && (await call('GET', '/api/service-requests', { token: RT })).data.every((x) => leaky(x).length === 0));
t('...but they still see their ticket\'s due dates, as before', !!view.sla_resolution_due && !!view.sla_response_due);
view = await get(GT, incP2.id);
t('staff see the computed SLA state (response pending, resolution on track)', view.sla && view.sla.mode === 'calendar' && view.sla.response.state === 'pending' && view.sla.resolution.state === 'on_track', JSON.stringify(view.sla));

// ---------------------------------------------------------------- first response
r = await call('POST', `/api/incidents/${incP2.id}/comments`, { token: GT, json: { content: 'internal thought', is_internal: true } });
t('an internal note does NOT count as the first response', (await get(AT, incP2.id)).responded_at === null);
r = await call('POST', `/api/incidents/${incP2.id}/comments`, { token: RT, json: { content: 'any news?' } });
t('the requester\'s own comment does not count as a response', (await get(AT, incP2.id)).responded_at === null);
r = await call('POST', `/api/incidents/${incP2.id}/comments`, { token: GT, json: { content: 'We are looking into it.' } });
let v2 = await get(AT, incP2.id);
t('the first public reply from staff sets the response time, and the response is met', !!v2.responded_at && v2.sla.response.state === 'met', JSON.stringify(v2.sla));
const respAt = v2.responded_at;
await call('POST', `/api/incidents/${incP2.id}/comments`, { token: GT, json: { content: 'second reply' } });
t('later replies do not move the first-response time', (await get(AT, incP2.id)).responded_at === respAt);
const srr = (await call('POST', '/api/service-requests', { token: RT, json: { title: 'SR resp', priority: 'P3' } })).data;
await call('POST', `/api/service-requests/${srr.id}/comments`, { token: GT, json: { content: 'On it' } });
t('service requests record first response the same way', !!(await call('GET', `/api/service-requests/${srr.id}`, { token: AT })).data.responded_at);

// ---------------------------------------------------------------- pause on hold and resume
const incH = await mk(RT, { priority: 'P2' });
const dueBefore = Date.parse(incH.sla_resolution_due);
r = await call('PUT', `/api/incidents/${incH.id}`, { token: GT, json: { status: 'on_hold' } });
let h = await get(AT, incH.id);
t('putting a ticket on hold stops the clock (paused_at set, due date unchanged)', !!h.sla_paused_at && Date.parse(h.sla_resolution_due) === dueBefore && h.sla.paused === true && h.sla.resolution.state === 'paused', JSON.stringify(h.sla));
sql([`UPDATE incidents SET sla_paused_at = '${iso(Date.now() - 30 * MIN)}' WHERE id = '${incH.id}'`]); // pretend it has been on hold for 30 minutes
r = await call('PUT', `/api/incidents/${incH.id}`, { token: GT, json: { status: 'in_progress' } });
h = await get(AT, incH.id);
const pushed = (Date.parse(h.sla_resolution_due) - dueBefore) / MIN;
t('resuming credits the 30 minutes held: resolution due moves back by 30 (+/- 1 minute)', h.sla_paused_at === null && Math.abs(pushed - 30) <= 1 && h.sla_hold_mins >= 29 && h.sla_hold_mins <= 31, `pushed ${pushed}, hold ${h.sla_hold_mins}`);
const respPushed = h.responded_at ? 0 : (Date.parse(h.sla_response_due) - Date.parse(incH.sla_response_due)) / MIN;
t('...and the response due moves too (it had not been answered), but only the in-progress status counted as a response', h.responded_at !== null && respPushed === 0, `responded ${h.responded_at}`);

// ---------------------------------------------------------------- priority change recalculates from creation
const incC = await mk(RT, { priority: 'P2' });
r = await call('PUT', `/api/incidents/${incC.id}`, { token: GT, json: { priority: 'P3' } });
let c3 = await get(AT, incC.id);
t('raising/lowering priority recalculates due dates from creation: P2 -> P3 = 1440 minutes after creation', Math.abs((Date.parse(c3.sla_resolution_due) - Date.parse(c3.created_at)) / MIN - 1440) < 0.01, `${(Date.parse(c3.sla_resolution_due) - Date.parse(c3.created_at)) / MIN}`);
r = await call('PUT', `/api/incidents/${incC.id}`, { token: GT, json: { priority: 'P1' } });
c3 = await get(AT, incC.id);
t('...and P3 -> P1 uses the P1 target length (240) but keeps the counting mode the ticket was created with (calendar)', c3.sla_mode === 'calendar' && Math.abs((Date.parse(c3.sla_resolution_due) - Date.parse(c3.created_at)) / MIN - 240) < 0.01, `${c3.sla_mode} ${(Date.parse(c3.sla_resolution_due) - Date.parse(c3.created_at)) / MIN}`);

// ---------------------------------------------------------------- SLA states by moving timestamps into the past
const now = Date.now();
const setTimes = (id, createdAgoMin, respDueInMin, resDueInMin, extra = '') =>
  `UPDATE incidents SET created_at = '${iso(now - createdAgoMin * MIN)}', sla_response_due = '${iso(now + respDueInMin * MIN)}', sla_resolution_due = '${iso(now + resDueInMin * MIN)}', sla_mode = 'calendar' ${extra} WHERE id = '${id}'`;
const A = await mk(RT, { priority: 'P3', title: 'A at risk' });          // 85% used
const B = await mk(RT, { priority: 'P3', title: 'B breached' });          // past resolution due
const C = await mk(RT, { priority: 'P3', title: 'C response breached' }); // never answered, response overdue, resolution still fine
const D = await mk(RT, { priority: 'P3', title: 'D paused' });            // overdue but on hold
const E = await mk(RT, { priority: 'P3', title: 'E resolved late' });
const F = await mk(RT, { priority: 'P3', title: 'F resolved on time' });
const G = await mk(RT, { priority: 'P3', title: 'G on track' });
const B2 = await mk(RT, { priority: 'P3', title: 'B2 breached, raise test' });
sql([
  setTimes(A.id, 170, -100, 30, `, assigned_to = '${amy.id}', responded_at = '${iso(now - 160 * MIN)}'`),
  setTimes(B.id, 300, -200, -20, `, assigned_to = '${amy.id}', responded_at = '${iso(now - 280 * MIN)}'`),
  setTimes(C.id, 90, -30, 400, `, assigned_to = NULL`),
  setTimes(D.id, 600, -400, -100, `, sla_paused_at = '${iso(now - 50 * MIN)}', status = 'on_hold', assigned_to = '${amy.id}', responded_at = '${iso(now - 500 * MIN)}'`),
  setTimes(E.id, 300, -200, -20, `, status = 'resolved', resolved_at = '${iso(now - 5 * MIN)}', responded_at = '${iso(now - 280 * MIN)}'`),
  setTimes(F.id, 100, -50, 60, `, status = 'resolved', resolved_at = '${iso(now - 5 * MIN)}', responded_at = '${iso(now - 90 * MIN)}'`),
  setTimes(G.id, 10, 110, 230, `, assigned_to = '${amy.id}', responded_at = '${iso(now - 5 * MIN)}'`),
  setTimes(B2.id, 300, -200, -20, `, assigned_to = '${amy.id}', responded_at = '${iso(now - 280 * MIN)}'`),
]);
const st = async (x) => (await get(AT, x.id)).sla;
let s;
s = await st(A); t('85% of the window used -> at_risk (threshold 80%)', s.resolution.state === 'at_risk' && s.resolution.pct_used === 85, JSON.stringify(s.resolution));
s = await st(B); t('past the resolution due -> breached, with minutes overdue (about 20)', s.resolution.state === 'breached' && Math.abs(s.resolution.remaining_mins + 20) <= 1, JSON.stringify(s.resolution));
s = await st(C); t('never answered and past the response due -> response breached, resolution still on track', s.response.state === 'breached' && s.resolution.state === 'on_track', JSON.stringify(s));
s = await st(D); t('overdue but on hold -> paused, not breached', s.resolution.state === 'paused' && s.paused === true, JSON.stringify(s.resolution));
s = await st(E); t('resolved after its due time -> breached (stays breached)', s.resolution.state === 'breached', JSON.stringify(s.resolution));
s = await st(F); t('resolved before its due time -> met', s.resolution.state === 'met', JSON.stringify(s.resolution));
s = await st(G); t('plenty of time left -> on_track', s.resolution.state === 'on_track' && s.response.state === 'met', JSON.stringify(s));
r = await call('GET', '/api/incidents', { token: AT });
const byTitle = Object.fromEntries(r.data.map((x) => [x.title, x]));
t('the staff list carries the same states', byTitle['A at risk'].sla.resolution.state === 'at_risk' && byTitle['B breached'].sla.resolution.state === 'breached' && byTitle['D paused'].sla.resolution.state === 'paused');

// dashboard: a paused ticket is not "breached"
r = await call('GET', '/api/dashboard/summary', { token: AT });
t('the dashboard counts exactly the 2 open overdue tickets (B, B2) and NOT the paused overdue one (D)', r.status === 200 && r.data.incidents.breached === 2, JSON.stringify(r.data.incidents));

// ---------------------------------------------------------------- scheduled job
const before = emails().length;
let code = await trigger();
t('the scheduled job runs when triggered', code === 200, `status ${code}`);
const rawA = await get(AT, A.id), rawB = await get(AT, B.id), rawC = await get(AT, C.id), rawD = await get(AT, D.id), rawE = await get(AT, E.id), rawG = await get(AT, G.id);
t('at-risk ticket: warned once (sla_warned_at set)', !!rawA.sla_warned_at && !rawA.sla_res_breached_at);
t('breached ticket: breach recorded and escalated', !!rawB.sla_res_breached_at && !!rawB.sla_escalated_at);
t('response-breached ticket: response breach recorded, resolution untouched', !!rawC.sla_resp_breached_at && !rawC.sla_res_breached_at && !rawC.sla_escalated_at);
t('paused ticket: ignored entirely (no alerts while the clock is stopped)', !rawD.sla_warned_at && !rawD.sla_res_breached_at && !rawD.sla_resp_breached_at);
t('finished ticket: ignored', !rawE.sla_res_breached_at && !rawE.sla_warned_at);
t('on-track ticket: ignored', !rawG.sla_warned_at && !rawG.sla_res_breached_at);
const sent1 = emails().slice(before);
const count = (re) => sent1.filter((x) => re.test(x)).length;
// Amy is the assignee of A, B and B2; the admin gets breach alerts. A -> 1 at-risk mail (assignee). B -> 2 (Amy + admin). B2 -> 2. C -> 1 (no assignee, admin only).
t('emails: 1 at-risk alert for A, and breach alerts (assignee + administrator) for B and B2, response alert for C', count(/at risk/) === 1 && count(/breached: resolution/) === 4 && count(/breached: response/) >= 1, sent1.join(' | '));
const countAfterFirst = emails().length;
code = await trigger();
t('running the job again sends NOTHING new (each event is alerted once)', emails().length === countAfterFirst, `${emails().length} vs ${countAfterFirst}`);
const rawA2 = await get(AT, A.id);
t('...and does not rewrite the recorded alert times', rawA2.sla_warned_at === rawA.sla_warned_at);
t('priority is NOT changed by default when a target is breached', (await get(AT, B2.id)).priority === 'P3');

// raise-priority option
r = await call('PUT', '/api/sla/settings', { token: AT, json: { ...good, raisePriority: true } });
const B3 = await mk(RT, { priority: 'P3', title: 'B3 breached, raising on' });
sql([setTimes(B3.id, 300, -200, -20, `, assigned_to = '${amy.id}', responded_at = '${iso(now - 280 * MIN)}'`)]);
await trigger();
t('with "raise priority on breach" switched on, a newly breached P3 ticket becomes P2', (await get(AT, B3.id)).priority === 'P2');
t('...while a ticket that already breached earlier is not raised retroactively', (await get(AT, B2.id)).priority === 'P3');
await call('PUT', '/api/sla/settings', { token: AT, json: good });

// ---------------------------------------------------------------- report
r = await call('GET', '/api/sla/report', { token: GT });
const rep = r.data;
t('an agent can read the service report', r.status === 200 && rep.overall && rep.by_priority && rep.by_type, r.text.slice(0, 120));
r = await call('GET', '/api/sla/report', { token: RT });
t('a requester cannot read the service report (403)', r.status === 403);
r = await call('GET', '/api/sla/report?from=yesterday', { token: AT });
t('a malformed date is rejected (400)', r.status === 400);
const total = (await call('GET', '/api/incidents', { token: AT })).data.length + (await call('GET', '/api/service-requests', { token: AT })).data.length;
t('the report counts every ticket exactly once', rep.overall.total === total, `${rep.overall.total} vs ${total}`);
t('by type: incidents and service requests add up to the total', rep.by_type.incident.total + rep.by_type.service_request.total === rep.overall.total);
t('resolution attainment counts met and breached: F met; B, B2, B3, E breached (and others) -> met >= 1, breached >= 4', rep.overall.resolution.met >= 1 && rep.overall.resolution.breached >= 4, JSON.stringify(rep.overall.resolution));
const pctExpected = Math.round((rep.overall.resolution.met / (rep.overall.resolution.met + rep.overall.resolution.breached)) * 1000) / 10;
t('attainment % = met / (met + breached), to one decimal', rep.overall.resolution.attainment_pct === pctExpected, `${rep.overall.resolution.attainment_pct} vs ${pctExpected}`);
t('open at-risk and paused tickets are shown', rep.overall.at_risk_open >= 1 && rep.overall.paused_open >= 1, JSON.stringify({ ar: rep.overall.at_risk_open, p: rep.overall.paused_open }));
t('average first response and resolution times are reported in minutes', typeof rep.overall.avg_first_response_mins === 'number' && typeof rep.overall.avg_resolution_mins === 'number', JSON.stringify(rep.overall));
const dayAgo = iso(Date.now() - 24 * 3600000).slice(0, 10), todayStr = iso(Date.now()).slice(0, 10);
r = await call('GET', `/api/sla/report?from=${dayAgo}&to=${todayStr}`, { token: AT });
t('a range from yesterday to today includes every test ticket (some are backdated across midnight)', r.data.overall.total === total, `${r.data.overall.total} vs ${total}`);
r = await call('GET', `/api/sla/report?from=${todayStr}&to=${todayStr}`, { token: AT });
t('a one-day range returns a subset, never more than the total', r.status === 200 && r.data.overall.total <= total && r.data.overall.total >= 1, `${r.data.overall.total}`);
r = await call('GET', '/api/sla/report?from=2099-01-01', { token: AT });
t('a future-only range finds nothing, without error', r.status === 200 && r.data.overall.total === 0 && r.data.overall.resolution.attainment_pct === null);

// ---------------------------------------------------------------- existing behaviour intact
r = await call('PUT', `/api/incidents/${G.id}`, { token: GT, json: { status: 'resolved' } });
const g2 = await get(AT, G.id);
t('resolving a ticket still works and records the resolution time; the SLA is then met', g2.status === 'resolved' && !!g2.resolved_at && g2.sla.resolution.state === 'met');
r = await call('GET', '/api/incidents/export', { token: AT });
t('the CSV export still works', r.status === 200 && r.text.includes('SLA Resolution Due'));

console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} checks`);
process.exit(fail ? 1 : 0);
