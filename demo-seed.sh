#!/bin/bash
# ============================================================
# ReginTel V2 Demo Seed Script
# Populates rich demo data for Ekklesia Healthcare on API boot
# ============================================================
set -euo pipefail

API="http://localhost:4001"
TOKEN="Bearer demo-founder-token-12345"
CURL="curl -sf -H Authorization:\ $TOKEN -H Content-Type:\ application/json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SEED]${NC} $*"; }
warn() { echo -e "${YELLOW}[SEED]${NC} $*"; }
fail() { echo -e "${RED}[SEED]${NC} $*"; exit 1; }

# Helper: POST and extract JSON field via python
post() {
  local url="$1" data="$2"
  curl -sf -X POST "$url" \
    -H "Authorization: $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$data"
}

get() {
  curl -sf "$1" -H "Authorization: $TOKEN"
}

json_field() {
  python3 -c "import sys,json; print(json.load(sys.stdin)$1)"
}

# ── 1. Wait for API health ──────────────────────────────────
log "Waiting for API at $API/health ..."
for i in $(seq 1 60); do
  if curl -sf "$API/health" > /dev/null 2>&1; then
    log "API is healthy (attempt $i)"
    break
  fi
  if [ "$i" -eq 60 ]; then
    fail "API did not become healthy after 60s"
  fi
  sleep 1
done

# ── 2. Create Provider ──────────────────────────────────────
log "Creating provider: Ekklesia Healthcare Ltd"
PROVIDER_RESP=$(post "$API/v1/providers" '{"providerName":"Ekklesia Healthcare Ltd"}')
PROVIDER_ID=$(echo "$PROVIDER_RESP" | json_field "['provider']['providerId']")
log "  Provider ID: $PROVIDER_ID"

# ── 3. Onboard 3 Facilities ─────────────────────────────────
declare -a FACILITY_IDS=()
declare -a FACILITY_NAMES=()

onboard_facility() {
  local name="$1" type="$2" addr="$3" town="$4" postcode="$5" cqcId="$6" extra="${7:-}"
  log "Onboarding: $name"

  local payload="{
    \"providerId\": \"$PROVIDER_ID\",
    \"facilityName\": \"$name\",
    \"serviceType\": \"$type\",
    \"addressLine1\": \"$addr\",
    \"townCity\": \"$town\",
    \"postcode\": \"$postcode\",
    \"cqcLocationId\": \"$cqcId\"
    $extra
  }"

  local resp
  resp=$(post "$API/v1/facilities/onboard" "$payload")
  local fid
  fid=$(echo "$resp" | json_field "['facility']['id']")
  log "  Facility ID: $fid"
  FACILITY_IDS+=("$fid")
  FACILITY_NAMES+=("$name")
}

onboard_facility \
  "Ekklesia Domiciliary Care - Ipswich" "domiciliary" \
  "3 Princes Street" "Ipswich" "IP1 1PH" "1-16143498196"

onboard_facility \
  "Ekklesia Residential Care - Suffolk" "residential" \
  "45 Crown Street" "Bury St Edmunds" "IP33 1QU" "1-10000000001"

onboard_facility \
  "Ekklesia Nursing Home - Woodbridge" "nursing" \
  "12 Thoroughfare" "Woodbridge" "IP12 1AA" "1-10000000002" \
  ', "capacity": 42'

# ── 4. Create Mock Inspection Sessions ──────────────────────
declare -a SESSION_IDS=()

create_session_and_answer() {
  local fid="$1" topic="$2" answer="$3"
  log "  Mock session: facility=$fid topic=$topic"

  local resp
  resp=$(post "$API/v1/providers/$PROVIDER_ID/mock-sessions" \
    "{\"facilityId\":\"$fid\",\"topicId\":\"$topic\"}")
  local sid
  sid=$(echo "$resp" | json_field "['sessionId']")
  log "    Session ID: $sid"

  # Answer to complete the session and generate findings
  local answer_resp
  answer_resp=$(post "$API/v1/providers/$PROVIDER_ID/mock-sessions/$sid/answer" \
    "{\"answer\":\"$answer\"}")
  local status
  status=$(echo "$answer_resp" | json_field "['status']")
  log "    Status: $status"
  SESSION_IDS+=("$sid")
}

for i in "${!FACILITY_IDS[@]}"; do
  fid="${FACILITY_IDS[$i]}"
  fname="${FACILITY_NAMES[$i]}"
  log "Creating inspection sessions for: $fname"

  create_session_and_answer "$fid" "safe-care-treatment" \
    "We have comprehensive risk assessments reviewed quarterly. Medication management follows NICE guidelines with double-checking protocols. All incidents are logged in our electronic system and reviewed weekly by the registered manager. We recently updated our infection control policy post-COVID."

  create_session_and_answer "$fid" "staffing" \
    "We maintain staffing ratios above CQC minimum requirements. All staff complete a 12-week induction programme aligned to the Care Certificate. Supervisions are monthly and appraisals annual. We use a dependency tool to calculate staffing needs and have agency staff agreements for cover."
done

# ── 5. Verify Overview Endpoints ─────────────────────────────
log "Verifying overview data for each facility..."
VERIFY_OK=0
VERIFY_FAIL=0

for i in "${!FACILITY_IDS[@]}"; do
  fid="${FACILITY_IDS[$i]}"
  fname="${FACILITY_NAMES[$i]}"

  resp=$(get "$API/v1/providers/$PROVIDER_ID/overview?facility=$fid" 2>/dev/null || echo "FAILED")
  if [ "$resp" = "FAILED" ]; then
    warn "  ✗ $fname — overview request failed"
    VERIFY_FAIL=$((VERIFY_FAIL + 1))
  else
    topics=$(echo "$resp" | json_field "['topicsCompleted']" 2>/dev/null || echo "?")
    findings=$(echo "$resp" | json_field "['openFindings']" 2>/dev/null || echo "?")
    log "  ✓ $fname — topics=$topics, findings=$findings"
    VERIFY_OK=$((VERIFY_OK + 1))
  fi
done

# ── 6. Summary ───────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║           ReginTel V2 Demo Seed Complete                ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Provider: Ekklesia Healthcare Ltd                      ║"
echo "║  Provider ID: $PROVIDER_ID"
echo "║  Facilities: ${#FACILITY_IDS[@]}                                          ║"
echo "║  Sessions:   ${#SESSION_IDS[@]} (2 topics × 3 facilities)               ║"
echo "║  Verified:   $VERIFY_OK OK, $VERIFY_FAIL failed                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
for i in "${!FACILITY_IDS[@]}"; do
  echo "║  ${FACILITY_NAMES[$i]}"
  echo "║    → ${FACILITY_IDS[$i]}"
done
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "$VERIFY_FAIL" -gt 0 ]; then
  warn "Some verifications failed — check API logs"
  exit 1
fi

log "All done. API: $API | Web: http://localhost:4000"
