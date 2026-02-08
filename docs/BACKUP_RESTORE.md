# Backup & Restore Guide

RegIntel v2 includes automated database backup and restore scripts with integrity verification and optional encryption.

## Quick Start

### Create Backup

```bash
./scripts/backup-db.sh
```

Output:
```
RegIntel v2 - Database Backup
Timestamp: 20260129_143000
Database: postgres://postgres:postgres@localhost:5432/regintel
Backup file: ./backups/regintel_20260129_143000.dump

✅ Backup verified: ./backups/regintel_20260129_143000.dump
✅ Checksum: abcdef1234567890...
Backup size: 245M
```

### Restore Backup

```bash
./scripts/restore-db.sh backups/regintel_20260129_143000.dump
```

**WARNING:** This will replace the current database!

### Validate Backup

```bash
./scripts/validate-backup.sh backups/regintel_20260129_143000.dump
```

Restores to test database and verifies integrity.

## Configuration

### Environment Variables

```bash
# Database connection (override default)
export DATABASE_URL="postgres://user:pass@host:5432/dbname"

# Backup directory (default: ./backups)
export BACKUP_DIR="/var/regintel/backups"

# Retention policy (default: 30 days)
export RETENTION_DAYS=90

# GPG encryption (optional, recommended for production)
export GPG_RECIPIENT="admin@regintel.com"
```

## Backup Features

### ✅ Implemented

- **Custom Format:** Uses `pg_dump --format=custom` for efficient compression
- **Integrity Verification:** `pg_restore --list` validates backup after creation
- **Checksum:** SHA-256 checksum for tamper detection
- **Compression:** Level 9 compression (gzip)
- **Retention Policy:** Automatic cleanup of old backups
- **Optional Encryption:** GPG encryption for production deployments

### Backup Structure

```
backups/
├── regintel_20260129_143000.dump         # Backup file
├── regintel_20260129_143000.dump.sha256  # Checksum
├── regintel_20260128_020000.dump.gpg     # Encrypted backup (if GPG enabled)
└── regintel_20260128_020000.dump.gpg.sha256
```

## Restore Process

### 1. Verify Backup Integrity

Before restore, verify checksum and integrity:

```bash
./scripts/validate-backup.sh backups/regintel_20260129_143000.dump
```

Output:
```
✅ Checksum verified
✅ Backup file is valid
Tables: 12
Provider snapshots: 42
Findings: 137
Audit events: 589
RLS policies: 8
✅ Backup validation complete!
```

### 2. Stop Application

```bash
# Stop API server
pnpm --dir apps/api stop

# Stop web server
pnpm --dir apps/web stop
```

### 3. Restore Database

```bash
./scripts/restore-db.sh backups/regintel_20260129_143000.dump
```

Interactive prompt:
```
⚠️  WARNING: This will replace the database at:
    postgres://postgres:postgres@localhost:5432/regintel

Are you sure you want to continue? (yes/no): yes
```

### 4. Restart Application

```bash
# Start API server
pnpm api:dev

# Start web server
pnpm web:dev
```

## Production Deployment

### Automated Backups (GitHub Actions)

**File:** `.github/workflows/backup.yml`

```yaml
name: Database Backup

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:  # Manual trigger

jobs:
  backup:
    name: Backup Production Database
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install PostgreSQL client
        run: sudo apt-get install -y postgresql-client

      - name: Run backup
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
          BACKUP_DIR: /tmp/backups
          GPG_RECIPIENT: ${{ secrets.BACKUP_GPG_RECIPIENT }}
        run: ./scripts/backup-db.sh

      - name: Upload to S3
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-2

      - name: Sync backups to S3
        run: aws s3 sync /tmp/backups s3://regintel-backups/database/
```

### Manual Backup (Production)

```bash
# SSH into production server
ssh admin@regintel.com

# Set production database URL
export DATABASE_URL="postgres://regintel_prod:***@db.regintel.com:5432/regintel_prod"

# Create backup with encryption
export GPG_RECIPIENT="admin@regintel.com"
export BACKUP_DIR="/var/regintel/backups"

./scripts/backup-db.sh
```

### Backup to S3

```bash
# After creating backup
aws s3 cp backups/regintel_20260129_143000.dump.gpg \
  s3://regintel-backups/database/ \
  --storage-class GLACIER_IR \
  --server-side-encryption AES256

# Verify upload
aws s3 ls s3://regintel-backups/database/
```

## Encryption

### Setup GPG Key

```bash
# Generate GPG key
gpg --gen-key
# Follow prompts, use admin@regintel.com as email

# Export public key (for backup servers)
gpg --export -a admin@regintel.com > backup-public.key

# Import on backup server
gpg --import backup-public.key
```

### Encrypted Backup

```bash
# Create encrypted backup
export GPG_RECIPIENT="admin@regintel.com"
./scripts/backup-db.sh

# Output: backups/regintel_20260129_143000.dump.gpg
```

### Decrypt Backup

```bash
# Restore will automatically decrypt
./scripts/restore-db.sh backups/regintel_20260129_143000.dump.gpg

# Or manually decrypt
gpg --decrypt backups/regintel_20260129_143000.dump.gpg > backup.dump
```

## Disaster Recovery

### Scenario: Database Corruption

1. **Identify Latest Valid Backup**
   ```bash
   ls -lh backups/regintel_*.dump | tail -5
   ```

2. **Validate Backup**
   ```bash
   ./scripts/validate-backup.sh backups/regintel_20260129_020000.dump
   ```

3. **Restore**
   ```bash
   ./scripts/restore-db.sh backups/regintel_20260129_020000.dump
   ```

4. **Verify Audit Chain Integrity**
   ```bash
   curl http://localhost:3001/v1/audit/verify-chain \
     -H "Authorization: Bearer $CLERK_TEST_TOKEN"
   ```

### Scenario: Accidental Data Deletion

1. **Stop All Write Operations**
   ```bash
   # Disable API writes (set to read-only mode)
   export READ_ONLY_MODE=true
   pnpm api:dev
   ```

2. **Identify Last Good Backup**
   ```bash
   # Find backups before deletion timestamp
   ls -lh backups/ | grep "20260129"
   ```

3. **Restore to Staging Database**
   ```bash
   export DATABASE_URL="postgres://postgres:postgres@localhost:5432/regintel_staging"
   ./scripts/restore-db.sh backups/regintel_20260129_120000.dump
   ```

4. **Extract Deleted Data**
   ```bash
   psql regintel_staging -c "COPY findings TO '/tmp/recovered_findings.csv' CSV HEADER;"
   ```

5. **Import to Production**
   ```bash
   psql regintel_prod -c "COPY findings FROM '/tmp/recovered_findings.csv' CSV HEADER;"
   ```

## Monitoring

### Backup Age Alert

```bash
# Check backup age (alert if > 24 hours)
LATEST_BACKUP=$(ls -t backups/regintel_*.dump | head -1)
BACKUP_AGE=$(( ($(date +%s) - $(stat -f %m "$LATEST_BACKUP")) / 3600 ))

if [ $BACKUP_AGE -gt 24 ]; then
  echo "⚠️  WARNING: Latest backup is $BACKUP_AGE hours old!"
  # Send alert (e.g., Slack, PagerDuty)
fi
```

### Backup Size Monitoring

```bash
# Check backup size (alert if significantly different from average)
du -sh backups/regintel_*.dump | tail -5
```

## Retention Policy

### Default Policy

- **Daily backups:** Kept for 30 days
- **Automatic cleanup:** `find ... -mtime +30 -delete`

### Production Policy (Recommended)

- **Daily backups:** 30 days (local)
- **Weekly backups:** 3 months (S3 Standard)
- **Monthly backups:** 7 years (S3 Glacier Deep Archive)

**Implementation:**

```bash
# Tag weekly backups (Sunday)
if [ $(date +%u) -eq 7 ]; then
  cp $BACKUP_FILE ${BACKUP_FILE%.dump}.weekly.dump
  aws s3 cp ${BACKUP_FILE%.dump}.weekly.dump \
    s3://regintel-backups/weekly/ \
    --storage-class STANDARD
fi

# Tag monthly backups (1st of month)
if [ $(date +%d) -eq 01 ]; then
  cp $BACKUP_FILE ${BACKUP_FILE%.dump}.monthly.dump
  aws s3 cp ${BACKUP_FILE%.dump}.monthly.dump \
    s3://regintel-backups/monthly/ \
    --storage-class DEEP_ARCHIVE
fi
```

## Compliance

### GDPR Requirements

✅ **Right to Erasure:** Backups include deleted user data. Comply via:
1. Pseudonymization in backups (hash PII)
2. 30-day retention policy for erasure requests
3. Document retention justification (legitimate interest)

✅ **Encryption:** GPG encryption of backups at rest

✅ **Access Control:** Backup GPG key stored in 1Password, access logged

### CQC Audit Trail

✅ **Immutable Audit Log:** Audit chain included in backups
✅ **Verification:** `pg_restore --list` validates backup integrity
✅ **Retention:** 7 years for regulatory compliance

## Troubleshooting

### Issue: "pg_dump: command not found"

**Solution:** Install PostgreSQL client

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql
```

### Issue: Backup verification fails

**Solution:** Check disk space and permissions

```bash
df -h                    # Check disk space
ls -lh backups/          # Check file permissions
pg_restore --list backup.dump  # Manual verification
```

### Issue: Restore fails with "role does not exist"

**Solution:** Use `--no-owner` flag (already included in restore script)

```bash
pg_restore --dbname=$DB_URL --no-owner backup.dump
```

## Support

- **PostgreSQL Docs:** https://www.postgresql.org/docs/current/backup.html
- **pg_dump Reference:** https://www.postgresql.org/docs/current/app-pgdump.html
- **RegIntel Issues:** https://github.com/yourusername/regintel-v2/issues
