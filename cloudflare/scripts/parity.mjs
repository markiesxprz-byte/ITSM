// Behavioural parity test: runs ~125 API calls against any base URL and prints normalized results.
// Usage: node cloudflare/scripts/parity.mjs http://localhost:8787  — diff the output of two servers.
const BASE = process.argv[2];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;
// "Today" and "today plus one calendar month" are dates the server writes itself (a workspace marked as provisioned).
// Normalise them, or this baseline would fail on any day other than the one it was recorded on.
const TODAY = new Date().toISOString().slice(0, 10);
const PLUS_MONTH = (() => { const [y, m, d] = TODAY.split('-').map(Number); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, new Date(Date.UTC(ny, nm, 0)).getUTCDate())).padStart(2, '0')}`; })();
const norm = (v) => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
  if (v === TODAY) return '<today>';
  if (v === PLUS_MONTH) return '<today+1m>';
  if (typeof v === 'string') return v.replace(UUID, '<id>').replace(ISO, '<ts>');
  return v;
};
const out = [];
let n = 0;
async function call(label, method, path, { token, json, raw, quiet, ip } = {}) {
  const headers = { 'cf-connecting-ip': ip || `198.51.100.${(n % 200) + 1}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: json ? JSON.stringify(json) : undefined });
  const ct = res.headers.get('content-type') || '';
  let data;
  const text = await res.text();
  if (ct.includes('application/json')) { try { data = JSON.parse(text); } catch { data = text; } } else data = text;
  const line = { step: `${String(++n).padStart(3, '0')} ${label}`, status: res.status };
  if (raw) { line.type = ct.split(';')[0]; line.text = norm(text); }
  else if (res.status !== 204 && !quiet) line.body = norm(typeof data === 'string' ? data.slice(0, 200) : data);
  out.push(JSON.stringify(line));
  return data;
}
const J = (label, m, p, o) => call(label, m, p, o);

// ---------- auth ----------
await J('login unknown user', 'POST', '/api/auth/login', { json: { email: 'no@x.co', password: 'x' } });
const owner = await J('register first -> admin', 'POST', '/api/auth/register', { json: { name: 'Owner', email: 'Owner@Co.za', password: 'pw-123456', department: 'IT' } });
await J('register is closed after the first admin', 'POST', '/api/auth/register', { json: { name: 'Early', email: 'early@co.za', password: 'pw-123456' } });
await J('requester-level user cannot change registration', 'PUT', '/api/settings/registration', { token: owner.token, json: { open: 'yes' } });
await J('admin opens self-registration', 'PUT', '/api/settings/registration', { token: owner.token, json: { open: true } });
await J('sign-in page asks whether to offer Create account', 'GET', '/api/auth/registration');
const staff = await J('register second -> requester', 'POST', '/api/auth/register', { json: { name: 'Staff', email: 'staff@co.za', password: 'pw-123456' } });
const staff2 = await J('register third -> requester', 'POST', '/api/auth/register', { json: { name: 'Staff Two', email: 'staff2@co.za', password: 'pw-123456' } });
await J('register duplicate email', 'POST', '/api/auth/register', { json: { name: 'x', email: 'staff@co.za', password: 'pw-123456' } });
await J('register missing field', 'POST', '/api/auth/register', { json: { name: 'x', email: 'y@z.co' } });
await J('register empty body', 'POST', '/api/auth/register');
await J('login wrong password', 'POST', '/api/auth/login', { json: { email: 'staff@co.za', password: 'nope' } });
await J('login missing', 'POST', '/api/auth/login', { json: {} });
const OT = owner.token, ST = staff.token, S2T = staff2.token;
const relogin = await J('login ok (case-insensitive email)', 'POST', '/api/auth/login', { json: { email: 'OWNER@co.za', password: 'pw-123456' } });
await J('me', 'GET', '/api/auth/me', { token: ST });
await J('no token', 'GET', '/api/incidents');
await J('garbage token', 'GET', '/api/incidents', { token: 'abc.def.ghi' });
await J('health-like unknown api', 'GET', '/api/does-not-exist');

// ---------- users / roles ----------
await J('users list (admin)', 'GET', '/api/users', { token: OT });
await J('create agent (admin)', 'POST', '/api/users', { token: OT, json: { name: 'Agent', email: 'agent@co.za', password: 'pw-123456', role: 'agent', department: 'Desk' } });
await J('create user as requester forbidden', 'POST', '/api/users', { token: ST, json: { name: 'x', email: 'q@z.co', password: 'pw' } });
await J('create user dup email', 'POST', '/api/users', { token: OT, json: { name: 'Agent', email: 'agent@co.za', password: 'pw-123456' } });
const agentLogin = await J('agent login', 'POST', '/api/auth/login', { json: { email: 'agent@co.za', password: 'pw-123456' } });
const AT = agentLogin.token;
const agentId = agentLogin.user.id;
await J('update user role forbidden for agent', 'PUT', `/api/users/${staff.user.id}`, { token: AT, json: { role: 'admin' } });
await J('deactivate staff2', 'PUT', `/api/users/${staff2.user.id}`, { token: OT, json: { is_active: false } });
await J('deactivated user cannot login', 'POST', '/api/auth/login', { json: { email: 'staff2@co.za', password: 'pw-123456' } });
await J('deactivated user: token they already hold stops working', 'GET', '/api/incidents', { token: S2T });
await J('reactivate staff2', 'PUT', `/api/users/${staff2.user.id}`, { token: OT, json: { is_active: true } });
await J('get user 404', 'GET', '/api/users/nope', { token: OT });

// ---------- first-run defaults ----------
const sla = await J('sla defaults', 'GET', '/api/sla', { token: OT });
const cat = await J('catalog defaults', 'GET', '/api/service-requests/catalog', { token: ST });
await J('kb defaults (requester)', 'GET', '/api/knowledge', { token: ST });

// ---------- incidents ----------
await J('incident missing title', 'POST', '/api/incidents', { token: ST, json: {} });
const inc1 = await J('incident create P1', 'POST', '/api/incidents', { token: ST, json: { title: 'Email down', description: 'cannot send', priority: 'P1', category: 'email' } });
const inc2 = await J('incident create default prio', 'POST', '/api/incidents', { token: S2T, json: { title: 'VPN drops' } });
await J('requester list sees own only', 'GET', '/api/incidents', { token: ST });
await J('agent list sees all', 'GET', '/api/incidents', { token: AT });
await J('filter status+priority', 'GET', '/api/incidents?priority=P1&status=new', { token: AT });
await J('search q', 'GET', '/api/incidents?q=VPN', { token: AT });
await J('other requester forbidden', 'GET', `/api/incidents/${inc1.id}`, { token: S2T });
await J('requester cannot update', 'PUT', `/api/incidents/${inc1.id}`, { token: ST, json: { status: 'resolved' } });
await J('agent -> in_progress + assign', 'PUT', `/api/incidents/${inc1.id}`, { token: AT, json: { status: 'in_progress', assigned_to: agentId } });
await J('agent -> resolved', 'PUT', `/api/incidents/${inc1.id}`, { token: AT, json: { status: 'resolved' } });
await J('agent -> closed', 'PUT', `/api/incidents/${inc1.id}`, { token: AT, json: { status: 'closed' } });
await J('update 404', 'PUT', '/api/incidents/nope', { token: AT, json: { status: 'closed' } });
await J('comment public by requester', 'POST', `/api/incidents/${inc1.id}/comments`, { token: ST, json: { content: 'any update?' } });
await J('internal comment by requester -> 403', 'POST', `/api/incidents/${inc1.id}/comments`, { token: ST, json: { content: 'x', is_internal: true } });
await J('internal comment by agent', 'POST', `/api/incidents/${inc1.id}/comments`, { token: AT, json: { content: 'INTERNAL root cause TBD', is_internal: true } });
await J('comment empty', 'POST', `/api/incidents/${inc1.id}/comments`, { token: AT, json: {} });
const incReq = await J('requester detail: NO internal notes', 'GET', `/api/incidents/${inc1.id}`, { token: ST });
await J('agent detail: sees internal notes', 'GET', `/api/incidents/${inc1.id}`, { token: AT });

// ---------- service requests ----------
const laptop = cat.find((c) => c.name === 'New Laptop Request');
const pwd = cat.find((c) => c.name === 'Password Reset');
const sr1 = await J('SR needing approval', 'POST', '/api/service-requests', { token: ST, json: { title: 'Laptop', catalog_item_id: laptop.id } });
const sr2 = await J('SR no approval', 'POST', '/api/service-requests', { token: ST, json: { title: 'Pwd', catalog_item_id: pwd.id, priority: 'P2' } });
const sr3 = await J('SR to reject', 'POST', '/api/service-requests', { token: S2T, json: { title: 'License', catalog_item_id: laptop.id } });
await J('requester cannot approve', 'POST', `/api/service-requests/${sr1.id}/approve`, { token: ST, json: { decision: 'approved' } });
await J('approve invalid decision', 'POST', `/api/service-requests/${sr1.id}/approve`, { token: AT, json: { decision: 'maybe' } });
await J('approve ok', 'POST', `/api/service-requests/${sr1.id}/approve`, { token: AT, json: { decision: 'approved' } });
await J('reject ok', 'POST', `/api/service-requests/${sr3.id}/approve`, { token: AT, json: { decision: 'rejected' } });
await J('SR fulfil', 'PUT', `/api/service-requests/${sr1.id}`, { token: AT, json: { status: 'fulfilled', assigned_to: agentId } });
await J('SR list requester', 'GET', '/api/service-requests', { token: ST });
await J('SR detail forbidden other', 'GET', `/api/service-requests/${sr1.id}`, { token: S2T });
await J('SR internal comment', 'POST', `/api/service-requests/${sr1.id}/comments`, { token: AT, json: { content: 'INTERNAL budget note', is_internal: true } });
await J('SR requester detail hides internal', 'GET', `/api/service-requests/${sr1.id}`, { token: ST });
await J('catalog create (admin)', 'POST', '/api/service-requests/catalog', { token: OT, json: { name: 'Monitor', category: 'hardware', requires_approval: true, fulfillment_team: 'IT' } });
await J('catalog create forbidden', 'POST', '/api/service-requests/catalog', { token: AT, json: { name: 'x' } });

// ---------- problems ----------
await J('problems forbidden for requester', 'GET', '/api/problems', { token: ST });
const prob = await J('problem create + link incidents', 'POST', '/api/problems', { token: AT, json: { title: 'Mail relay instability', priority: 'P2', incident_ids: [inc1.id, inc2.id] } });
await J('problem detail (linked incidents)', 'GET', `/api/problems/${prob.id}`, { token: AT });
await J('incident now has problem_id', 'GET', `/api/incidents/${inc2.id}`, { token: AT });
await J('problem root cause + resolved', 'PUT', `/api/problems/${prob.id}`, { token: AT, json: { root_cause: 'Relay disk full', workaround: 'Restart', status: 'resolved' } });
await J('problem comment', 'POST', `/api/problems/${prob.id}/comments`, { token: AT, json: { content: 'fixed' } });
await J('problem missing title', 'POST', '/api/problems', { token: AT, json: {} });

// ---------- changes ----------
await J('change create forbidden for requester', 'POST', '/api/changes', { token: ST, json: { title: 'x' } });
const chgN = await J('change normal -> pending', 'POST', '/api/changes', { token: AT, json: { title: 'Upgrade DB', risk: 'high', implementation_plan: 'a', backout_plan: 'b' } });
const chgS = await J('change standard -> approved', 'POST', '/api/changes', { token: AT, json: { title: 'Patch', change_type: 'standard', risk: 'low' } });
await J('agent cannot approve change', 'POST', `/api/changes/${chgN.id}/approve`, { token: AT, json: { decision: 'approved' } });
await J('admin approves change', 'POST', `/api/changes/${chgN.id}/approve`, { token: OT, json: { decision: 'approved' } });
await J('change update status', 'PUT', `/api/changes/${chgN.id}`, { token: AT, json: { status: 'completed' } });
await J('change comment (staff)', 'POST', `/api/changes/${chgN.id}/comments`, { token: AT, json: { content: 'INTERNAL cab note', is_internal: true } });
await J('change list as requester', 'GET', '/api/changes', { token: ST });
await J('change detail hides internal for requester', 'GET', `/api/changes/${chgN.id}`, { token: ST });
await J('change filter type', 'GET', '/api/changes?change_type=standard', { token: AT });

// ---------- cmdb ----------
const ci1 = await J('ci create', 'POST', '/api/cmdb', { token: AT, json: { name: 'WEB-01', ci_type: 'server', ip_address: '10.0.0.1' } });
const ci2 = await J('ci create 2', 'POST', '/api/cmdb', { token: AT, json: { name: 'DB-01', ci_type: 'database' } });
await J('ci create missing', 'POST', '/api/cmdb', { token: AT, json: { name: 'x' } });
const rel = await J('ci relationship', 'POST', `/api/cmdb/${ci1.id}/relationships`, { token: AT, json: { child_ci_id: ci2.id } });
await J('ci detail (relationships)', 'GET', `/api/cmdb/${ci1.id}`, { token: AT });
await J('ci update', 'PUT', `/api/cmdb/${ci1.id}`, { token: AT, json: { status: 'maintenance' } });
await J('ci list filter', 'GET', '/api/cmdb?ci_type=server', { token: ST });
await J('ci search', 'GET', '/api/cmdb?q=DB', { token: ST });
await J('ci requester cannot create', 'POST', '/api/cmdb', { token: ST, json: { name: 'x', ci_type: 'server' } });
await J('ci delete relationship', 'DELETE', `/api/cmdb/relationships/${rel.id}`, { token: AT });
await J('ci delete forbidden for agent', 'DELETE', `/api/cmdb/${ci2.id}`, { token: AT });
await J('ci delete admin', 'DELETE', `/api/cmdb/${ci2.id}`, { token: OT });
await J('incident linked to ci', 'POST', '/api/incidents', { token: ST, json: { title: 'Web slow', ci_id: ci1.id } });

// ---------- knowledge base ----------
const art = await J('kb create draft', 'POST', '/api/knowledge', { token: AT, json: { title: 'Draft Article', content: 'secret draft', status: 'draft', tags: 'a,b' } });
const pub = await J('kb create published', 'POST', '/api/knowledge', { token: AT, json: { title: 'Reset VPN', content: 'Do the thing', category: 'network' } });
await J('kb list requester hides drafts', 'GET', '/api/knowledge', { token: ST });
await J('kb list agent sees drafts', 'GET', '/api/knowledge?status=draft', { token: AT });
await J('kb draft forbidden for requester', 'GET', `/api/knowledge/${art.id}`, { token: ST });
await J('kb view increments', 'GET', `/api/knowledge/${pub.id}`, { token: ST });
await J('kb feedback helpful', 'POST', `/api/knowledge/${pub.id}/feedback`, { token: ST, json: { helpful: true } });
await J('kb feedback not helpful', 'POST', `/api/knowledge/${pub.id}/feedback`, { token: ST, json: { helpful: false } });
await J('kb search', 'GET', '/api/knowledge?q=VPN', { token: ST });
await J('kb update', 'PUT', `/api/knowledge/${art.id}`, { token: AT, json: { status: 'published' } });
await J('kb delete forbidden agent', 'DELETE', `/api/knowledge/${art.id}`, { token: AT });
await J('kb delete admin', 'DELETE', `/api/knowledge/${art.id}`, { token: OT });
await J('kb create missing', 'POST', '/api/knowledge', { token: AT, json: { title: 'x' } });

// ---------- sla ----------
const pol = await J('sla create', 'POST', '/api/sla', { token: OT, json: { name: 'VIP', applies_to: 'incident', priority: 'P1', response_time_mins: 5, resolution_time_mins: 60 } });
await J('sla create forbidden', 'POST', '/api/sla', { token: AT, json: { name: 'x', applies_to: 'incident', priority: 'P1', response_time_mins: 1, resolution_time_mins: 1 } });
await J('sla create missing', 'POST', '/api/sla', { token: OT, json: { name: 'x' } });
await J('sla update', 'PUT', `/api/sla/${pol.id}`, { token: OT, json: { response_time_mins: 10 } });
await J('sla delete', 'DELETE', `/api/sla/${pol.id}`, { token: OT });

// ---------- dashboard ----------
await J('dashboard summary', 'GET', '/api/dashboard/summary', { token: AT });
const act = await J('recent activity (count only)', 'GET', '/api/dashboard/recent-activity', { token: AT });
out.push(JSON.stringify({ step: 'recent-activity length', n: act.length }));

// ---------- csv exports ----------
for (const [label, p] of [['incidents', 'incidents'], ['service requests', 'service-requests'], ['problems', 'problems'], ['changes', 'changes'], ['cmdb', 'cmdb']]) {
  await J(`csv ${label}`, 'GET', `/api/${p}/export`, { token: AT, raw: true });
}
await J('csv forbidden requester', 'GET', '/api/incidents/export', { token: ST });
await J('csv filter', 'GET', '/api/incidents/export?priority=P1', { token: AT, raw: true });

// ---------- leads (public) ----------
await J('lead public submit', 'POST', '/api/leads', { json: { name: 'Jane', email: 'jane@acme.co.za', company: 'Acme', team_size: '11-25', region: 'south-africa', plan: 'growth', workspace_slug: 'acme', consent: true, consent_version: '2026-10-12' } });
await J('lead missing fields', 'POST', '/api/leads', { json: { name: 'x' } });
await J('lead list unauth', 'GET', '/api/leads');
await J('lead list requester forbidden', 'GET', '/api/leads', { token: ST });
const leads = await J('lead list admin', 'GET', '/api/leads', { token: OT });
await J('lead update', 'PUT', `/api/leads/${leads[0].id}`, { token: OT, json: { status: 'contacted', notes: 'called' } });
await J('lead update 404', 'PUT', '/api/leads/nope', { token: OT, json: { status: 'x' } });

// ---------- trial end dates (free month = 1 calendar month from the day the workspace is ready) ----------
const L1 = `/api/leads/${leads[0].id}`;
await J('lead update: invalid status rejected', 'PUT', L1, { token: OT, json: { status: 'banana' } });
await J('lead update: requester forbidden', 'PUT', L1, { token: ST, json: { status: 'closed' } });
const trial = async (label, json) => {
  const r = await J(label, 'PUT', L1, { token: OT, json });
  out.push(JSON.stringify({ step: `${label} => dates`, start: r.provisioned_at, ends: r.trial_ends_at }));
};
await trial('trial: provision with explicit start', { status: 'provisioned', provisioned_at: '2026-10-12' }); // 2026-11-12
await trial('trial: 31 Jan clamps to 28 Feb', { provisioned_at: '2026-01-31' });
await trial('trial: leap year 31 Jan -> 29 Feb', { provisioned_at: '2024-01-31' });
await trial('trial: year rollover', { provisioned_at: '2026-12-15' });
await J('trial: non-date text rejected', 'PUT', L1, { token: OT, json: { provisioned_at: 'not-a-date' } });
await J('trial: impossible date rejected', 'PUT', L1, { token: OT, json: { provisioned_at: '2026-02-30' } });
await J('trial: other status keeps the start date', 'PUT', L1, { token: OT, json: { status: 'closed' } });
await J('lead public submit #2', 'POST', '/api/leads', { json: { name: 'Sam', email: 'sam@beta.co.za', company: 'Beta Co', consent: true } });
const all2 = await J('lead list (two leads)', 'GET', '/api/leads', { token: OT });
const second = all2.find((l) => l.company === 'Beta Co');
const auto = await call('trial: provisioning with no date starts today', 'PUT', `/api/leads/${second.id}`, { token: OT, json: { status: 'provisioned' }, quiet: true });
out.push(JSON.stringify({ step: 'trial: auto start is today (UTC) and ends a month later', ok: auto.provisioned_at === new Date().toISOString().slice(0, 10) && auto.trial_ends_at > auto.provisioned_at }));
const notProv = await call('trial: not-provisioned lead has no end date', 'GET', '/api/leads?status=new', { token: OT, quiet: true });
out.push(JSON.stringify({ step: 'trial: leads in status new', count: notProv.length }));

// ---------- demo and waitlist requests ----------
const leadCount = async () => (await call('lead count', 'GET', '/api/leads', { token: OT, quiet: true })).length;
const before = await leadCount();
await J('request without consent is refused', 'POST', '/api/leads', { json: { name: 'No Consent', email: 'nc@x.co', company: 'NC Ltd' } });
await J('request with consent=false is refused', 'POST', '/api/leads', { json: { name: 'No Consent', email: 'nc@x.co', company: 'NC Ltd', consent: false } });
await J('spam trap: hidden field filled looks like success', 'POST', '/api/leads', { json: { name: 'Bot', email: 'bot@x.co', company: 'Bot Ltd', consent: true, website: 'http://spam.example' } });
out.push(JSON.stringify({ step: 'spam trap stored nothing', stored: (await leadCount()) - before }));
await J('demo request (Starter)', 'POST', '/api/leads', { json: { name: 'Demo Person', email: 'demo@acme.co.za', company: 'Acme Co', team_size: '4-10', plan: 'starter', kind: 'demo', message: 'We have a 6 person IT team.', consent: true, consent_version: '2026-10-12' } });
await J('same demo request again is not duplicated', 'POST', '/api/leads', { json: { name: 'Demo Person', email: 'DEMO@acme.co.za', company: 'Acme Co', team_size: '4-10', plan: 'starter', kind: 'demo', consent: true } });
out.push(JSON.stringify({ step: 'duplicate created no second record', stored: (await leadCount()) - before }));
await J('waitlist sign-up (Professional)', 'POST', '/api/leads', { json: { name: 'Wait Lister', email: 'wait@msp.co.za', company: 'MSP Co', plan: 'professional', kind: 'waitlist', consent: true, consent_version: '2026-10-12' } });
const afterList = await call('lead list after requests', 'GET', '/api/leads', { token: OT, quiet: true });
const w = afterList.find((l) => l.email === 'wait@msp.co.za');
const d = afterList.find((l) => l.email === 'demo@acme.co.za');
out.push(JSON.stringify({ step: 'stored request fields', waitlist: { kind: w.kind, plan: w.plan, consent: w.consent, consentVersion: w.consent_version, consentRecorded: !!w.consent_at }, demo: { kind: d.kind, message: d.message, consent: d.consent } }));
await J('retired plan name still accepted', 'POST', '/api/leads', { json: { name: 'Old Page', email: 'old@x.co', company: 'Old Ltd', plan: 'pro', consent: true } });
await J('invalid request kind rejected', 'POST', '/api/leads', { json: { name: 'x', email: 'x@y.co', company: 'z', kind: 'banana', consent: true } });
await J('oversize message rejected', 'POST', '/api/leads', { json: { name: 'x', email: 'x@y.co', company: 'z', message: 'm'.repeat(2001), consent: true } });
const csvRes = await fetch(BASE + '/api/leads/export', { headers: { Authorization: `Bearer ${OT}`, 'cf-connecting-ip': '198.51.100.201' } });
const csvText = await csvRes.text();
out.push(JSON.stringify({ step: 'admin can export requests as CSV', status: csvRes.status, type: (csvRes.headers.get('content-type') || '').split(';')[0], header: csvText.split('\r\n')[0], rows: csvText.split('\r\n').length - 1 }));
await J('requester cannot export requests', 'GET', '/api/leads/export', { token: ST });


// ---------- ticket separation, access control, validation, lifecycle, throttling, headers ----------
// (inc2 and sr3 belong to staff2; ST is a different requester. AT is an agent, OT the admin.)
await J('requester cannot comment on another requester\'s incident', 'POST', `/api/incidents/${inc2.id}/comments`, { token: ST, json: { content: 'not my ticket' } });
await J('requester cannot comment on another requester\'s request', 'POST', `/api/service-requests/${sr3.id}/comments`, { token: ST, json: { content: 'not my request' } });
await J('requester cannot list users', 'GET', '/api/users', { token: ST });
await J('requester cannot read a user profile', 'GET', `/api/users/${owner.user.id}`, { token: ST });
const agentUsers = await call('agent can list users', 'GET', '/api/users', { token: AT, quiet: true });
out.push(JSON.stringify({ step: 'agent can list users => count', count: agentUsers.length }));
await J('requester cannot read the CMDB', 'GET', '/api/cmdb', { token: ST });
await J('requester cannot read one CI', 'GET', `/api/cmdb/${ci1.id}`, { token: ST });
await J('requester cannot read changes', 'GET', '/api/changes', { token: ST });
await J('requester cannot read one change', 'GET', `/api/changes/${chgN.id}`, { token: ST });
await J('requester cannot read the activity feed', 'GET', '/api/dashboard/recent-activity', { token: ST });
const mineDash = await call('requester dashboard', 'GET', '/api/dashboard/summary', { token: ST, quiet: true });
const freshReq = await J('register a brand-new requester', 'POST', '/api/auth/register', { json: { name: 'Fresh', email: 'fresh@co.za', password: 'pw-123456' } });
const freshDash = await call('new requester dashboard', 'GET', '/api/dashboard/summary', { token: freshReq.token, quiet: true });
out.push(JSON.stringify({ step: 'dashboards are scoped to the viewer', requesterWithTickets: mineDash.incidents.open, brandNewRequester: freshDash.incidents.open, requesterSeesProblems: mineDash.problems.open, requesterSeesCmdb: mineDash.cmdb.total }));
const staffDash = await call('staff dashboard', 'GET', '/api/dashboard/summary', { token: AT, quiet: true });
out.push(JSON.stringify({ step: 'staff dashboard is organisation-wide', incidentsOpen: staffDash.incidents.open }));
const own = await J('requester cannot assign or link CIs when creating a ticket', 'POST', '/api/incidents', { token: ST, json: { title: 'requester tries to assign', assigned_to: agentId, ci_id: ci1.id } });
out.push(JSON.stringify({ step: 'requester-set assignment ignored', assigned_to: own.assigned_to, ci_id: own.ci_id }));

// validation
const longText = 'x'.repeat(100000);
await J('register: weak password rejected', 'POST', '/api/auth/register', { json: { name: 'Weak', email: 'weak@co.za', password: 'x' } });
await J('register: invalid email rejected', 'POST', '/api/auth/register', { json: { name: 'Bad', email: 'not-an-email', password: 'pw-123456' } });
await J('incident: invalid priority rejected', 'POST', '/api/incidents', { token: ST, json: { title: 'x', priority: 'P9' } });
await J('incident: invalid status rejected', 'PUT', `/api/incidents/${inc2.id}`, { token: AT, json: { status: 'banana' } });
await J('incident: oversize title rejected', 'POST', '/api/incidents', { token: ST, json: { title: longText } });
await J('incident: cannot assign to a requester', 'PUT', `/api/incidents/${inc2.id}`, { token: AT, json: { assigned_to: staff.user.id } });
await J('incident: unknown CI rejected', 'POST', '/api/incidents', { token: AT, json: { title: 'x', ci_id: 'nope' } });
await J('comment: oversize rejected', 'POST', `/api/incidents/${inc2.id}/comments`, { token: AT, json: { content: longText } });
await J('request: unknown catalog item rejected', 'POST', '/api/service-requests', { token: ST, json: { title: 'x', catalog_item_id: 'nope' } });
await J('problem: unknown incident rejected', 'POST', '/api/problems', { token: AT, json: { title: 'x', incident_ids: ['nope'] } });
await J('cmdb: invalid type rejected', 'POST', '/api/cmdb', { token: AT, json: { name: 'x', ci_type: 'toaster' } });
await J('cmdb: self-dependency rejected', 'POST', `/api/cmdb/${ci1.id}/relationships`, { token: AT, json: { child_ci_id: ci1.id } });
await J('change: invalid risk rejected', 'POST', '/api/changes', { token: AT, json: { title: 'x', risk: 'astronomical' } });
await J('sla: negative minutes rejected', 'POST', '/api/sla', { token: OT, json: { name: 'x', applies_to: 'incident', priority: 'P1', response_time_mins: -1, resolution_time_mins: 60 } });
await J('kb: invalid status rejected', 'POST', '/api/knowledge', { token: AT, json: { title: 'x', content: 'y', status: 'secret' } });
await J('user: invalid role rejected', 'POST', '/api/users', { token: OT, json: { name: 'x', email: 'role@co.za', password: 'pw-123456', role: 'superuser' } });
await J('lead: invalid plan rejected', 'POST', '/api/leads', { json: { name: 'x', email: 'x@y.co', company: 'z', plan: 'platinum' } });
await J('lead: invalid email rejected', 'POST', '/api/leads', { json: { name: 'x', email: 'nope', company: 'z' } });

// account lifecycle
await J('last admin cannot be deactivated', 'PUT', `/api/users/${owner.user.id}`, { token: OT, json: { is_active: false } });
await J('last admin cannot be demoted', 'PUT', `/api/users/${owner.user.id}`, { token: OT, json: { role: 'agent' } });
const tmp = await J('create a second admin', 'POST', '/api/users', { token: OT, json: { name: 'Temp Admin', email: 'tmpadmin@co.za', password: 'pw-123456', role: 'admin' } });
const tmpLogin = await J('second admin signs in', 'POST', '/api/auth/login', { json: { email: 'tmpadmin@co.za', password: 'pw-123456' } });
await J('second admin can read leads (admin-only)', 'GET', '/api/leads', { token: tmpLogin.token });
await J('owner demotes the second admin', 'PUT', `/api/users/${tmp.id}`, { token: OT, json: { role: 'agent' } });
await J('demotion takes effect immediately (same token)', 'GET', '/api/leads', { token: tmpLogin.token });

// password recovery
await J('admin resets a locked-out user\'s password', 'PUT', `/api/users/${staff2.user.id}/password`, { token: OT, json: { password: 'Reset-pass-1' } });
await J('requester cannot reset passwords', 'PUT', `/api/users/${staff2.user.id}/password`, { token: ST, json: { password: 'Hacked-pass-1' } });
await J('reset: weak password rejected', 'PUT', `/api/users/${staff2.user.id}/password`, { token: OT, json: { password: 'short' } });
await J('reset: unknown user', 'PUT', '/api/users/nope/password', { token: OT, json: { password: 'Reset-pass-1' } });
await J('old password no longer works after a reset', 'POST', '/api/auth/login', { json: { email: 'staff2@co.za', password: 'pw-123456' } });
await J('new password works after a reset', 'POST', '/api/auth/login', { json: { email: 'staff2@co.za', password: 'Reset-pass-1' } });
await J('change password: wrong current password', 'POST', '/api/auth/change-password', { token: S2T, json: { current_password: 'not-it', new_password: 'Another-pass-1' } });
await J('change password: new password too short', 'POST', '/api/auth/change-password', { token: S2T, json: { current_password: 'Reset-pass-1', new_password: 'short' } });
await J('change password: missing fields', 'POST', '/api/auth/change-password', { token: S2T, json: {} });
await J('change password: success', 'POST', '/api/auth/change-password', { token: S2T, json: { current_password: 'Reset-pass-1', new_password: 'Another-pass-1' } });
await J('after changing: the reset password is dead', 'POST', '/api/auth/login', { json: { email: 'staff2@co.za', password: 'Reset-pass-1' } });
await J('after changing: the new password works', 'POST', '/api/auth/login', { json: { email: 'staff2@co.za', password: 'Another-pass-1' } });
const pwGuess = [];
for (let i = 1; i <= 6; i++) { const r = await fetch(BASE + '/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ST}` }, body: JSON.stringify({ current_password: 'guess-' + i, new_password: 'Whatever-pass-1' }) }); pwGuess.push(r.status); }
out.push(JSON.stringify({ step: 'guessing the current password is throttled', statuses: pwGuess }));

// registration controls
await J('admin limits registration to one email domain', 'PUT', '/api/settings/registration', { token: OT, json: { open: true, domain: '@Acme.co.za' } });
await J('registration outside the domain refused', 'POST', '/api/auth/register', { json: { name: 'Out', email: 'out@other.com', password: 'pw-123456' } });
await J('registration inside the domain allowed', 'POST', '/api/auth/register', { json: { name: 'In', email: 'in@acme.co.za', password: 'pw-123456' } });
await J('sign-in page sees the domain rule', 'GET', '/api/auth/registration');
await J('invalid domain rejected', 'PUT', '/api/settings/registration', { token: OT, json: { open: true, domain: 'not a domain' } });
await J('requester cannot change registration', 'PUT', '/api/settings/registration', { token: ST, json: { open: true } });
await J('admin closes registration again', 'PUT', '/api/settings/registration', { token: OT, json: { open: false } });
await J('registration refused when closed', 'POST', '/api/auth/register', { json: { name: 'Late', email: 'late@acme.co.za', password: 'pw-123456' } });

// sign-in throttling (per client IP + account; a real user elsewhere is unaffected)
await J('admin reopens registration for the next step', 'PUT', '/api/settings/registration', { token: OT, json: { open: true } });
await J('account to be guessed at', 'POST', '/api/auth/register', { json: { name: 'Target', email: 'target@co.za', password: 'Correct-pass-1' } });
const attempt = async (password, ip) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ email: 'target@co.za', password }) });
const guesses = [];
let retryAfter = null;
for (let i = 1; i <= 6; i++) { const r = await attempt('wrong-' + i, '203.0.113.9'); guesses.push(r.status); if (r.status === 429) retryAfter = r.headers.get('retry-after'); }
out.push(JSON.stringify({ step: 'six wrong guesses from one address', statuses: guesses, retryAfterSent: Number(retryAfter) > 0 }));
const lockedRight = await attempt('Correct-pass-1', '203.0.113.9');
out.push(JSON.stringify({ step: 'right password from the locked address is also refused', status: lockedRight.status }));
const elsewhere = await attempt('Correct-pass-1', '203.0.113.77');
out.push(JSON.stringify({ step: 'the real user, from a different address, signs in fine', status: elsewhere.status }));

// browser protections
const home = await fetch(BASE + '/');
const api = await fetch(BASE + '/api/health');
const csp = home.headers.get('content-security-policy') || '';
out.push(JSON.stringify({ step: 'website security headers', nosniff: !!home.headers.get('x-content-type-options'), noFraming: !!home.headers.get('x-frame-options'), referrerPolicy: !!home.headers.get('referrer-policy'), csp: csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), hsts: !!home.headers.get('strict-transport-security') }));
out.push(JSON.stringify({ step: 'API security headers', nosniff: api.headers.get('x-content-type-options'), cache: api.headers.get('cache-control'), noFraming: api.headers.get('x-frame-options'), referrer: api.headers.get('referrer-policy') }));

console.log(out.join('\n'));
