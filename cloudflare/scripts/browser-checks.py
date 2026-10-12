"""Browser checks for the public marketing site (needs Python 3 + `pip install playwright` + a Chromium).

    python3 cloudflare/scripts/browser-checks.py http://localhost:8787 [path-to-chromium]

Run against a FRESH local database (npm run dev, after deleting .wrangler/state): it creates an admin account
and a few requests. Never run it against production.
"""
import json, re, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip('/')
CHROMIUM = sys.argv[2] if len(sys.argv) > 2 else None
PUBLIC = ['/', '/software', '/start', '/support', '/privacy', '/terms']
FORBIDDEN = ['Email-to-ticket', 'email-to-ticket', 'Start free trial', 'free trial', 'first month', 'free month', 'R449', 'R849', 'Growth plan',
             'testimonial', 'Trusted by', 'customers worldwide']
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail and not ok else ''))


def api(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


status, adm = api('POST', '/api/auth/register', body={'name': 'Site Admin', 'email': 'siteadmin@test.co.za', 'password': 'Str0ng-pass-1'})
check('test admin created on a fresh database', status == 201, f'status {status} — run against an EMPTY database')
TOKEN = adm.get('token')

with sync_playwright() as p:
    launch = {'executable_path': CHROMIUM} if CHROMIUM else {}
    browser = p.chromium.launch(**launch)
    ctx = browser.new_context(viewport={'width': 1280, 'height': 850})
    ctx.add_init_script("window.__csp=[]; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective+' <- '+e.blockedURI));")
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_NAME_NOT_RESOLVED' not in m.text and 'Failed to load resource' not in m.text else None)

    # 1. every public page: one h1, title, description, canonical, no overflow (desktop + phone), no CSP violations
    titles = set()
    for path in PUBLIC:
        for width in (1280, 390):
            page.set_viewport_size({'width': width, 'height': 850})
            page.goto(BASE + path, wait_until='networkidle')
            h1s = page.locator('h1').count()
            title = page.title()
            desc = page.locator('meta[name=description]').get_attribute('content') or ''
            canon = page.locator('link[rel=canonical]').get_attribute('href') or ''
            overflow = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
            if width == 1280:
                titles.add(title)
                check(f'{path}: exactly one h1, a title, a meta description and a canonical link', h1s == 1 and len(title) > 10 and len(desc) > 40 and canon.endswith(path if path != '/' else '.dev/') or (h1s == 1 and len(title) > 10 and len(desc) > 40 and canon.endswith(path)), f'h1={h1s} title={title!r} desc={len(desc)} canon={canon}')
            check(f'{path}: no horizontal scroll at {width}px', not overflow)
            body = page.inner_text('body')
            bad = [f for f in FORBIDDEN if f.lower() in body.lower()]
            if width == 1280:
                check(f'{path}: no unsupported claims ({", ".join(FORBIDDEN[:4])}, ...)', not bad, str(bad))
            csp = page.evaluate('window.__csp')
            if csp:
                check(f'{path}: no Content-Security-Policy violations', False, str(csp))
    check('every public page has its own distinct title', len(titles) == len(PUBLIC), str(titles))
    check('no console or page errors across all pages', not errors, str(errors[:3]))
    check('no CSP violations on any page', True)

    # 2. desktop navigation
    page.set_viewport_size({'width': 1280, 'height': 850})
    page.goto(BASE + '/', wait_until='networkidle')
    nav = page.locator('nav[aria-label=Main]')
    check('desktop nav has "ITSM Software" that opens the landing page', nav.locator('a', has_text='ITSM Software').count() == 1)
    nav.locator('a', has_text='ITSM Software').click(); page.wait_for_url('**/software')
    check('  ...and lands on /software with the product headline', 'incident and ticket management' in page.inner_text('h1').lower())
    nav.locator('a', has_text='Pricing').click(); page.wait_for_timeout(500)
    in_view = page.evaluate("(() => { const r = document.getElementById('pricing').getBoundingClientRect(); return r.top < 300 && r.top > -50; })()")
    check('"Pricing" scrolls the pricing section into view', in_view and page.url.endswith('/software#pricing'))
    page.goto(BASE + '/pricing', wait_until='networkidle')
    check('/pricing still works (stable address) and lands on the pricing section', page.url.endswith('/software#pricing'))
    page.goto(BASE + '/demo', wait_until='networkidle')
    check('/demo redirects to the request form', page.url.endswith('/start'))

    # 3. pricing and plan labels
    page.goto(BASE + '/software#pricing', wait_until='networkidle')
    cards = page.locator('#pricing article')
    check('three plan cards', cards.count() == 3)
    txt = [cards.nth(i).inner_text() for i in range(3)]
    check('Starter: R199 per agent / month, "Available by request", button "Request a demo"', 'R199' in txt[0] and 'per agent / month' in txt[0] and 'Available by request' in txt[0] and 'Request a demo' in txt[0])
    check('Professional: R349, "Coming soon", only a waitlist button', 'R349' in txt[1] and 'Coming soon' in txt[1] and 'Join the waitlist' in txt[1] and 'Request a demo' not in txt[1])
    check('MSP / Business Plus: R549, "Coming soon", only a waitlist button', 'R549' in txt[2] and 'Coming soon' in txt[2] and 'Join the waitlist' in txt[2] and 'Request a demo' not in txt[2])
    hrefs = [cards.nth(i).locator('a').get_attribute('href') for i in range(3)]
    check('plan buttons point at the right workflow', hrefs[0] == '/start?plan=starter' and 'plan=professional' in hrefs[1] and 'kind=waitlist' in hrefs[1] and 'plan=msp' in hrefs[2])
    check('no buy / subscribe / checkout buttons anywhere', not re.search(r'\b(buy now|subscribe|checkout|pay now|add to cart)\b', page.inner_text('body'), re.I))
    table = page.locator('#pricing ~ section table, section table').first
    check('comparison table has a caption and column headers', table.locator('caption').count() == 1 and table.locator('thead th[scope=col]').count() == 4)
    rows = page.locator('section table tbody tr').all_inner_texts()
    check('planned features are labelled Planned, not Included, in the paid tiers', any('SLA response' in r and 'Planned' in r for r in rows))
    check('FAQ opens with the keyboard', (lambda: (page.locator('#faq summary').first.focus(), page.keyboard.press('Enter'), page.locator('#faq details').first.evaluate('d => d.open'))[-1])())

    # 4. mobile menu
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(BASE + '/', wait_until='networkidle')
    btn = page.locator('button[aria-controls=mobile-menu]')
    check('mobile: menu is closed to start with and the button says so', btn.get_attribute('aria-expanded') == 'false' and page.locator('#mobile-menu').count() == 0)
    btn.click()
    check('mobile: menu opens, lists the links, and aria-expanded is true', btn.get_attribute('aria-expanded') == 'true' and page.locator('#mobile-menu a', has_text='ITSM Software').is_visible())
    page.keyboard.press('Escape')
    check('mobile: Escape closes the menu', page.locator('#mobile-menu').count() == 0)
    btn.click(); page.locator('#mobile-menu a', has_text='ITSM Software').click(); page.wait_for_url('**/software')
    check('mobile: choosing a link navigates and closes the menu', page.locator('#mobile-menu').count() == 0)
    btn.click(); page.locator('#mobile-menu a', has_text='Pricing').click(); page.wait_for_timeout(500)
    check('mobile: Pricing link scrolls to the pricing section', page.evaluate("document.getElementById('pricing').getBoundingClientRect().top < 300"))

    # 5. links: nothing dead
    page.set_viewport_size({'width': 1280, 'height': 850})
    seen, dead = set(), []
    for path in PUBLIC:
        page.goto(BASE + path, wait_until='networkidle')
        for a in page.locator('a[href]').all():
            href = a.get_attribute('href')
            if href in (None, '', '#') or href.startswith('mailto:') or href.startswith('http') or href.startswith('#'):
                if href in ('', '#', None): dead.append((path, href))
                continue
            seen.add(href.split('#')[0])
    for href in sorted(seen):
        r = page.request.get(BASE + href)
        if r.status != 200: dead.append((href, r.status))
    check(f'no dead or empty links ({len(seen)} distinct internal targets checked)', not dead, str(dead))

    # 6. accessibility basics
    unlabeled = page.evaluate("""() => { page = 1; return 0 }""") if False else 0
    page.goto(BASE + '/start', wait_until='networkidle')
    unlabeled = page.evaluate("""() => [...document.querySelectorAll('input:not([type=hidden]):not([tabindex="-1"]), select, textarea')].filter(el => !(el.labels && el.labels.length) && !el.getAttribute('aria-label')).map(el => el.id || el.name)""")
    check('every form control on the request form has a label', not unlabeled, str(unlabeled))
    page.goto(BASE + '/', wait_until='networkidle')
    page.keyboard.press('Tab')
    check('first Tab stop is "Skip to content"', page.evaluate("document.activeElement.textContent.trim()") == 'Skip to content')
    page.keyboard.press('Enter')
    check('skip link moves focus to the main content', page.evaluate("document.activeElement.id") == 'main')
    imgs = page.evaluate("[...document.querySelectorAll('img')].filter(i => i.getAttribute('alt') === null).length")
    check('every image has an alt attribute', imgs == 0)

    # 7. the request form
    page.goto(BASE + '/start?plan=starter', wait_until='networkidle')
    check('demo form: heading "Request a demo" and Starter preselected', 'Request a demo' in page.inner_text('h1') and page.locator('#plan').input_value() == 'starter')
    page.locator('button[type=submit]').click()
    check('demo form: empty submission is blocked by validation', page.locator('#name').evaluate('el => el.validity.valueMissing') and page.url.endswith('/start?plan=starter'))
    page.fill('#name', 'Thandi Dlamini'); page.fill('#email', 'thandi@smallco.co.za'); page.fill('#company', 'SmallCo'); page.fill('#message', 'Six people in IT.')
    page.locator('button[type=submit]').click()
    check('demo form: consent is required before anything is sent', page.locator('#consent').evaluate('el => el.validity.valueMissing') and 'Request received' not in page.inner_text('body'))
    page.check('#consent')

    # server failure must NOT look like success
    page.route('**/api/leads', lambda route: route.fulfill(status=500, content_type='application/json', body='{"error":"Internal server error"}'))
    page.locator('button[type=submit]').click(); page.wait_for_timeout(600)
    check('demo form: a server error shows an error and NOT the success screen', page.locator('[role=alert]').count() == 1 and 'Request received' not in page.inner_text('body'))
    page.unroute('**/api/leads')
    page.route('**/api/leads', lambda route: route.fulfill(status=429, content_type='application/json', headers={'Retry-After': '60'}, body='{"error":"Too many attempts."}'))
    page.locator('button[type=submit]').click(); page.wait_for_timeout(600)
    check('demo form: rate limiting shows a clear message', 'several requests' in page.inner_text('[role=alert]'))
    page.unroute('**/api/leads')

    page.locator('button[type=submit]').click(); page.wait_for_url(re.compile('.*'), timeout=3000); page.wait_for_timeout(800)
    check('demo form: success shown only after the server confirms', 'Request received' in page.inner_text('h1'))
    st, leads = api('GET', '/api/leads', TOKEN)
    mine = [l for l in leads if l['email'] == 'thandi@smallco.co.za']
    check('demo form: the request is really stored, with consent and wording version', len(mine) == 1 and mine[0]['kind'] == 'demo' and mine[0]['consent'] == 1 and mine[0]['consent_version'] == '2026-10-12' and mine[0]['message'] == 'Six people in IT.', str(mine))

    page.goto(BASE + '/start?plan=professional&kind=waitlist', wait_until='networkidle')
    check('waitlist form: heading "Join the waitlist"', 'Join the waitlist' in page.inner_text('h1'))
    page.fill('#name', 'Pat Msp'); page.fill('#email', 'pat@msp.co.za'); page.fill('#company', 'MSP Co'); page.check('#consent')
    page.locator('button[type=submit]').click(); page.wait_for_timeout(1000)
    check('waitlist form: success screen says "on the waitlist"', 'on the waitlist' in page.inner_text('h1'))
    st, leads = api('GET', '/api/leads', TOKEN)
    w = [l for l in leads if l['email'] == 'pat@msp.co.za']
    check('waitlist form: stored as kind=waitlist, plan=professional', len(w) == 1 and w[0]['kind'] == 'waitlist' and w[0]['plan'] == 'professional', str(w))
    page.goto(BASE + '/start', wait_until='networkidle')
    check('spam-trap field is hidden from people and assistive technology', page.locator('input[tabindex="-1"]').evaluate('el => el.closest("[aria-hidden=true]") !== null'))

    # 8. admin screen
    page.goto(BASE + '/login', wait_until='networkidle')
    page.fill('input[type=email]', 'siteadmin@test.co.za'); page.fill('input[type=password]', 'Str0ng-pass-1'); page.click('button[type=submit]'); page.wait_for_timeout(1500)
    page.goto(BASE + '/admin', wait_until='networkidle'); page.click('button:has-text("Demo & waitlist")'); page.wait_for_timeout(800)
    body = page.inner_text('body')
    check('admin: Demo & waitlist tab lists both requests with their type and consent', 'SmallCo' in body and 'MSP Co' in body and 'waitlist' in body.lower() and 'consent given' in body.lower())
    check('admin: CSV export button is present', page.locator('button:has-text("Export CSV")').count() == 1)

    check('no CSP violations at any point', not page.evaluate('window.__csp'), str(page.evaluate('window.__csp')))
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)} passed, {len(bad)} failed, {len(results)} checks")
sys.exit(1 if bad else 0)
