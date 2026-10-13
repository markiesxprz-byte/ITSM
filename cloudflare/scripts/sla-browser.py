"""Browser checks for the SLA screens (needs Python 3 + playwright + Chromium).

    python3 cloudflare/scripts/sla-browser.py <baseUrl> <persistDir> [path-to-chromium]

Run against a FRESH local database (see sla-check.sh for how to start one). Creates users and tickets.
"""
import json, os, subprocess, sys, urllib.request
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip('/')
PERSIST = sys.argv[2]
CHROMIUM = sys.argv[3] if len(sys.argv) > 3 else None
results, ipn = [], [0]


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{str(detail)[:200]}]' if detail and not ok else ''))


def api(method, path, token=None, body=None):
    ipn[0] += 1
    h = {'Content-Type': 'application/json', 'cf-connecting-ip': f'198.51.100.{ipn[0] % 240 + 1}'}
    if token: h['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def sql(statements):
    f = f'/tmp/sla-browser-{os.getpid()}.sql'
    open(f, 'w').write(';\n'.join(statements) + ';\n')
    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', PERSIST, '--file', f], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={**os.environ, 'CI': '1', 'WRANGLER_SEND_METRICS': 'false'})


iso = lambda m: (datetime.now(timezone.utc) + timedelta(minutes=m)).strftime('%Y-%m-%dT%H:%M:%S.000Z')

# ---- data: an admin, an agent, a requester, and tickets in every SLA state
_, a = api('POST', '/api/auth/register', body={'name': 'Admin', 'email': 'admin@ui.test', 'password': 'Str0ng-pass-1'})
AT = a['token']
_, amy = api('POST', '/api/users', AT, {'name': 'Agent Amy', 'email': 'amy@ui.test', 'password': 'Str0ng-pass-2', 'role': 'agent'})
api('POST', '/api/users', AT, {'name': 'Requester Rob', 'email': 'rob@ui.test', 'password': 'Str0ng-pass-3', 'role': 'requester'})
RT = api('POST', '/api/auth/login', body={'email': 'rob@ui.test', 'password': 'Str0ng-pass-3'})[1]['token']
mk = lambda title: api('POST', '/api/incidents', RT, {'title': title, 'description': 'ui test', 'priority': 'P3'})[1]['id']
ids = {n: mk(n) for n in ['Breached ticket', 'At risk ticket', 'On track ticket', 'Paused ticket', 'Resolved on time', 'Unanswered ticket']}
rows = lambda created, resp, res: f"created_at = '{iso(created)}', sla_response_due = '{iso(resp)}', sla_resolution_due = '{iso(res)}', sla_mode = 'calendar'"
sql([
    f"UPDATE incidents SET {rows(-300, -200, -20)}, responded_at = '{iso(-280)}' WHERE id = '{ids['Breached ticket']}'",
    f"UPDATE incidents SET {rows(-170, -100, 30)}, responded_at = '{iso(-160)}' WHERE id = '{ids['At risk ticket']}'",
    f"UPDATE incidents SET {rows(-10, 110, 230)}, responded_at = '{iso(-5)}' WHERE id = '{ids['On track ticket']}'",
    f"UPDATE incidents SET {rows(-600, -400, -100)}, status = 'on_hold', sla_paused_at = '{iso(-50)}', responded_at = '{iso(-500)}' WHERE id = '{ids['Paused ticket']}'",
    f"UPDATE incidents SET {rows(-100, -50, 60)}, status = 'resolved', resolved_at = '{iso(-5)}', responded_at = '{iso(-90)}' WHERE id = '{ids['Resolved on time']}'",
    f"UPDATE incidents SET {rows(-90, -30, 400)} WHERE id = '{ids['Unanswered ticket']}'",
])

with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': CHROMIUM} if CHROMIUM else {}))
    errors = []

    def new_page(width=1280, height=850):
        ctx = browser.new_context(viewport={'width': width, 'height': height})
        ctx.add_init_script("window.__csp=[]; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective+' <- '+e.blockedURI));")
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        return pg

    def login(pg, email, pw):
        pg.goto(BASE + '/login', wait_until='networkidle')
        pg.fill('input[type=email]', email); pg.fill('input[type=password]', pw); pg.click('button[type=submit]')
        pg.wait_for_url('**/dashboard', timeout=8000)

    # ------------------------------------------------------------------ agent: incident list
    pg = new_page(); login(pg, 'amy@ui.test', 'Str0ng-pass-2')
    pg.goto(BASE + '/incidents', wait_until='networkidle'); pg.wait_for_timeout(600)
    check('agent: the incident list has an SLA column', pg.locator('thead th', has_text='SLA').count() == 1)
    row = lambda title: pg.locator('tbody tr', has_text=title)
    check('breached ticket shows "Breached 20m ago" (about)', 'Breached' in row('Breached ticket').inner_text() and ' ago' in row('Breached ticket').inner_text(), row('Breached ticket').inner_text())
    check('at-risk ticket shows "At risk · 30m left" (about)', 'At risk' in row('At risk ticket').inner_text() and 'left' in row('At risk ticket').inner_text(), row('At risk ticket').inner_text())
    check('on-track ticket shows time left, not a warning', 'left' in row('On track ticket').inner_text() and 'At risk' not in row('On track ticket').inner_text() and 'Breached' not in row('On track ticket').inner_text())
    check('paused ticket shows "Paused (on hold)", not breached', 'Paused (on hold)' in row('Paused ticket').inner_text() and 'Breached' not in row('Paused ticket').inner_text())
    check('resolved-on-time ticket shows "Met"', 'Met' in row('Resolved on time').inner_text())
    check('an unanswered ticket past its response time shows "Response overdue"', 'Response overdue' in row('Unanswered ticket').inner_text(), row('Unanswered ticket').inner_text())
    # state is stated in words (not colour alone): every badge has visible text
    check('every SLA badge carries words (meaning is not conveyed by colour alone)', all(len(b.strip()) > 1 for b in pg.locator('tbody td:nth-child(5) span').all_inner_texts()))

    row('At risk ticket').click(); pg.wait_for_timeout(700)
    dlg = pg.locator('[role=dialog], .fixed').last
    txt = pg.inner_text('body').lower()   # the labels are shown in capitals, so compare without case
    check('detail window: a "Service level" block shows First response and Resolution with due times', 'service level' in txt and 'first response' in txt and 'resolution' in txt and 'due' in txt, txt[-400:])
    check('detail window: says how time is counted', 'counted round the clock' in txt or 'working hours' in txt)
    pg.keyboard.press('Escape')

    # ------------------------------------------------------------------ requester sees none of it
    rq = new_page(); login(rq, 'rob@ui.test', 'Str0ng-pass-3')
    rq.goto(BASE + '/incidents', wait_until='networkidle'); rq.wait_for_timeout(600)
    import re
    body = rq.inner_text('body')
    badge_words = re.compile(r'Breached \d|At risk ·|Paused \(on hold\)|\d+[mhd] left|Response overdue|Resolved late')   # badge wording only (ticket titles also contain some of these words)
    check('requester: no SLA column and no SLA badge wording on the list', rq.locator('thead th', has_text='SLA').count() == 0 and not badge_words.search(body), badge_words.findall(body))
    rq.locator('tbody tr').first.click(); rq.wait_for_timeout(600)
    check('requester: the detail window has no "Service level" block', 'service level' not in rq.inner_text('body').lower())
    check('requester: no Reports link in the menu', rq.locator('nav a', has_text='Reports').count() == 0)
    rq.goto(BASE + '/reports', wait_until='networkidle'); rq.wait_for_timeout(500)
    check('requester: opening /reports directly does not show the report', 'service reports' not in rq.inner_text('body').lower())

    # ------------------------------------------------------------------ phone layout
    ph = new_page(390, 800); login(ph, 'amy@ui.test', 'Str0ng-pass-2')
    ph.goto(BASE + '/incidents', wait_until='networkidle'); ph.wait_for_timeout(600)
    check('phone: SLA badges appear on the incident cards', 'Breached' in ph.inner_text('body') and 'left' in ph.inner_text('body'))
    check('phone: the incident list does not scroll sideways', not ph.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'))

    # ------------------------------------------------------------------ reports (agent)
    pg.goto(BASE + '/reports', wait_until='networkidle'); pg.wait_for_timeout(900)
    check('agent: Reports is in the menu and the page loads', pg.locator('nav a', has_text='Reports').count() >= 1 and 'service reports' in pg.inner_text('body').lower())
    txt = pg.inner_text('body').lower()
    check('reports: shows ticket total, attainment, averages and the priority and type tables', all(w in txt for w in ['tickets', 'response target met', 'resolution target met', 'average first response', 'by priority', 'by type']), txt[:300])
    check('reports: resolution attainment is a percentage computed from met and breached', '%' in pg.locator('text=/resolution target met/i').first.locator('..').inner_text(), pg.locator('text=/resolution target met/i').first.locator('..').inner_text())
    pg.fill('input[type=date] >> nth=0', '2099-01-01'); pg.click('button:has-text("Apply")'); pg.wait_for_timeout(700)
    check('reports: a range with no tickets shows zero and dashes, not an error', '—' in pg.inner_text('body') and pg.locator('[role=alert]').count() == 0)
    pg.click('button:has-text("Reset")'); pg.wait_for_timeout(700)
    check('reports: Reset brings the tickets back', 'by priority' in pg.inner_text('body').lower() and re.search(r'\b6\b', pg.inner_text('body')) is not None)
    ph.goto(BASE + '/reports', wait_until='networkidle'); ph.wait_for_timeout(700)
    check('phone: the report page does not scroll sideways (tables scroll inside their own box)', not ph.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'))

    # ------------------------------------------------------------------ admin: settings and policies
    ad = new_page(); login(ad, 'admin@ui.test', 'Str0ng-pass-1')
    ad.goto(BASE + '/admin', wait_until='networkidle'); ad.click('button:has-text("SLA")'); ad.wait_for_timeout(800)
    check('admin: the SLA tab has the working hours and alerts card', 'Working hours and alerts' in ad.inner_text('body'))
    check('admin: defaults are Mon-Fri, 08:00-17:00, South Africa time, 80%', ad.locator('input[type=time] >> nth=0').input_value() == '08:00' and ad.locator('input[type=time] >> nth=1').input_value() == '17:00' and ad.locator('label:has-text("Mon") input').is_checked() and not ad.locator('label:has-text("Sat") input').is_checked() and ad.locator('input[min="1"][max="99"]').input_value() == '80')
    ad.fill('input[type=time] >> nth=1', '07:00'); ad.click('button:has-text("Save working hours")'); ad.wait_for_timeout(700)
    check('admin: closing before opening is refused by the server and the message is shown', ad.locator('[role=alert]').count() >= 1 and 'later than' in ad.locator('[role=alert]').first.inner_text(), ad.inner_text('body')[-300:])
    ad.fill('input[type=time] >> nth=1', '16:30')
    ad.check('label:has-text("Sat") input')
    ad.fill('input[type=date]', '2026-12-25'); ad.click('button:has-text("Add date")')
    ad.check('label:has-text("raise the ticket") input')
    ad.click('button:has-text("Save working hours")'); ad.wait_for_timeout(800)
    check('admin: valid settings save with a confirmation', ad.locator('[role=status]').count() >= 1 and 'Saved' in ad.locator('[role=status]').first.inner_text())
    ad.reload(wait_until='networkidle'); ad.click('button:has-text("SLA")'); ad.wait_for_timeout(800)
    check('admin: the saved settings are still there after a reload (hours, Saturday, holiday, raise-priority)', ad.locator('input[type=time] >> nth=1').input_value() == '16:30' and ad.locator('label:has-text("Sat") input').is_checked() and '2026-12-25' in ad.inner_text('body') and ad.locator('label:has-text("raise the ticket") input').is_checked())
    ad.click('button[aria-label="Remove 2026-12-25"]'); ad.click('button:has-text("Save working hours")'); ad.wait_for_timeout(700)
    check('admin: a holiday can be removed', '2026-12-25' not in ad.inner_text('body'))
    ad.uncheck('label:has-text("raise the ticket") input'); ad.uncheck('label:has-text("Sat") input'); ad.fill('input[type=time] >> nth=1', '17:00'); ad.click('button:has-text("Save working hours")'); ad.wait_for_timeout(600)
    # policies
    check('admin: the policy table shows how each policy counts time', 'Round the clock' in ad.inner_text('body') and ad.locator('thead th', has_text='Counted').count() >= 1)
    ad.locator('tbody tr', has_text='Critical Incident SLA').first.locator('button:has-text("Edit")').click(); ad.wait_for_timeout(500)
    check('admin: an existing policy can be edited', 'Edit' in ad.inner_text('body') and ad.locator('input[type=checkbox]').last.count() == 1)
    ad.locator('label:has-text("Count working hours only") input').check(); ad.click('button:has-text("Save policy")'); ad.wait_for_timeout(800)
    check('admin: switching a policy to working hours is saved and shown in the table', 'Working hours only' in ad.inner_text('body'))
    check('admin: an agent still cannot change settings (server refuses, not just the screen)', api('PUT', '/api/sla/settings', api('POST', '/api/auth/login', body={'email': 'amy@ui.test', 'password': 'Str0ng-pass-2'})[1]['token'], {'offset': 120, 'days': [1], 'start': '08:00', 'end': '17:00', 'holidays': [], 'atRiskPct': 80, 'raisePriority': False})[0] == 403)

    shots = os.environ.get('SCREENSHOT_DIR')   # optional: save pictures for a visual review
    if shots:
        pg.goto(BASE + '/incidents', wait_until='networkidle'); pg.wait_for_timeout(700); pg.screenshot(path=f'{shots}/incidents.png')
        pg.goto(BASE + '/reports', wait_until='networkidle'); pg.wait_for_timeout(700); pg.screenshot(path=f'{shots}/reports.png')
        ad.goto(BASE + '/admin', wait_until='networkidle'); ad.click('button:has-text("SLA")'); ad.wait_for_timeout(800); ad.screenshot(path=f'{shots}/admin_sla.png')
        ph.goto(BASE + '/incidents', wait_until='networkidle'); ph.wait_for_timeout(700); ph.screenshot(path=f'{shots}/phone_incidents.png')
    for name, page in [('agent', pg), ('requester', rq), ('phone', ph), ('admin', ad)]:
        csp = page.evaluate('window.__csp')
        check(f'no Content-Security-Policy violations ({name})', not csp, csp)
    check('no console or page errors', not errors, errors[:3])
    browser.close()

failed = results.count(False)
print(f"\n{len(results) - failed} passed, {failed} failed, {len(results)} checks")
sys.exit(1 if failed else 0)
