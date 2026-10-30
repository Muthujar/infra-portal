#!/usr/bin/env bash
# End-to-end check of a running portal (docker compose up), in mock mode.
# Logs in, requests a server, approves it and waits until the worker finishes it.
# Usage: scripts/smoke-test.sh [base-url]     (default http://localhost:8080)
# Needs: curl and jq

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
API="$BASE_URL/api"

echo "Waiting for $API/health ..."
for attempt in $(seq 1 60); do
  if curl -fs "$API/health" > /dev/null; then
    break
  fi
  if [ "$attempt" = "60" ]; then
    echo "API did not start in time"
    exit 1
  fi
  sleep 2
done
curl -fs "$API/health"
echo

login() {
  curl -fs -X POST "$API/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Password@123\"}" | jq -r .token
}

DEV_TOKEN=$(login dev@demo.local)
LEAD_TOKEN=$(login lead@demo.local)

ITEM_ID=$(curl -fs "$API/catalog" -H "Authorization: Bearer $DEV_TOKEN" | jq '[.[] | select(.platform == "PROXMOX")][0].id')
HOSTNAME="smoke-$(date +%s)"

REQUEST_ID=$(curl -fs -X POST "$API/requests" -H "Authorization: Bearer $DEV_TOKEN" -H "Content-Type: application/json" \
  -d "{\"catalogItemId\":$ITEM_ID,\"hostname\":\"$HOSTNAME\",\"environment\":\"DEV\",\"justification\":\"smoke test\"}" | jq .id)
echo "Created request #$REQUEST_ID ($HOSTNAME)"

curl -fs -X POST "$API/requests/$REQUEST_ID/approve" -H "Authorization: Bearer $LEAD_TOKEN" \
  -H "Content-Type: application/json" -d '{"comment":"smoke test"}' > /dev/null
echo "Approved, waiting for the worker ..."

STATUS=""
for attempt in $(seq 1 60); do
  STATUS=$(curl -fs "$API/requests/$REQUEST_ID" -H "Authorization: Bearer $DEV_TOKEN" | jq -r .status)
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
    break
  fi
  sleep 2
done

echo "Final status: $STATUS"
if [ "$STATUS" != "COMPLETED" ]; then
  exit 1
fi
echo "Smoke test passed"
