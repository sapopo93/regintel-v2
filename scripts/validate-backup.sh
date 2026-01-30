#!/bin/bash
set -euo pipefail

#
# RegIntel v2: Backup Validation Script
#
# Validates backup integrity by restoring to a test database.
# This ensures backups can actually be restored when needed.
#

BACKUP_FILE="$1"
TEST_DB_URL="${TEST_DB_URL:-postgres://postgres:postgres@localhost:5432/regintel_restore_test}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [[ -z "$BACKUP_FILE" ]]; then
  echo -e "${RED}Usage: $0 <backup-file>${NC}"
  echo ""
  echo "Example:"
  echo "  $0 backups/regintel_20260129_143000.dump"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
  exit 1
fi

echo -e "${GREEN}RegIntel v2 - Backup Validation${NC}"
echo "Backup file: $BACKUP_FILE"
echo "Test database: $TEST_DB_URL"
echo ""

# Extract database name from URL
DB_NAME=$(echo "$TEST_DB_URL" | grep -oP '(?<=/)[^/]+$')
ADMIN_URL=$(echo "$TEST_DB_URL" | sed "s|/$DB_NAME|/postgres|")

echo -e "${YELLOW}Creating test database...${NC}"
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
psql "$ADMIN_URL" -c "CREATE DATABASE $DB_NAME;"
echo -e "${GREEN}✅ Test database created${NC}"
echo ""

# Decrypt if needed
TEMP_FILE=""
if [[ "$BACKUP_FILE" == *.gpg ]]; then
  echo -e "${YELLOW}Decrypting backup...${NC}"
  TEMP_FILE="${BACKUP_FILE%.gpg}.tmp"
  gpg --decrypt "$BACKUP_FILE" > "$TEMP_FILE"
  BACKUP_FILE="$TEMP_FILE"
  trap "rm -f $TEMP_FILE" EXIT
  echo -e "${GREEN}✅ Decrypted${NC}"
  echo ""
fi

echo -e "${YELLOW}Restoring to test database...${NC}"
pg_restore \
  --dbname="$TEST_DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  "$BACKUP_FILE" 2>&1 | grep -v "WARNING" || true

echo ""
echo -e "${YELLOW}Validating restored data...${NC}"

# Check table counts
TABLE_COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Tables: $TABLE_COUNT"

if [[ "$TABLE_COUNT" -eq 0 ]]; then
  echo -e "${RED}❌ No tables found in restored database!${NC}"
  psql "$ADMIN_URL" -c "DROP DATABASE $DB_NAME;"
  exit 1
fi

# Check data counts (if tables exist)
if psql "$TEST_DB_URL" -t -c "\d provider_context_snapshots" &> /dev/null; then
  SNAPSHOT_COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM provider_context_snapshots;")
  echo "Provider snapshots: $SNAPSHOT_COUNT"
fi

if psql "$TEST_DB_URL" -t -c "\d findings" &> /dev/null; then
  FINDING_COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM findings;")
  echo "Findings: $FINDING_COUNT"
fi

if psql "$TEST_DB_URL" -t -c "\d audit_events" &> /dev/null; then
  AUDIT_COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM audit_events;")
  echo "Audit events: $AUDIT_COUNT"
fi

# Verify RLS policies
echo ""
echo -e "${YELLOW}Verifying Row-Level Security policies...${NC}"
RLS_COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM pg_policies WHERE tablename IN ('findings', 'provider_context_snapshots', 'audit_events');")
echo "RLS policies: $RLS_COUNT"

if [[ "$RLS_COUNT" -lt 3 ]]; then
  echo -e "${YELLOW}⚠️  Warning: Expected at least 3 RLS policies${NC}"
fi

echo ""
echo -e "${YELLOW}Cleaning up test database...${NC}"
psql "$ADMIN_URL" -c "DROP DATABASE $DB_NAME;"
echo -e "${GREEN}✅ Test database dropped${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Backup validation complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Backup file is valid and can be restored."
