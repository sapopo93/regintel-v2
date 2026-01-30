# Evidence Blob Storage

This document describes the content-addressed blob storage system for evidence files.

## Overview

RegIntel v2 uses content-addressed storage for evidence blobs (PDFs, images, documents). Each file is stored based on its SHA-256 hash, providing:

- **Deduplication:** Identical files are only stored once
- **Integrity:** Content hash verifies file hasn't been tampered with
- **Traceability:** Multiple tenants can reference the same blob
- **Malware scanning:** All uploads are scanned for malware

## Storage Backend

### Filesystem Storage (Current)

Blobs are stored in a sharded directory structure:

```
/var/regintel/evidence-blobs/
├── ab/
│   ├── cd/
│   │   └── abcdef123...  (blob file named by hash)
├── .quarantine/
│   └── infected-hash     (quarantined files)
```

**Sharding:** First 4 characters of hash (2 levels) prevent filesystem performance issues.

### Configuration

Set storage path via environment variable:

```bash
BLOB_STORAGE_PATH=/var/regintel/evidence-blobs
```

Default: `/var/regintel/evidence-blobs`

## API Endpoints

### Upload Blob

**POST** `/v1/evidence/blobs`

Upload evidence blob. Returns immediately with `PENDING` scan status. Background job scans for malware.

**Request:**
```json
{
  "contentBase64": "base64-encoded-content",
  "mimeType": "application/pdf"
}
```

**Response:**
```json
{
  "blobHash": "sha256:abcdef123...",
  "mimeType": "application/pdf",
  "sizeBytes": 12345,
  "uploadedAt": "2026-01-29T17:30:00Z",
  "scanStatus": "PENDING"
}
```

**Deduplication:** If blob already exists, returns existing hash immediately.

### Download Blob

**GET** `/v1/evidence/blobs/:blobHash`

Download blob content by hash.

**Response:**
- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment; filename="<hash>"`
- Binary blob content

**Errors:**
- `404 Not Found` - Blob doesn't exist or has been quarantined

### Check Scan Status

**GET** `/v1/evidence/blobs/:blobHash/scan`

Check malware scan status for uploaded blob.

**Response:**
```json
{
  "contentHash": "sha256:abcdef123...",
  "status": "CLEAN",
  "scannedAt": "2026-01-29T17:30:05Z",
  "scanEngine": "stub-scanner-v1"
}
```

**Statuses:**
- `PENDING` - Scan in progress
- `CLEAN` - No threats detected
- `INFECTED` - Malware detected (blob quarantined)

## Malware Scanning

### Current Implementation (Stub)

The current implementation always returns `CLEAN`. This is a **stub** for development.

### Production Integration

For production, integrate with a malware scanner:

#### Option 1: ClamAV (Open Source)

```bash
# Install ClamAV
apt-get install clamav clamav-daemon

# Start daemon
systemctl start clamav-daemon

# Update virus definitions
freshclam
```

**Integration:**
```typescript
import { NodeClam } from 'clamscan';

const scanner = new NodeClam().init({
  clamdscan: {
    socket: '/var/run/clamav/clamd.ctl',
    timeout: 60000,
  },
});

const { isInfected, viruses } = await scanner.scanFile('/path/to/file');
```

**Pros:** Free, open source, self-hosted
**Cons:** Requires maintenance, updates

#### Option 2: VirusTotal API

```bash
npm install virustotal-api
```

**Integration:**
```typescript
import virustotal from 'virustotal-api';

const vt = virustotal(process.env.VIRUSTOTAL_API_KEY);
const result = await vt.fileScan('/path/to/file');
```

**Pros:** Multiple scan engines, no maintenance
**Cons:** Rate limits (4 req/min free), costs

#### Option 3: AWS Macie

For S3-based storage, AWS Macie automatically scans uploads.

**Integration:**
```typescript
import { MacieClient, GetFindingsCommand } from '@aws-sdk/client-macie2';

const client = new MacieClient({ region: 'us-east-1' });
const findings = await client.send(new GetFindingsCommand({
  findingIds: [findingId],
}));
```

**Pros:** Automated, scalable, integrated with S3
**Cons:** AWS-specific, costs

### Implementing Production Scanner

1. Update `malware-scanner.ts`:

```typescript
export async function scanBlob(contentHash: string): Promise<ScanResult> {
  const content = await blobStorage.download(contentHash);

  // Replace with actual scanner
  const isInfected = await yourMalwareScanner.scan(content);

  if (isInfected) {
    await quarantineBlob(contentHash, 'Malware detected');
    return { contentHash, status: 'INFECTED', ... };
  }

  return { contentHash, status: 'CLEAN', ... };
}
```

2. Add background worker:

```typescript
// Start background job
setInterval(scanPendingBlobs, 60000); // Every minute
```

3. Update database schema (see next section)

## Database Schema

Add scan status to `evidence_blobs` table:

```sql
ALTER TABLE evidence_blobs ADD COLUMN scan_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE evidence_blobs ADD COLUMN scanned_at TIMESTAMP;
ALTER TABLE evidence_blobs ADD COLUMN scan_result TEXT;

CREATE INDEX idx_evidence_blobs_scan_status ON evidence_blobs(scan_status);
```

## Quarantine Workflow

When malware is detected:

1. Move blob to `.quarantine` directory
2. Update database: `scan_status = 'INFECTED'`
3. Log to audit trail
4. Alert administrators
5. Prevent downloads (return 404)

**Manual quarantine:**

```bash
curl -X POST http://localhost:3001/v1/admin/quarantine \
  -H "Authorization: Bearer $FOUNDER_TOKEN" \
  -d '{"blobHash": "sha256:infected-hash", "reason": "manual review"}'
```

## Migration to S3

For production scale, migrate to S3:

1. Install AWS SDK:
```bash
npm install @aws-sdk/client-s3
```

2. Create S3 storage adapter:
```typescript
export class S3BlobStorage implements BlobStorageBackend {
  async upload(content: Buffer, contentType: string): Promise<BlobMetadata> {
    const hash = computeHash(content);
    await s3.putObject({
      Bucket: 'regintel-evidence',
      Key: hash,
      Body: content,
      ContentType: contentType,
    });
    return { contentHash: hash, ... };
  }
}
```

3. Update configuration:
```bash
BLOB_STORAGE_BACKEND=s3
AWS_S3_BUCKET=regintel-evidence
AWS_REGION=eu-west-2
```

## Security Considerations

1. **Access Control:** Blob downloads require authentication
2. **Encryption:** S3 uses encryption at rest (AES-256)
3. **Malware Scanning:** All uploads scanned before serving
4. **Audit Logging:** All uploads logged to audit trail
5. **Rate Limiting:** Prevent DoS via upload flooding

## Performance

**Filesystem:**
- Upload: ~10 MB/s
- Download: ~50 MB/s
- Suitable for: <100k files, <1 TB storage

**S3:**
- Upload: ~100 MB/s (multipart)
- Download: ~500 MB/s (CloudFront)
- Suitable for: Unlimited files, unlimited storage

## Monitoring

Key metrics to monitor:

- Upload rate (blobs/hour)
- Storage usage (GB)
- Scan queue length
- Infected files detected
- Average scan time

## Troubleshooting

### Blob upload fails

**Check:**
1. Storage path exists and is writable: `ls -la /var/regintel/evidence-blobs`
2. Sufficient disk space: `df -h`
3. Content is valid base64: `echo $CONTENT | base64 -d`

### Scan always returns PENDING

**Check:**
1. Background scanner is running
2. No errors in logs: `grep MALWARE_SCAN /var/log/regintel/api.log`
3. Scanner has access to blob storage

### Quarantined file needed for recovery

**Recovery:**
```bash
# List quarantined files
ls /var/regintel/evidence-blobs/.quarantine/

# Restore (use with caution!)
mv /var/regintel/evidence-blobs/.quarantine/HASH \
   /var/regintel/evidence-blobs/ab/cd/abcd...
```

---

**Last Updated:** 2026-01-29
