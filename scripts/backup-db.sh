#!/bin/bash
set -euo pipefail

#
# RegIntel v2: Database Backup Script
#
# Creates timestamped PostgreSQL backups with integrity verification.
# Supports optional GPG encryption for production deployments.
#

# Configuration
DB_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/regintel}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/regintel_${TIMESTAMP}.dump"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}RegIntel v2 - Database Backup${NC}"
echo "Timestamp: $TIMESTAMP"
echo "Database: $DB_URL"
echo "Backup file: $BACKUP_FILE"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Dump database (custom format for pg_restore)
echo -e "${YELLOW}Creating backup...${NC}"
pg_dump "$DB_URL" \
  --format=custom \
  --compress=9 \
  --file="$BACKUP_FILE" \
  --verbose

# Verify backup integrity
echo ""
echo -e "${YELLOW}Verifying backup integrity...${NC}"
if pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Backup verified successfully${NC}"
else
  echo -e "${RED}❌ Backup verification failed!${NC}"
  exit 1
fi

# Calculate checksum
echo ""
echo -e "${YELLOW}Calculating checksum...${NC}"
if command -v shasum &> /dev/null; then
  SHA256=$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')
else
  SHA256=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
fi
echo "$SHA256" > "$BACKUP_FILE.sha256"
echo -e "${GREEN}✅ Checksum: $SHA256${NC}"

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | awk '{print $1}')
echo -e "${GREEN}Backup size: $BACKUP_SIZE${NC}"

# Optional: Encrypt backup (production requirement)
if [[ -n "${GPG_RECIPIENT:-}" ]]; then
  echo ""
  echo -e "${YELLOW}Encrypting backup...${NC}"
  gpg --encrypt --recipient "$GPG_RECIPIENT" "$BACKUP_FILE"
  echo -e "${GREEN}✅ Encrypted: $BACKUP_FILE.gpg${NC}"
  # Remove unencrypted backup
  rm "$BACKUP_FILE"
  BACKUP_FILE="$BACKUP_FILE.gpg"
fi

# Cleanup old backups
echo ""
echo -e "${YELLOW}Cleaning up backups older than $RETENTION_DAYS days...${NC}"
DELETED=$(find "$BACKUP_DIR" -name "regintel_*.dump*" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo -e "${GREEN}✅ Deleted $DELETED old backup(s)${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Backup completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo "File: $BACKUP_FILE"
echo "Checksum: $SHA256"
echo "Size: $BACKUP_SIZE"
