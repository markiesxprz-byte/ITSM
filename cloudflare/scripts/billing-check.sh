#!/bin/bash
# Runs the billing tests: a mock PayPal, a Worker wired to it, and a Worker with no PayPal settings at all.
#   bash cloudflare/scripts/billing-check.sh      (ports 8901-8903; override with BASE_PORT=...)
export CI=1 WRANGLER_SEND_METRICS=false
cd "$(dirname "$0")/../.."
BP=${BASE_PORT:-8901}; MOCK=$BP; CONF=$((BP+1)); UNCONF=$((BP+2))
for p in $MOCK $CONF $UNCONF; do
  if [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' localhost:$p/)" != "000" ]; then echo "Port $p is in use. Stop the old test server or use BASE_PORT=<free>."; exit 2; fi
done
npm run build >/dev/null 2>&1
rm -rf /tmp/itsm_bill_c /tmp/itsm_bill_u
node cloudflare/scripts/paypal-mock.mjs $MOCK > /tmp/itsm_bill_mock.log 2>&1 &
M=$!
timeout 200 npx wrangler dev --local --port $CONF --inspector-port $((BP+50)) --persist-to /tmp/itsm_bill_c \
  --var PAYPAL_CLIENT_ID:mock-client --var PAYPAL_CLIENT_SECRET:mock-secret --var PAYPAL_PLAN_ID:P-MOCKPLAN --var PAYPAL_PLAN_ID_INTL:P-MOCKINTL --var BILLING_GRACE_DAYS:0 --var PAYPAL_WEBHOOK_ID:WH-MOCK --var PAYPAL_API_BASE:http://localhost:$MOCK > /tmp/itsm_bill_c.log 2>&1 &
C=$!
timeout 200 npx wrangler dev --local --port $UNCONF --inspector-port $((BP+51)) --persist-to /tmp/itsm_bill_u > /tmp/itsm_bill_u.log 2>&1 &
U=$!
for p in $CONF $UNCONF; do for i in $(seq 1 30); do sleep 2; [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' localhost:$p/)" = "200" ] && break; done; done
node cloudflare/scripts/billing-e2e.mjs http://localhost:$CONF http://localhost:$UNCONF http://localhost:$MOCK
RESULT=$?
if [ -n "$CHROMIUM" ] && python3 -c 'import playwright' 2>/dev/null; then   # screens: only when Playwright and a Chromium path (CHROMIUM=...) are available
  python3 cloudflare/scripts/billing-browser.py http://localhost:$CONF http://localhost:$UNCONF http://localhost:$MOCK "$CHROMIUM"
  RESULT=$((RESULT + $?))
fi
kill $M $C $U 2>/dev/null
exit $RESULT
