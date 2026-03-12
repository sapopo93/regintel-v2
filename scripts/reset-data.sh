#!/usr/bin/env bash
# reset-data.sh — Wipe ALL tenant data from the database and restart the API.
#
# Use this to clear demo/test data before onboarding real customers.
# The database schema (tables, enums, migrations) is kept intact.
# Evidence blob files on disk are also removed.
#
# Usage (run from ~/regintel-v2 on the EC2 server):
#   bash scripts/reset-data.sh
#
# To wipe only a specific tenant (safer for multi-tenant production):
#   TENANT_ID="user_xxx" bash scripts/reset-data.sh

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║         RegIntel Data Reset                          ║${NC}"
echo -e "${YELLOW}║  This will DELETE all providers, facilities,         ║${NC}"
echo -e "${YELLOW}║  sessions, findings, evidence and audit data.        ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Load DATABASE_URL ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/apps/api/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: .env not found at $ENV_FILE${NC}"
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL' "$ENV_FILE" | cut -d'=' -f2-)
if [[ -z "$DATABASE_URL" ]]; then
  echo -e "${RED}ERROR: DATABASE_URL not set in $ENV_FILE${NC}"
  exit 1
fi

BLOB_STORAGE_PATH=$(grep '^BLOB_STORAGE_PATH' "$ENV_FILE" | cut -d'=' -f2- || echo "/var/regintel/evidence-blobs")

# ── Confirm ──────────────────────────────────────────────────────────────────
if [[ -n "${TENANT_ID:-}" ]]; then
  echo -e "Mode: ${YELLOW}SINGLE TENANT${NC} — will only delete data for: ${YELLOW}$TENANT_ID${NC}"
else
  echo -e "Mode: ${RED}FULL WIPE${NC} — will delete ALL tenant data"
fi
echo ""
read -p "Type 'yes' to confirm: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "==> Stopping API..."
pm2 stop regintel-api 2>/dev/null || true

# ── SQL reset ────────────────────────────────────────────────────────────────
echo "==> Clearing database tables..."

if [[ -n "${TENANT_ID:-}" ]]; then
  # Scoped delete — only removes rows for the given tenant
  psql "$DATABASE_URL" <<EOF
BEGIN;
DELETE FROM document_audits       WHERE tenant_id = '$TENANT_ID';
DELETE FROM audit_events_v2       WHERE tenant_id = '$TENANT_ID';
DELETE FROM exports_v2            WHERE tenant_id = '$TENANT_ID';
DELETE FROM evidence_records_v2   WHERE tenant_id = '$TENANT_ID';
DELETE FROM evidence_blobs_v2     WHERE tenant_id = '$TENANT_ID';
DELETE FROM findings_v2           WHERE tenant_id = '$TENANT_ID';
DELETE FROM cqc_intelligence_alerts_v2     WHERE tenant_id = '$TENANT_ID';
DELETE FROM cqc_intelligence_poll_state_v2 WHERE tenant_id = '$TENANT_ID';
DELETE FROM usage_events_v2       WHERE tenant_id = '$TENANT_ID';
DELETE FROM mock_sessions_v2      WHERE tenant_id = '$TENANT_ID';
-- Legacy V1 tables (may be empty)
DELETE FROM audit_events          WHERE tenant_id = '$TENANT_ID';
DELETE FROM evidence_records      WHERE tenant_id = '$TENANT_ID';
DELETE FROM evidence_blobs        WHERE tenant_id = '$TENANT_ID';
DELETE FROM findings              WHERE tenant_id = '$TENANT_ID';
DELETE FROM draft_findings        WHERE tenant_id = '$TENANT_ID';
DELETE FROM session_events        WHERE tenant_id = '$TENANT_ID';
DELETE FROM mock_inspection_sessions WHERE tenant_id = '$TENANT_ID';
DELETE FROM provider_context_snapshots WHERE tenant_id = '$TENANT_ID';
DELETE FROM facilities            WHERE tenant_id = '$TENANT_ID';
DELETE FROM providers             WHERE tenant_id = '$TENANT_ID';
COMMIT;
EOF
else
  # Full wipe — TRUNCATE is faster and resets sequences
  psql "$DATABASE_URL" <<'EOF'
BEGIN;
-- Truncate in dependency order (children before parents)
TRUNCATE document_audits                   CASCADE;
TRUNCATE audit_events_v2                   CASCADE;
TRUNCATE exports_v2                        CASCADE;
TRUNCATE evidence_records_v2               CASCADE;
TRUNCATE evidence_blobs_v2                 CASCADE;
TRUNCATE findings_v2                       CASCADE;
TRUNCATE cqc_intelligence_alerts_v2        CASCADE;
TRUNCATE cqc_intelligence_poll_state_v2    CASCADE;
TRUNCATE usage_events_v2                   CASCADE;
TRUNCATE mock_sessions_v2                  CASCADE;
-- Legacy V1 tables
TRUNCATE audit_events                      CASCADE;
TRUNCATE evidence_records                  CASCADE;
TRUNCATE evidence_blobs                    CASCADE;
TRUNCATE findings                          CASCADE;
TRUNCATE draft_findings                    CASCADE;
TRUNCATE session_events                    CASCADE;
TRUNCATE mock_inspection_sessions          CASCADE;
TRUNCATE provider_context_snapshots        CASCADE;
TRUNCATE facilities                        CASCADE;
TRUNCATE providers                         CASCADE;
COMMIT;
EOF
fi

echo -e "${GREEN}✓ Database cleared${NC}"

# ── Clear evidence blobs on disk ─────────────────────────────────────────────
if [[ -d "$BLOB_STORAGE_PATH" ]]; then
  echo "==> Clearing evidence blob files at $BLOB_STORAGE_PATH ..."
  find "$BLOB_STORAGE_PATH" -mindepth 1 -delete 2>/dev/null || true
  echo -e "${GREEN}✓ Blob storage cleared${NC}"
else
  echo "(Blob storage path $BLOB_STORAGE_PATH not found — skipping)"
fi

# ── Restart API ──────────────────────────────────────────────────────────────
echo "==> Restarting API..."
pm2 start regintel-api 2>/dev/null || pm2 restart regintel-api
sleep 3
pm2 status regintel-api --no-color

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Reset complete. Ready for real customers.           ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║  Next steps:                                         ║${NC}"
echo -e "${GREEN}║  1. Log in to the app with your real account         ║${NC}"
echo -e "${GREEN}║  2. Create your provider via the UI or API           ║${NC}"
echo -e "${GREEN}║  3. Register facilities via 'Register a Location'    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
