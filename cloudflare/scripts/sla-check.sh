#!/bin/bash
# Runs the end-to-end SLA tests on a FRESH local database with the scheduled-job test hook enabled.
#   bash cloudflare/scripts/sla-check.sh            (default port 8851; override with PORT=...)
export CI=1 WRANGLER_SEND_METRICS=false
cd "$(dirname "$0")/../.."
PORT=${PORT:-8851}; PERSIST=/tmp/itsm_sla_check; LOG=/tmp/itsm_sla_check.log
if [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' localhost:$PORT/api/health)" != "000" ]; then echo "Port $PORT is in use (an old test server?). Stop it or use PORT=<free port>."; exit 2; fi
npm run build >/dev/null 2>&1
rm -rf $PERSIST; : > $LOG
timeout 200 npx wrangler dev --local --test-scheduled --port $PORT --persist-to $PERSIST > $LOG 2>&1 &
for i in $(seq 1 30); do sleep 2; [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' localhost:$PORT/api/health)" = "200" ] && break; done
node cloudflare/scripts/sla-e2e.mjs http://localhost:$PORT $PERSIST $LOG
RESULT=$?
kill %1 2>/dev/null
exit $RESULT
