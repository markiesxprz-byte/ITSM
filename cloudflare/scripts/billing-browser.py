"""Browser checks for Administration -> Billing, against the PayPal mock. Run by billing-check.sh after billing-e2e.mjs
(which creates the admin account admin@bill.test on both workers).

    python3 cloudflare/scripts/billing-browser.py <configuredBase> <unconfiguredBase> <mockBase> [chromium]
"""
import json, re, sys, urllib.request
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

CONF, UNCONF, MOCK = [a.rstrip('/') for a in sys.argv[1:4]]
CHROMIUM = sys.argv[4] if len(sys.argv) > 4 else None
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{str(detail)[:220]}]' if detail and not ok else ''))


def post(url, body, headers=None):
    req = urllib.request.Request(url, method='POST', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status
    except urllib.error.HTTPError as e: return e.code


def latest_sub_id():
    # the mock names subscriptions I-MOCK1, I-MOCK2, ...; the newest is the highest number it has been asked to create
    st = json.loads(urllib.request.urlopen(MOCK + '/__mock/state').read())
    return f"I-MOCK{len(st['subscriptionRequests'])}"


def mock_set(sub_id, patch): post(MOCK + '/__mock/set', {'id': sub_id, 'patch': patch})


WH = {'PAYPAL-AUTH-ALGO': 'SHA256withRSA', 'PAYPAL-CERT-URL': 'https://api.paypal.com/cert', 'PAYPAL-TRANSMISSION-ID': 'tx-b', 'PAYPAL-TRANSMISSION-SIG': 'VALID-SIGNATURE', 'PAYPAL-TRANSMISSION-TIME': '2026-10-13T10:00:00Z'}

with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': CHROMIUM} if CHROMIUM else {}))
    errors = []

    def page_for(base, width=1280):
        ctx = browser.new_context(viewport={'width': width, 'height': 850})
        ctx.add_init_script("window.__csp=[]; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective+' <- '+e.blockedURI));")
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        pg.goto(base + '/login', wait_until='networkidle')
        pg.fill('input[type=email]', 'admin@bill.test'); pg.fill('input[type=password]', 'Str0ng-pass-1'); pg.click('button[type=submit]')
        pg.wait_for_url('**/dashboard', timeout=8000)
        return pg

    def open_billing(pg, base):
        pg.goto(base + '/admin', wait_until='networkidle'); pg.click('button:has-text("Billing")'); pg.wait_for_timeout(700)

    # ------------------------------------------------------------ workspace with no PayPal settings
    un = page_for(UNCONF); open_billing(un, UNCONF)
    txt = un.inner_text('body')
    check('not set up: says online billing is not set up and that billing is arranged directly', 'Online billing is not set up' in txt and 'invoiced directly' in txt)
    check('not set up: shows no Subscribe button and no test-mode banner', un.locator('button:has-text("Subscribe with PayPal")').count() == 0 and 'Test mode' not in txt)
    check('not set up: still shows how many billable agents there are (requesters are free)', 'Requesters are not billed' in txt)

    # ------------------------------------------------------------ configured workspace: this test sets up its OWN starting state
    def admin_call(method, path, body=None):
        tok = json.loads(urllib.request.urlopen(urllib.request.Request(CONF + '/api/auth/login', method='POST', data=json.dumps({'email': 'admin@bill.test', 'password': 'Str0ng-pass-1'}).encode(), headers={'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.60'})).read())['token']
        req = urllib.request.Request(CONF + path, method=method, data=json.dumps(body if body is not None else {}).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'cf-connecting-ip': '198.51.100.61'})
        try:
            with urllib.request.urlopen(req) as r: return r.status
        except urllib.error.HTTPError as e: return e.code
    admin_call('PUT', '/api/billing/enforcement', {'enabled': False})   # enforcement off
    admin_call('POST', '/api/billing/cancel')                            # no live subscription (409 if there is none: fine)
    check('set-up: a fresh subscription is started and left pending (as a customer who has not paid yet)', admin_call('POST', '/api/billing/subscribe', {'region': 'ZA'}) == 200)
    pg = page_for(CONF); open_billing(pg, CONF)
    txt = pg.inner_text('body')
    check('configured: a test-mode banner says no real money moves', 'Test mode' in txt and 'No real money moves' in txt)
    check('configured: the pending subscription is shown as "Waiting for PayPal to confirm", not as active', 'Waiting for PayPal to confirm' in txt and 'Active' not in pg.locator('span.rounded-full').first.inner_text())
    check('configured: pending shows Cancel and Check-with-PayPal, and no Subscribe button', pg.locator('button:has-text("Cancel subscription")').count() == 1 and pg.locator('button:has-text("Check with PayPal")').count() == 1 and pg.locator('button:has-text("Subscribe with PayPal")').count() == 0)
    check('configured: shows billing terms (US dollars, 15% VAT) and a link to the cancellation terms', 'US dollars' in txt and '15% VAT' in txt and pg.locator('a[href="/terms#billing"]').count() == 1)

    # cancel (accept the confirmation) -> cancelled -> subscribe becomes available
    pg.once('dialog', lambda d: d.accept())
    pg.click('button:has-text("Cancel subscription")'); pg.wait_for_timeout(1200)
    txt = pg.inner_text('body')
    check('cancelling: PayPal-confirmed "Cancelled" is shown with a confirmation message', 'Cancelled' in txt and 'cancelled with PayPal' in txt, txt[:300])
    check('cancelling: the Subscribe button is offered again', pg.locator('button:has-text("Subscribe with PayPal")').count() == 1)

    check('subscribe: the region question is shown with two choices (South Africa, outside South Africa)', pg.locator('input[name=region]').count() == 2 and 'Where is your business based?' in pg.inner_text('body'))
    pg.check('input[name=region] >> nth=1')
    intl_msgs = []
    pg.once('dialog', lambda d: (intl_msgs.append(d.message), d.dismiss()))
    pg.click('button:has-text("Subscribe with PayPal")'); pg.wait_for_timeout(500)
    check('international: the confirmation says no VAT is added and the customer is responsible for their own taxes (and a dismissed confirmation goes nowhere)', bool(intl_msgs) and 'no VAT added' in intl_msgs[0] and 'own country' in intl_msgs[0] and '/approve/' not in pg.url, intl_msgs)
    pg.check('input[name=region] >> nth=0')

    # subscribe -> the customer is sent to PayPal (the mock)
    dialogs = []
    pg.once('dialog', lambda d: (dialogs.append(d.message), d.accept()))
    pg.click('button:has-text("Subscribe with PayPal")'); pg.wait_for_url(re.compile(r'.*/approve/I-MOCK\d+'), timeout=8000)
    check('subscribing: the customer is told the terms first (agents, US dollars, 15% VAT, PayPal) and then sent to PayPal', bool(dialogs) and 'US dollars' in dialogs[0] and '15% South African VAT' in dialogs[0] and 'PayPal' in dialogs[0], dialogs)
    new_id = latest_sub_id()
    check('subscribing: PayPal is the page they land on to approve and pay', f'/approve/{new_id}' in pg.url, pg.url)

    # they "paid" at PayPal and come back. The return page must ask PayPal, not assume.
    pg.goto(CONF + '/admin?billing=return', wait_until='networkidle'); pg.wait_for_timeout(1200)
    txt = pg.inner_text('body')
    check('returning while PayPal still says "approval pending": NOT shown as paid', 'Waiting for PayPal to confirm' in txt and 'Welcome back' in txt)
    check('the return address is tidied to /admin (no billing flag left to re-trigger)', pg.url.endswith('/admin'))
    mock_set(new_id, {'status': 'ACTIVE', 'billing_info': {'next_billing_time': '2026-11-13T10:00:00Z', 'failed_payments_count': 0}})
    pg.click('button:has-text("Check with PayPal")'); pg.wait_for_timeout(1200)
    txt = pg.inner_text('body')
    pill = pg.locator('span.rounded-full').first.inner_text().strip()
    next_charge = pg.locator('dt:has-text("Next charge") + dd').inner_text()
    check('once PayPal says ACTIVE, the status pill reads exactly "Active" and the next charge shows a 2026 date (not a dash)', pill == 'Active' and '2026' in next_charge, f'{pill!r} / {next_charge!r}')
    check('active: the button is now Cancel, not Subscribe', pg.locator('button:has-text("Cancel subscription")').count() == 1 and pg.locator('button:has-text("Subscribe with PayPal")').count() == 0)

    # a genuine payment webhook appears in the history
    sale = {'id': 'SALE-BR-1', 'event_type': 'PAYMENT.SALE.COMPLETED', 'resource': {'id': 'SALE-BR-1', 'billing_agreement_id': new_id, 'amount': {'total': '12.65', 'currency': 'USD'}, 'create_time': '2026-10-13T10:00:05Z'}}
    check('a signed payment webhook is accepted', post(CONF + '/api/billing/webhook', {**sale, 'id': 'EV-BR-1'}, {**WH, 'cf-connecting-ip': '198.51.100.77'}) == 200)
    pg.reload(wait_until='networkidle'); pg.click('button:has-text("Billing")'); pg.wait_for_timeout(900)
    txt = pg.inner_text('body')
    check('payment history shows US$12.65 with PayPal\'s reference', 'US$12.65' in txt and 'SALE-BR-1' in txt, txt[-300:])
    check('last payment is summarised on the subscription card', 'US$12.65 on' in txt)

    # seats mismatch warning: add an agent, the screen must say how to change seats
    import urllib.request as ur
    tok = json.loads(ur.urlopen(ur.Request(CONF + '/api/auth/login', method='POST', data=json.dumps({'email': 'admin@bill.test', 'password': 'Str0ng-pass-1'}).encode(), headers={'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.88'})).read())['token']
    ur.urlopen(ur.Request(CONF + '/api/users', method='POST', data=json.dumps({'name': 'Agent Cy', 'email': 'cy@bill.test', 'password': 'Str0ng-pass-5', 'role': 'agent'}).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'cf-connecting-ip': '198.51.100.89'}))
    pg.reload(wait_until='networkidle'); pg.click('button:has-text("Billing")'); pg.wait_for_timeout(900)
    check('more agents than paid for: a warning explains to cancel and subscribe again', 'To change the number of agents, cancel this subscription and subscribe again' in pg.inner_text('body'))

    # ---- subscription enforcement: off by default; switching it on makes a lapsed workspace read-only, with a banner
    pg.reload(wait_until='networkidle'); pg.click('button:has-text("Billing")'); pg.wait_for_timeout(900)
    txt = pg.inner_text('body')
    check('enforcement starts OFF and says nothing is restricted', 'Subscription enforcement' in txt and 'Off. Nothing is restricted' in txt, txt[-500:])
    pg.goto(CONF + '/incidents', wait_until='networkidle'); pg.wait_for_timeout(500)
    check('no read-only banner while enforcement is off', 'read-only' not in pg.inner_text('body'))
    open_billing(pg, CONF)
    pg.once('dialog', lambda d: d.accept())
    pg.click('button:has-text("Switch on")'); pg.wait_for_timeout(900)
    txt = pg.inner_text('body')
    check('switching it on shows ON and explains read-only, grace and that nothing is deleted', 'On. If the subscription lapses' in txt and 'Nothing is ever deleted' in txt and 'Enforcement is on' in txt, txt[-400:])
    check('...and while the subscription is active there is still no banner and no "read-only right now" warning', 'read-only right now' not in txt)
    # the subscription lapses (the test server uses a grace period of 0 days)
    mock_set(new_id, {'status': 'SUSPENDED'})
    check('a signed SUSPENDED webhook is accepted', post(CONF + '/api/billing/webhook', {'id': 'EV-BR-SUSP', 'event_type': 'BILLING.SUBSCRIPTION.SUSPENDED', 'resource': {'id': new_id}}, {**WH, 'cf-connecting-ip': '198.51.100.78'}) == 200)
    pg.goto(CONF + '/incidents', wait_until='networkidle'); pg.wait_for_timeout(900)
    banner = pg.locator('[role=alert]', has_text='read-only')
    check('lapsed: every page shows a read-only banner that says what still works and who can fix it', banner.count() == 1 and 'read and export' in banner.inner_text() and 'Administration' in banner.inner_text(), pg.inner_text('body')[:300])
    rq2 = page_for(CONF); 
    check('the banner is for everyone signed in (the administrator\'s page, checked from a second session)', rq2.locator('[role=alert]', has_text='read-only').count() == 1 if (rq2.goto(CONF + '/incidents', wait_until='networkidle'), rq2.wait_for_timeout(700)) else False)
    open_billing(pg, CONF)
    check('lapsed: the Billing screen says "read-only right now" and still lets the administrator act', 'read-only right now' in pg.inner_text('body') and pg.locator('button:has-text("Switch off")').count() == 1)
    # recovery, now with a free trial reported by PayPal, confirmed through the webhook
    future = (datetime.now(timezone.utc) + timedelta(days=20)).strftime('%Y-%m-%dT%H:%M:%SZ')
    mock_set(new_id, {'status': 'ACTIVE', 'billing_info': {'next_billing_time': future, 'failed_payments_count': 0, 'cycle_executions': [{'tenure_type': 'TRIAL', 'sequence': 1, 'cycles_completed': 0, 'cycles_remaining': 1, 'total_cycles': 1}]}})
    check('a signed ACTIVATED webhook is accepted', post(CONF + '/api/billing/webhook', {'id': 'EV-BR-ACT', 'event_type': 'BILLING.SUBSCRIPTION.ACTIVATED', 'resource': {'id': new_id}}, {**WH, 'cf-connecting-ip': '198.51.100.79'}) == 200)
    pg.goto(CONF + '/incidents', wait_until='networkidle'); pg.wait_for_timeout(700)
    check('recovery: once PayPal says active again the banner is gone', pg.locator('[role=alert]', has_text='read-only').count() == 0)
    open_billing(pg, CONF)
    txt = pg.inner_text('body')
    pill = pg.locator('span.rounded-full').first.inner_text().strip()
    check('trial: the status reads "Free trial", with the end date and "you are not charged before then"', pill == 'Free trial' and 'You are in your free trial until' in txt and 'not charged before then' in txt, f'{pill!r} {txt[:300]}')
    check('trial: the date label says "First charge" (not "Next charge")', 'First charge' in txt)
    pg.once('dialog', lambda d: d.accept())
    pg.click('button:has-text("Switch off")'); pg.wait_for_timeout(800)
    check('switching enforcement off again works', 'Off. Nothing is restricted' in pg.inner_text('body'))

    # accessibility + layout
    ph = page_for(CONF, 390); open_billing(ph, CONF)
    check('phone: the Billing screen does not scroll sideways', not ph.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'))
    nameless = pg.evaluate("[...document.querySelectorAll('button')].filter(b => ((b.getAttribute('aria-label') || b.innerText || '').trim().length < 2)).map(b => b.outerHTML.slice(0, 80))")
    check('every button has an accessible name (visible text or an aria-label), so no control is unlabelled for a screen reader', not nameless, nameless)
    for name, page in [('configured', pg), ('unconfigured', un), ('phone', ph)]:
        check(f'no Content-Security-Policy violations ({name})', not page.evaluate('window.__csp'), page.evaluate('window.__csp'))
    check('no console or page errors', not errors, errors[:3])
    browser.close()

failed = results.count(False)
print(f"\n{len(results) - failed} passed, {failed} failed, {len(results)} checks")
sys.exit(1 if failed else 0)
