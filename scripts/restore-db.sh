#!/bin/bash
set -euo pipefail

#
# RegIntel v2: Database Restore Script
#
# Restores PostgreSQL database from backup with integrity verification.
# Supports encrypted backups (GPG).
#

BACKUP_FILE="$1"
DB_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/regintel}"

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
  echo "  $0 backups/regintel_20260129_143000.dump.gpg"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
  exit 1
fi

echo -e "${GREEN}RegIntel v2 - Database Restore${NC}"
echo "Backup file: $BACKUP_FILE"
echo "Database: $DB_URL"
echo ""

# Decrypt if needed
if [[ "$BACKUP_FILE" == *.gpg ]]; then
  echo -e "${YELLOW}Decrypting backup...${NC}"
  DECRYPTED_FILE="${BACKUP_FILE%.gpg}"
  gpg --decrypt "$BACKUP_FILE" > "$DECRYPTED_FILE"
  BACKUP_FILE="$DECRYPTED_FILE"
  # Clean up decrypted file on exit
  trap "rm -f $DECRYPTED_FILE" EXIT
  echo -e "${GREEN}✅ Decrypted successfully${NC}"
  echo ""
fi

# Verify checksum if available
if [[ -f "$BACKUP_FILE.sha256" ]]; then
  echo -e "${YELLOW}Verifying checksum...${NC}"
  EXPECTED_SHA=$(cat "$BACKUP_FILE.sha256")
  
  if command -v shasum &> /dev/null; then
    ACTUAL_SHA=$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')
  else
    ACTUAL_SHA=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
  fi

  if [[ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]]; then
    echo -e "${RED}❌ Checksum mismatch!${NC}"
    echo "Expected: $EXPECTED_SHA"
    echo "Actual:   $ACTUAL_SHA"
    exit 1
  fi
  echo -e "${GREEN}✅ Checksum verified${NC}"
  echo ""
fi

# Verify backup integrity
echo -e "${YELLOW}Verifying backup integrity...${NC}"
if pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Backup file is valid${NC}"
else
  echo -e "${RED}❌ Backup file is corrupted!${NC}"
  exit 1
fi
echo ""

# Confirm restore
echo -e "${YELLOW}⚠️  WARNING: This will replace the database at:${NC}"
echo -e "${YELLOW}    $DB_URL${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo -e "${YELLOW}Restore cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${YELLOW}Restoring database...${NC}"

# Restore database
# --clean: Drop existing objects before restoring
# --if-exists: Don't error if objects don't exist
# --no-owner: Don't restore ownership info (use current user)
# --no-acl: Don't restore access privileges
pg_restore \
  --dbname="$DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --verbose \
  "$BACKUP_FILE"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Database restored successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
