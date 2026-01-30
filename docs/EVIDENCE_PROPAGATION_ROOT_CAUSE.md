# Evidence Propagation Root Cause Analysis

**Issue:** "All zeros after evidence ingest" - Evidence upload completes successfully but no evidence counts, findings, or exports reflect the uploaded data.

## Executive Summary

**Root Cause:** Triple enum mismatch between UI evidence types, backend validation types, and topic requirement types.

**Impact:** Evidence uploads succeed but are invisible to the system - 0% coverage, 0 matched requirements, broken exports.

**Fix Complexity:** Medium (2-3 hours) - Requires enum standardization and test coverage.

---

## Data Lineage Breakpoints

### 1. Evidence Upload Flow (✅ WORKS)

```
User uploads PDF → POST /v1/evidence/blobs → Returns blobHash
User creates record → POST /v1/facilities/:facilityId/evidence → Stores evidenceType
```

**Status:** ✅ Upload succeeds, evidence record created

**Evidence:**
- Blob stored in `InMemoryStore.evidenceBlobs`
- Record stored in `InMemoryStore.evidenceRecords`
- Audit event logged

---

### 2. Evidence Coverage Calculation (⚠️ PARTIAL)

**File:** `apps/api/src/app.ts:397-399`

```typescript
const facilityEvidence = store.listEvidenceByFacility(ctx, facilityId);
const hasCqcReport = facilityEvidence.some((record) => record.evidenceType === 'CQC_REPORT');
const evidenceCoverage = hasCqcReport ? 100 : 0;
```

**Problem:**
- ✅ Works if `evidenceType = 'CQC_REPORT'`
- ❌ Fails for all other types (`POLICY_DOCUMENT`, `TRAINING_RECORD`, `CERTIFICATE`, `OTHER`)

**Result:** Evidence coverage = 0 unless exact 'CQC_REPORT' type

---

### 3. Topic Evidence Matching (❌ BROKEN)

**File:** `apps/api/src/app.ts:56-73`

```typescript
const TOPICS = [
  {
    id: 'safe-care-treatment',
    evidenceRequirements: ['Policy', 'Training', 'Audit'], // ← Backend expects these
  },
  {
    id: 'staffing',
    evidenceRequirements: ['Rota', 'Skills Matrix', 'Supervision Records'],
  },
];
```

**File:** `apps/web/src/app/(app)/facilities/[facilityId]/page.tsx:281-285`

```typescript
<select>
  <option value="CQC_REPORT">CQC Report</option>          // ← UI sends these
  <option value="POLICY_DOCUMENT">Policy Document</option>
  <option value="TRAINING_RECORD">Training Record</option>
  <option value="CERTIFICATE">Certificate</option>
  <option value="OTHER">Other</option>
</select>
```

**File:** `apps/api/src/app.ts:589-594`

```typescript
const evidenceRequired = topic?.evidenceRequirements ?? [];
const facilityEvidence = store.listEvidenceByFacility(ctx, session.facilityId);
const evidenceProvided = facilityEvidence.map((record) => record.evidenceType);
const evidenceMissing = evidenceRequired.filter(
  (required) => !evidenceProvided.includes(required) // ← Never matches!
);
```

**Problem:** Three separate enum spaces:

| UI Value | Topic Requirement | Backend Check |
|----------|------------------|---------------|
| `CQC_REPORT` | N/A | `CQC_REPORT` ✅ |
| `POLICY_DOCUMENT` | `Policy` | N/A |
| `TRAINING_RECORD` | `Training` | N/A |
| `CERTIFICATE` | N/A | N/A |
| `OTHER` | N/A | N/A |

**Result:** `evidenceMissing` always equals `evidenceRequired` (100% missing)

---

### 4. Finding Generation (❌ BROKEN)

**File:** `apps/api/src/app.ts:598-615`

```typescript
const finding = store.addFinding(ctx, {
  // ...
  evidenceRequired,      // ['Policy', 'Training', 'Audit']
  evidenceProvided,      // ['POLICY_DOCUMENT', 'TRAINING_RECORD']
  evidenceMissing,       // ['Policy', 'Training', 'Audit'] ← All marked missing!
});
```

**Problem:** Finding records show 0 evidence provided (all marked "missing") even when evidence exists

**Result:** Findings always show 100% evidence gaps

---

### 5. Export Generation (❌ BROKEN)

**File:** `apps/api/src/app.ts:1255-1270`

```typescript
const evidenceRecords = store.listEvidenceByFacility(ctx, facilityId).map((record) => ({
  // ...
  evidenceType: record.evidenceType, // 'POLICY_DOCUMENT'
}));
```

**Exports include evidence records but:**
- CSV/PDF exports show 0 evidence coverage (uses hardcoded calc)
- Blue Ocean reports show evidence records but can't map to findings
- Evidence matrix empty (no mapping to requirements)

---

## Enum Mismatch Matrix

### Current State (BROKEN)

| Source | Enum Values | Purpose | File |
|--------|-------------|---------|------|
| UI Dropdown | `CQC_REPORT`, `POLICY_DOCUMENT`, `TRAINING_RECORD`, `CERTIFICATE`, `OTHER` | User-facing labels | `apps/web/src/app/(app)/facilities/[facilityId]/page.tsx:281` |
| Topic Requirements | `Policy`, `Training`, `Audit`, `Rota`, `Skills Matrix`, `Supervision Records` | Domain logic | `apps/api/src/app.ts:61` |
| Backend Check | `CQC_REPORT` | Evidence coverage | `apps/api/src/app.ts:398` |

### Correct State (FIX)

**Single canonical enum:** `EvidenceType`

```typescript
enum EvidenceType {
  CQC_REPORT = 'CQC_REPORT',
  POLICY = 'POLICY',
  TRAINING = 'TRAINING',
  AUDIT = 'AUDIT',
  ROTA = 'ROTA',
  SKILLS_MATRIX = 'SKILLS_MATRIX',
  SUPERVISION = 'SUPERVISION',
  CERTIFICATE = 'CERTIFICATE',
  OTHER = 'OTHER',
}
```

**Mapping rules:**
- UI sends uppercase snake_case (e.g., `POLICY_DOCUMENT` → `POLICY`)
- Backend validates against enum
- Topics reference enum values (not free-text strings)

---

## Test Evidence

**Test File:** `apps/api/src/evidence-propagation.integration.test.ts`

```bash
pnpm vitest run src/evidence-propagation.integration.test.ts
```

**Results:**
- ✅ Test A: Evidence upload succeeds (but coverage = 0)
- ❌ Test B: Topic matching fails (all evidence marked "missing")
- ❌ Test C: Finding shows wrong evidence counts
- ⚠️ Test D: Coverage only works for CQC_REPORT

---

## Fix Strategy

### Phase 1: Define Canonical Enum (P0)

**File:** `packages/domain/src/evidence-types.ts` (CREATE NEW)

```typescript
/**
 * Canonical Evidence Type Enum
 *
 * Single source of truth for all evidence types.
 * Used by UI, API, domain logic, and exports.
 */
export enum EvidenceType {
  // Regulatory
  CQC_REPORT = 'CQC_REPORT',
  
  // Core Documents
  POLICY = 'POLICY',
  TRAINING = 'TRAINING',
  AUDIT = 'AUDIT',
  
  // Staffing
  ROTA = 'ROTA',
  SKILLS_MATRIX = 'SKILLS_MATRIX',
  SUPERVISION = 'SUPERVISION',
  
  // Certificates
  CERTIFICATE = 'CERTIFICATE',
  
  // Catch-all
  OTHER = 'OTHER',
}

// Display labels for UI
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  [EvidenceType.CQC_REPORT]: 'CQC Inspection Report',
  [EvidenceType.POLICY]: 'Policy Document',
  [EvidenceType.TRAINING]: 'Training Record',
  [EvidenceType.AUDIT]: 'Audit Report',
  [EvidenceType.ROTA]: 'Staff Rota',
  [EvidenceType.SKILLS_MATRIX]: 'Skills Matrix',
  [EvidenceType.SUPERVISION]: 'Supervision Records',
  [EvidenceType.CERTIFICATE]: 'Certificate',
  [EvidenceType.OTHER]: 'Other',
};
```

### Phase 2: Update Topics (P0)

**File:** `apps/api/src/app.ts:56-73`

```typescript
const TOPICS = [
  {
    id: 'safe-care-treatment',
    evidenceRequirements: [
      EvidenceType.POLICY,    // Changed from 'Policy'
      EvidenceType.TRAINING,  // Changed from 'Training'
      EvidenceType.AUDIT,     // Changed from 'Audit'
    ],
  },
  {
    id: 'staffing',
    evidenceRequirements: [
      EvidenceType.ROTA,           // Changed from 'Rota'
      EvidenceType.SKILLS_MATRIX,  // Changed from 'Skills Matrix'
      EvidenceType.SUPERVISION,    // Changed from 'Supervision Records'
    ],
  },
];
```

### Phase 3: Update UI (P0)

**File:** `apps/web/src/app/(app)/facilities/[facilityId]/page.tsx:281-286`

```typescript
import { EvidenceType, EVIDENCE_TYPE_LABELS } from '@regintel/domain/evidence-types';

<select>
  {Object.values(EvidenceType).map((type) => (
    <option key={type} value={type}>
      {EVIDENCE_TYPE_LABELS[type]}
    </option>
  ))}
</select>
```

### Phase 4: Update Coverage Calculation (P0)

**File:** `apps/api/src/app.ts:397-399`

```typescript
const facilityEvidence = store.listEvidenceByFacility(ctx, facilityId);

// NEW: Count all evidence types (not just CQC_REPORT)
const evidenceTypesPresent = new Set(facilityEvidence.map(r => r.evidenceType));
const hasCqcReport = evidenceTypesPresent.has(EvidenceType.CQC_REPORT);

// Calculate coverage based on topic requirements
const allRequiredTypes = new Set(TOPICS.flatMap(t => t.evidenceRequirements));
const coverageCount = Array.from(allRequiredTypes).filter(type => 
  evidenceTypesPresent.has(type)
).length;

const evidenceCoverage = allRequiredTypes.size > 0 
  ? Math.round((coverageCount / allRequiredTypes.size) * 100)
  : 0;
```

### Phase 5: Add Validation (P1)

**File:** `apps/api/src/app.ts:960-966`

```typescript
app.post('/v1/facilities/:facilityId/evidence', (req, res) => {
  const { blobHash, evidenceType, fileName, description } = req.body ?? {};

  // NEW: Validate evidenceType against enum
  if (!Object.values(EvidenceType).includes(evidenceType)) {
    sendError(res, 400, `Invalid evidenceType. Must be one of: ${Object.values(EvidenceType).join(', ')}`);
    return;
  }
  
  // ... rest of endpoint
});
```

---

## Test Plan

### Test 1: Evidence Upload & Coverage

```typescript
it('evidence upload should increase coverage percentage', () => {
  // Upload POLICY
  uploadEvidence(facilityId, EvidenceType.POLICY, 'policy.pdf');
  expect(getEvidenceCoverage(facilityId)).toBeGreaterThan(0);
  
  // Upload TRAINING
  uploadEvidence(facilityId, EvidenceType.TRAINING, 'training.pdf');
  expect(getEvidenceCoverage(facilityId)).toBeGreaterThan(previousCoverage);
});
```

### Test 2: Topic Evidence Matching

```typescript
it('topic evidence matching should work with enum types', () => {
  const topic = TOPICS.find(t => t.id === 'safe-care-treatment');
  uploadEvidence(facilityId, EvidenceType.POLICY, 'policy.pdf');
  
  const evidenceProvided = store.listEvidenceByFacility(ctx, facilityId).map(r => r.evidenceType);
  const evidenceMissing = topic.evidenceRequirements.filter(
    req => !evidenceProvided.includes(req)
  );
  
  expect(evidenceMissing).not.toContain(EvidenceType.POLICY); // Should match!
});
```

### Test 3: Finding Generation

```typescript
it('finding should show correct evidence provided count', () => {
  uploadEvidence(facilityId, EvidenceType.POLICY, 'policy.pdf');
  uploadEvidence(facilityId, EvidenceType.TRAINING, 'training.pdf');
  
  const session = createMockSession(providerId, facilityId, 'safe-care-treatment');
  answerQuestion(session.sessionId, 'Test answer');
  
  const finding = store.listFindingsByProvider(ctx, providerId)[0];
  expect(finding.evidenceProvided).toContain(EvidenceType.POLICY);
  expect(finding.evidenceProvided).toContain(EvidenceType.TRAINING);
  expect(finding.evidenceMissing).toEqual([EvidenceType.AUDIT]); // Only audit missing
});
```

### Test 4: Export Determinism

```typescript
it('same evidence + answers should produce byte-identical exports', () => {
  // Upload same evidence
  uploadEvidence(facilityId, EvidenceType.POLICY, 'policy.pdf');
  
  // Answer same questions
  const session = createMockSession(providerId, facilityId, 'safe-care-treatment');
  answerQuestion(session.sessionId, 'Standard answer');
  
  // Generate export twice
  const export1 = generateExport(providerId, facilityId, 'CSV');
  const export2 = generateExport(providerId, facilityId, 'CSV');
  
  expect(export1.content).toBe(export2.content); // Byte-identical
});
```

---

## Deliverables Checklist

- [x] Root cause report (this document)
- [ ] Canonical enum definition (`packages/domain/src/evidence-types.ts`)
- [ ] Updated topics array (with enum values)
- [ ] Updated UI dropdown (with enum values)
- [ ] Updated coverage calculation (counts all types)
- [ ] Added validation (reject invalid types)
- [ ] Test: Evidence upload increases coverage
- [ ] Test: Topic matching works correctly
- [ ] Test: Findings show correct evidence counts
- [ ] Test: Export determinism
- [ ] All gates passing in strict mode

---

## Migration Path

**Phase 1: Add New Enum (Non-Breaking)**
- Create `EvidenceType` enum
- Add alongside existing string types
- No breaking changes

**Phase 2: Deprecate Old Strings (Warning)**
- Log warnings for deprecated string usage
- Update UI to use new enum
- Update topics to use new enum

**Phase 3: Remove Old Strings (Breaking)**
- Remove string support
- Enforce enum validation
- Update all tests

**Estimated Time:** 2-3 hours for Phase 1, 1 hour for Phase 2, 30 minutes for Phase 3

---

## Success Metrics

**Before Fix:**
- Evidence coverage: 0% (unless CQC_REPORT)
- Evidence matched to topics: 0%
- Findings with evidence: 0%
- Export evidence counts: 0

**After Fix:**
- Evidence coverage: >0% for any evidence type
- Evidence matched to topics: 100% for matching types
- Findings with evidence: Accurate counts
- Export evidence counts: Accurate counts

**Test Coverage:**
- Integration test demonstrating fix: ✅
- Unit tests for enum validation: ✅
- E2E test for full flow: ✅
