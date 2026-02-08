# RegIntel V2 Pipeline Testing Guide

## Overview

This document describes the 8 comprehensive pipeline tests that validate the entire RegIntel V2 system from authentication through export.

## Quick Start

```bash
# 1. Start the API server
pnpm api:dev

# 2. Run pipeline tests
npx tsx tests/pipelines/run-pipeline-tests.ts

# 3. Run with verbose output
VERBOSE=true npx tsx tests/pipelines/run-pipeline-tests.ts
```

## Pipeline Coverage

| # | Pipeline | Description | Tests |
|---|----------|-------------|-------|
| 1 | **Authentication & Tenant Setup** | Health check, auth validation, tenant isolation | 4 |
| 2 | **Provider & Facility Onboarding** | Create provider, facility CRUD, bulk import | 6 |
| 3 | **Evidence Upload & Processing** | Blob upload, malware scan, download | 4 |
| 4 | **Mock Inspection Session** | Create, Q&A, complete session | 5 |
| 5 | **Background Jobs** | Job tenant isolation, queue health | 2 |
| 6 | **AI Safety & Containment** | Validation rules, hallucination blocking | 2 |
| 7 | **Exports & Reporting** | CSV export, download ownership | 2 |
| 8 | **Audit Logging** | Trail creation, hash chain integrity | 2 |

**Total: 27 tests**

## Test Files

```
tests/pipelines/
├── fixtures.ts              # Test data and helpers
├── run-pipeline-tests.ts    # Main test runner
└── TESTING-PIPELINE-PROMPT.md   # This documentation
```

## Fixtures Included

### Tenants
- `TENANTS.ORG_A` - Sunrise Care Homes Ltd
- `TENANTS.ORG_B` - Golden Years Healthcare (for cross-tenant tests)

### Users
- `USERS.FOUNDER` - Has FOUNDER role, can override tenant
- `USERS.PROVIDER_A` - Provider in Org A
- `USERS.PROVIDER_B` - Provider in Org B (for isolation tests)

### Facilities
- `FACILITIES.SUNRISE_MAIN` - Primary test facility
- `FACILITIES.SUNRISE_ANNEX` - Secondary facility
- `BULK_IMPORT_FACILITIES` - 3 facilities for bulk import tests

### Evidence
- `EVIDENCE.MEDICATION_POLICY` - Valid PDF policy document
- `EVIDENCE.TRAINING_RECORD` - Excel training matrix
- `EVIDENCE.INCIDENT_LOG` - Incident report
- `EVIDENCE.EICAR_TEST` - Malware test file

### AI Test Inputs
- `AI_TEST_INPUTS.VALID_ANALYSIS` - Should pass validation
- `AI_TEST_INPUTS.HALLUCINATED_REGULATION` - Reg 25 (invalid)
- `AI_TEST_INPUTS.COMPLIANCE_ASSERTION` - "Provider is compliant"
- `AI_TEST_INPUTS.RATING_PREDICTION` - "Would receive Good"
- `AI_TEST_INPUTS.INSPECTION_GUARANTEE` - "Will ensure you pass"
- `AI_TEST_INPUTS.PROMPT_INJECTION` - Injection attempt

## Helper Functions

```typescript
// Create tenant context
const ctx = createTestContext(TENANTS.ORG_A, USERS.FOUNDER);

// Generate auth headers
const headers = generateAuthHeader(USERS.FOUNDER);

// Generate headers with tenant override
const headers = generateAuthHeaderWithTenant(USERS.FOUNDER, TENANTS.ORG_B.id);

// Create EICAR test file
const malwareTestFile = createEicarTestFile();

// Create minimal PDF
const pdf = createMinimalPdf('Test Document');

// Wait for async condition
await waitFor(() => checkJobComplete(), 10000);

// Generate unique ID
const id = uniqueId('test-facility');
```

## Security Tests

### Cross-Tenant Isolation
- Provider in Org A cannot access Org B data
- Blob download requires EvidenceRecord ownership
- Export download requires tenant ownership
- Background jobs filtered by tenant

### AI Safety
- Hallucinated regulations blocked (only Reg 9-20)
- Compliance assertions blocked
- Rating predictions blocked
- Inspection guarantees blocked
- Prompt injection attempts blocked

## Expected Output

```
═══════════════════════════════════════════════════════════════
           REGINTEL V2 PIPELINE TEST RUNNER
═══════════════════════════════════════════════════════════════

📋 PIPELINE: 1. Authentication & Tenant Setup

  ✅ Health check responds (15ms)
  ✅ Unauthenticated request rejected (8ms)
  ✅ Authenticated request succeeds (12ms)
  ✅ Tenant context isolated (10ms)

📋 PIPELINE: 2. Provider & Facility Onboarding

  ✅ Seed demo provider (25ms)
  ✅ List providers (8ms)
  ✅ Onboard single facility (45ms)
  ...

═══════════════════════════════════════════════════════════════
                       TEST SUMMARY
═══════════════════════════════════════════════════════════════

┌──────────────────────────────┬──────────┬──────────┬──────────┐
│ Pipeline                     │ Passed   │ Failed   │ Skipped  │
├──────────────────────────────┼──────────┼──────────┼──────────┤
│ 1. Authentication & Tenant   │ 4        │ 0        │ 0        │
│ 2. Provider & Facility       │ 6        │ 0        │ 0        │
│ 3. Evidence Upload           │ 4        │ 0        │ 0        │
│ 4. Mock Inspection           │ 5        │ 0        │ 0        │
│ 5. Background Jobs           │ 2        │ 0        │ 0        │
│ 6. AI Safety                 │ 2        │ 0        │ 0        │
│ 7. Exports & Reporting       │ 2        │ 0        │ 0        │
│ 8. Audit Logging             │ 2        │ 0        │ 0        │
├──────────────────────────────┼──────────┼──────────┼──────────┤
│ TOTAL                        │ 27       │ 0        │ 0        │
└──────────────────────────────┴──────────┴──────────┴──────────┘

✅ ALL TESTS PASSED (27/27)
⏱️  Duration: 3.45s
```

## Environment Variables

```bash
# API endpoint (default: http://localhost:3001)
API_BASE_URL=http://localhost:3001

# Enable verbose logging
VERBOSE=true

# Auth tokens (defaults provided for dev)
FOUNDER_TOKEN=demo-founder-token-12345
PROVIDER_TOKEN=demo-provider-token-12345
```

## CI Integration

Add to `.github/workflows/ci.yml`:

```yaml
  pipeline-tests:
    runs-on: ubuntu-latest
    needs: [tests]
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: regintel_test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm db:migrate
      - run: pnpm api:dev &
      - run: sleep 5
      - run: npx tsx tests/pipelines/run-pipeline-tests.ts
```

## Troubleshooting

### API not reachable
```
❌ API not reachable at http://localhost:3001
   Please start the API server with: pnpm api:dev
```
**Solution:** Start the API server first.

### Auth failures
```
❌ Authenticated request succeeds
   Expected status 200, got 401
```
**Solution:** Check `FOUNDER_TOKEN` and `PROVIDER_TOKEN` match `.env` file.

### Cross-tenant test issues
```
❌ Tenant context isolated
   Should not see org B data
```
**Solution:** Verify RLS policies are enabled in database.
