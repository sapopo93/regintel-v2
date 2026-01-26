#!/bin/bash
#
# Quick test script for CQC facility onboarding
# Usage: ./scripts/test-onboarding.sh
#
# Prerequisites:
# 1. API server running: pnpm api:dev
# 2. CQC_API_KEY in .env file
#

set -e

API_URL="http://localhost:3001"
TOKEN="demo-founder-token-12345"
TENANT_ID="tenant-1"
PROVIDER_ID="tenant-1:provider-1"

echo "🏥 Testing CQC Facility Onboarding"
echo "===================================="
echo ""

# Check if API server is running
echo "📡 Checking API server..."
if ! curl -s -f "${API_URL}/health" > /dev/null 2>&1; then
  echo "❌ API server not running on ${API_URL}"
  echo "   Start it with: pnpm api:dev"
  exit 1
fi
echo "✅ API server is running"
echo ""

# Test 1: Single facility onboarding
echo "Test 1: Single Facility Onboarding"
echo "-----------------------------------"
echo "📋 Onboarding facility with CQC ID: 1-101675029"

RESPONSE=$(curl -s -X POST "${API_URL}/v1/facilities/onboard" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}" \
  -d "{
    \"providerId\": \"${PROVIDER_ID}\",
    \"cqcLocationId\": \"1-101675029\"
  }")

# Extract facility ID from response
FACILITY_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$FACILITY_ID" ]; then
  echo "❌ Onboarding failed"
  echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
  exit 1
fi

echo "✅ Facility onboarded successfully!"
echo "   Facility ID: $FACILITY_ID"
echo ""
echo "Response:"
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
echo ""
echo ""

# Test 2: Get facility details
echo "Test 2: Get Facility Details"
echo "-----------------------------"
echo "📋 Fetching facility: $FACILITY_ID"

FACILITY_RESPONSE=$(curl -s -X GET "${API_URL}/v1/facilities/${FACILITY_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}")

echo "✅ Facility details retrieved"
echo ""
echo "Response:"
echo "$FACILITY_RESPONSE" | python3 -m json.tool || echo "$FACILITY_RESPONSE"
echo ""
echo ""

# Test 3: Sync latest report (background job)
echo "Test 3: Sync Latest Report (Background)"
echo "---------------------------------------"
echo "📋 Triggering report sync for: $FACILITY_ID"

SYNC_RESPONSE=$(curl -s -X POST "${API_URL}/v1/facilities/${FACILITY_ID}/sync-latest-report" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}")

JOB_ID=$(echo "$SYNC_RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
  echo "❌ Report sync failed to start"
  echo "$SYNC_RESPONSE" | python3 -m json.tool || echo "$SYNC_RESPONSE"
else
  echo "✅ Background job started"
  echo "   Job ID: $JOB_ID"
  echo ""
  echo "Response:"
  echo "$SYNC_RESPONSE" | python3 -m json.tool || echo "$SYNC_RESPONSE"
  echo ""

  # Wait a bit for job to complete
  echo "⏳ Waiting 3 seconds for background job to complete..."
  sleep 3

  # Check job status
  echo "📋 Checking job status..."
  JOB_STATUS=$(curl -s -X GET "${API_URL}/v1/background-jobs/${JOB_ID}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-Tenant-Id: ${TENANT_ID}")

  echo "$JOB_STATUS" | python3 -m json.tool || echo "$JOB_STATUS"
fi
echo ""
echo ""

# Test 4: Bulk onboarding
echo "Test 4: Bulk Onboarding"
echo "-----------------------"
echo "📋 Onboarding 3 facilities at once"

BULK_RESPONSE=$(curl -s -X POST "${API_URL}/v1/facilities/onboard-bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}" \
  -d "{
    \"providerId\": \"${PROVIDER_ID}\",
    \"cqcLocationIds\": [
      \"1-101675029\",
      \"1-113456789\",
      \"1-123456789\"
    ],
    \"autoSyncReports\": false
  }")

echo "✅ Bulk onboarding completed"
echo ""
echo "Response:"
echo "$BULK_RESPONSE" | python3 -m json.tool || echo "$BULK_RESPONSE"
echo ""
echo ""

# Test 5: Audit trail
echo "Test 5: Audit Trail"
echo "-------------------"
echo "📋 Fetching audit trail for provider"

AUDIT_RESPONSE=$(curl -s -X GET "${API_URL}/v1/providers/${PROVIDER_ID}/audit-trail" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}")

echo "✅ Audit trail retrieved"
echo ""
echo "Response (last 5 events):"
echo "$AUDIT_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
events = data.get('events', [])
for event in events[-5:]:
    print(f\"  - {event.get('eventType', 'Unknown')}: {event.get('timestamp', 'N/A')}\")
"
echo ""
echo ""

echo "✅ All tests completed successfully!"
echo ""
echo "📖 Next Steps:"
echo "   1. View full facility onboarding guide: docs/FACILITY_ONBOARDING_GUIDE.md"
echo "   2. See testing documentation: docs/TESTING_CQC_ONBOARDING.md"
echo "   3. Try onboarding with real CQC Location IDs from https://www.cqc.org.uk/"
echo ""
