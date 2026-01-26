# Facility Onboarding System - Complete Guide

## Overview

The facility onboarding system supports three key scenarios:

1. **Fast Onboarding** - CQC API for basic facility data (address, beds, etc.)
2. **Latest Reports** - Web scraping for up-to-date inspection findings
3. **Never-Inspected Facilities** - Baseline creation for facilities awaiting first inspection

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Onboarding Flow                           │
└─────────────────────────────────────────────────────────────┘

Step 1: Quick Onboarding (5 seconds)
───────────────────────────────────────
POST /v1/facilities/onboard
{ "cqcLocationId": "1-123456789" }
↓
CQC API → Auto-fills: name, address, beds, service type, rating
↓
Facility created with inspectionStatus:
- INSPECTED (has rating)
- NEVER_INSPECTED (no rating from API)
- PENDING_FIRST_INSPECTION (manual entry)


Step 2: Get Latest Report (30-60s, background)
───────────────────────────────────────────────
POST /v1/facilities/:id/sync-latest-report
↓
Scrapes CQC website → Downloads PDF → Stores as evidence
↓
Updates facility with:
- Latest rating (from web, fresher than API)
- Report PDF as evidence
- Scrape timestamp


Step 3: Baseline for Never-Inspected (Guided)
──────────────────────────────────────────────
POST /v1/facilities/:id/create-baseline
↓
Returns step-by-step guide:
1. Upload policies
2. Run self-assessment mock inspections
3. Review findings before real inspection
```

## API Endpoints

### 1. Single Facility Onboarding

**Fast, API-based onboarding**

```bash
POST /v1/facilities/onboard
Authorization: Bearer <token>
X-Tenant-Id: <tenant-uuid>

{
  "providerId": "tenant-1:provider-1",
  "cqcLocationId": "1-123456789",
  // Optional overrides:
  "facilityName": "Main Building",
  "addressLine1": "Custom address",
  "townCity": "London",
  "postcode": "SW1A 1AA",
  "serviceType": "nursing",
  "capacity": 50
}
```

**Response:**
```json
{
  "facility": {
    "id": "tenant-1:facility-1",
    "facilityName": "Sunnydale Care Home",
    "cqcLocationId": "1-123456789",
    "address": "15-17 Wellington Road, Wokingham, RG40 2AG",
    "serviceType": "nursing",
    "capacity": 50,
    "dataSource": "CQC_API",
    "cqcSyncedAt": "2026-01-24T19:45:00.000Z",
    "latestRating": "Good",
    "latestRatingDate": "2024-12-01",
    "inspectionStatus": "INSPECTED",
    "facilityHash": "sha256:abc123...",
    "createdAt": "2026-01-24T19:45:00.000Z"
  },
  "cqcData": { ... },
  "isNew": true,
  "dataSource": "CQC_API",
  "syncedAt": "2026-01-24T19:45:00.000Z"
}
```

### 2. Bulk Onboarding

**Onboard multiple facilities at once**

```bash
POST /v1/facilities/onboard-bulk
Authorization: Bearer <token>
X-Tenant-Id: <tenant-uuid>

{
  "providerId": "tenant-1:provider-1",
  "cqcLocationIds": [
    "1-111111111",
    "1-222222222",
    "1-333333333",
    "1-444444444",
    "1-555555555"
  ],
  "autoSyncReports": true  // Optional: auto-trigger report scraping
}
```

**Response:**
```json
{
  "summary": {
    "total": 5,
    "succeeded": 5,
    "failed": 0
  },
  "results": [
    {
      "cqcLocationId": "1-111111111",
      "success": true,
      "facility": {
        "id": "tenant-1:facility-1",
        "facilityName": "Care Home A",
        "inspectionStatus": "INSPECTED",
        "latestRating": "Good",
        "dataSource": "CQC_API"
      },
      "isNew": true
    },
    // ... more results
  ],
  "backgroundJobsQueued": 5
}
```

### 3. Sync Latest Report (Background)

**Get the freshest inspection report from CQC website**

```bash
POST /v1/facilities/:facilityId/sync-latest-report
Authorization: Bearer <token>
X-Tenant-Id: <tenant-uuid>
```

**Response:**
```json
{
  "message": "Report sync started",
  "jobId": "job-1234567890-abc123",
  "status": "queued",
  "estimatedCompletion": "30-60 seconds"
}
```

**Check job status:**
```bash
GET /v1/background-jobs/job-1234567890-abc123
```

**Job completed response:**
```json
{
  "job": {
    "id": "job-1234567890-abc123",
    "type": "SCRAPE_LATEST_REPORT",
    "status": "COMPLETED",
    "createdAt": "2026-01-24T19:45:00.000Z",
    "completedAt": "2026-01-24T19:45:45.000Z"
  }
}
```

### 4. Create Baseline (Never-Inspected Facilities)

**Guide for facilities awaiting first inspection**

```bash
POST /v1/facilities/:facilityId/create-baseline
Authorization: Bearer <token>
X-Tenant-Id: <tenant-uuid>
```

**Response:**
```json
{
  "message": "Baseline creation guide",
  "facility": {
    "id": "tenant-1:facility-1",
    "name": "New Care Home",
    "inspectionStatus": "NEVER_INSPECTED"
  },
  "nextSteps": [
    {
      "step": 1,
      "action": "Upload core policy documents",
      "endpoint": "POST /v1/facilities/tenant-1:facility-1/evidence",
      "requiredEvidence": ["Policy", "Staff Handbook", "Risk Assessments"]
    },
    {
      "step": 2,
      "action": "Complete self-assessment mock inspection",
      "endpoint": "POST /v1/providers/tenant-1:provider-1/mock-sessions",
      "description": "Run mock inspections on key topics to establish baseline. These findings will not appear in regulatory history.",
      "recommendedTopics": ["safe-care-treatment", "staffing"]
    },
    {
      "step": 3,
      "action": "Review baseline findings and address gaps",
      "endpoint": "GET /v1/providers/tenant-1:provider-1/findings?facility=tenant-1:facility-1",
      "description": "Identify and remediate issues before first official inspection."
    }
  ],
  "guidance": {
    "message": "Since this facility has never been inspected, establish a baseline by uploading policies and completing self-assessment mock inspections.",
    "benefits": [
      "Identify compliance gaps before CQC inspection",
      "Build evidence library",
      "Train staff on inspection process",
      "Demonstrate proactive compliance"
    ]
  }
}
```

## Facility Inspection Status

Facilities have one of three inspection statuses:

| Status | Meaning | Source | Next Action |
|--------|---------|--------|-------------|
| `INSPECTED` | Has official CQC inspection history | CQC API or web scrape | Regular re-syncs to get latest reports |
| `NEVER_INSPECTED` | Registered but awaiting first inspection | CQC API (no rating) or web scrape | Create baseline via self-assessment |
| `PENDING_FIRST_INSPECTION` | Manual entry, status unknown | Manual input | Verify with CQC API sync |

## Data Sources

Facilities track TWO sync timestamps:

```typescript
{
  // CQC API sync (basic registration data)
  cqcSyncedAt: "2026-01-24T10:00:00Z",
  latestRating: "Good",
  latestRatingDate: "2024-12-01",

  // Web scraping sync (latest inspection report)
  lastReportScrapedAt: "2026-01-24T10:05:00Z",
  lastScrapedReportDate: "2025-01-15",  // May be newer than API!
  lastScrapedReportUrl: "https://www.cqc.org.uk/location/1-123456789"
}
```

**Why both?**
- **CQC API**: Real-time registration data (beds, address, service type)
- **Web scraping**: Latest published reports (may be days/weeks newer than API)

## Workflow Examples

### Example 1: Onboard 10 Facilities (Bulk)

```bash
# Step 1: Bulk onboard with auto-sync
POST /v1/facilities/onboard-bulk
{
  "providerId": "tenant-1:provider-1",
  "cqcLocationIds": ["1-111111111", "1-222222222", ...],
  "autoSyncReports": true
}

→ 10 facilities created in ~30 seconds
→ 10 background jobs queued for report scraping
→ Reports downloaded in background (30-60s each)
```

**Time saved vs manual entry:**
- Manual: ~50 minutes (5 min/facility × 10)
- Bulk API: ~30 seconds (onboarding) + background scraping
- **Result: 49 minutes saved!**

### Example 2: Never-Inspected Facility (New Registration)

```bash
# Step 1: Onboard
POST /v1/facilities/onboard
{ "cqcLocationId": "1-999999999" }

→ Response: inspectionStatus = "NEVER_INSPECTED"

# Step 2: Get baseline guide
POST /v1/facilities/tenant-1:facility-x/create-baseline

→ Returns step-by-step checklist

# Step 3: Upload policies
POST /v1/facilities/tenant-1:facility-x/evidence
{ "evidenceType": "Policy", "fileName": "Safeguarding.pdf", ... }

# Step 4: Run self-assessment
POST /v1/providers/tenant-1:provider-1/mock-sessions
{ "topicId": "safe-care-treatment", "facilityId": "tenant-1:facility-x" }

# Step 5: Review findings
GET /v1/providers/tenant-1:provider-1/findings?facility=tenant-1:facility-x

→ Facility now has baseline evidence before first CQC inspection
```

### Example 3: Re-sync Existing Facility (Get Latest Report)

```bash
# Facility was onboarded 6 months ago
# New inspection happened yesterday - need latest report

POST /v1/facilities/tenant-1:facility-1/sync-latest-report

→ Scrapes CQC website
→ Finds new report dated 2026-01-23
→ Downloads PDF
→ Updates facility.latestRating from "Good" to "Requires Improvement"
→ Stores PDF as evidence

→ Now facility has LATEST data (fresher than API)
```

## Conflict Resolution Rules

When merging CQC API data with user input:

| Field | CQC API Available | CQC API Unavailable |
|-------|-------------------|---------------------|
| **facilityName** | User input > CQC name | User input (required) |
| **address** | User input always wins | User input (required) |
| **serviceType** | CQC type > User (normalized) | User input (required) |
| **capacity** | CQC numberOfBeds > User | User input |
| **rating** | CQC rating > User | User input |

**Rationale:**
- **User knows their address better** (CQC may have old/generic address)
- **CQC knows capacity/service type better** (authoritative source)
- **User can override name** (e.g., "Main Building" vs generic CQC name)

## Technical Implementation

### Modules

```
packages/domain/src/
├── cqc-client.ts          # CQC API integration (fast, reliable)
├── cqc-scraper.ts         # Web scraping (latest reports)
├── onboarding.ts          # Onboarding orchestration
└── facility.ts            # Core facility entity

apps/api/src/
├── app.ts                 # API endpoints + background jobs
└── store.ts               # In-memory storage with inspection status
```

### Facility Record Schema

```typescript
interface FacilityRecord {
  // Identity
  id: string;
  tenantId: string;
  providerId: string;

  // Facility data
  facilityName: string;
  addressLine1: string;
  townCity: string;
  postcode: string;
  address: string;  // Computed
  cqcLocationId: string;
  serviceType: string;
  capacity?: number;

  // Integrity
  facilityHash: string;

  // Lifecycle
  createdAt: string;
  createdBy: string;
  asOf: string;

  // Onboarding metadata
  dataSource: 'CQC_API' | 'MANUAL';
  cqcSyncedAt: string | null;
  latestRating?: string;
  latestRatingDate?: string;
  inspectionStatus: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION';

  // Scraping metadata
  lastReportScrapedAt?: string | null;
  lastScrapedReportDate?: string;
  lastScrapedReportUrl?: string;
}
```

## Production Considerations

### Current Implementation (Demo/MVP)
- ✅ CQC API integration
- ✅ In-memory background job queue
- ✅ Simplified HTML parsing (regex-based)
- ✅ Immediate job processing

### Production Enhancements

1. **Robust HTML Parsing**
   ```typescript
   // Current: Regex-based (fragile)
   const ratingMatch = html.match(/rating[^>]*>(Good|Outstanding)/i);

   // Production: DOM parser (robust)
   import * as cheerio from 'cheerio';
   const $ = cheerio.load(html);
   const rating = $('.cqc-rating').text().trim();
   ```

2. **Persistent Job Queue**
   ```typescript
   // Current: In-memory array
   const backgroundJobs: BackgroundJob[] = [];

   // Production: Redis/BullMQ
   import { Queue } from 'bullmq';
   const scraperQueue = new Queue('report-scraping', { connection: redis });
   ```

3. **Rate Limiting**
   ```typescript
   // Add to scraper
   import Bottleneck from 'bottleneck';
   const limiter = new Bottleneck({
     maxConcurrent: 1,
     minTime: 2000  // 2 seconds between requests
   });
   ```

4. **Retry Logic**
   ```typescript
   // Add exponential backoff
   const maxRetries = 3;
   let attempt = 0;
   while (attempt < maxRetries) {
     try {
       return await scrapeLatestReport(cqcLocationId);
     } catch (error) {
       attempt++;
       await sleep(Math.pow(2, attempt) * 1000);
     }
   }
   ```

## Testing

All tests passing (295 tests):
```bash
pnpm test

✓ cqc-client.test.ts  (13 tests)    # CQC API integration
✓ onboarding.test.ts  (10 tests)    # Onboarding logic
✓ facility.test.ts    (8 tests)     # Facility entity
```

## Audit Trail

All onboarding operations are audited:

```typescript
// Events logged:
FACILITY_ONBOARDED    // New facility created
FACILITY_UPDATED      // Facility re-synced
REPORT_SCRAPED        // Background scrape completed
```

Query audit trail:
```bash
GET /v1/providers/:providerId/audit-trail
```

## Summary

The facility onboarding system provides:

✅ **Fast onboarding** (CQC API auto-fill)
✅ **Latest reports** (Web scraping)
✅ **Never-inspected support** (Baseline creation)
✅ **Bulk operations** (Up to 50 facilities at once)
✅ **Background processing** (Non-blocking report downloads)
✅ **Audit trail** (Full provenance tracking)
✅ **Idempotent** (Re-onboarding updates existing facilities)
✅ **Graceful fallback** (Works when CQC API is down)

**Time savings: ~95% reduction** in onboarding time vs manual entry!
