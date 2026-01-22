# RegIntel Phase 8: Integration Slice

**Status**: Planning
**Version**: 1.0
**Date**: 2026-01-22

## Overview

Phase 8 implements the **minimal vertical slice** connecting the domain layer (Phases 0-7) to:
- PostgreSQL database with Row-Level Security (RLS)
- REST API endpoints
- Audit log persistence

**Critical Constraint**: This phase implements ONLY the minimal integration required to prove end-to-end flows. No UI, no advanced features, no scope creep.

## Scope: What Phase 8 MUST Include

### 1. Minimal Vertical Slice: Mock Inspection Flow

The smallest end-to-end flow that exercises all layers:

```
POST /api/v1/snapshots
  → Creates ProviderContextSnapshot in DB
  → Returns snapshot ID

POST /api/v1/mock-sessions
  → Creates MockInspectionSession in DB
  → Returns session ID

POST /api/v1/mock-sessions/:id/questions
  → Records SessionEvent
  → Enforces follow-up limits
  → Appends to audit log

POST /api/v1/mock-sessions/:id/findings
  → Creates DraftFinding
  → Records in session state

POST /api/v1/mock-sessions/:id/complete
  → Finalizes session
  → Publishes Finding records (origin=SYSTEM_MOCK)
  → Verifies audit chain integrity

GET /api/v1/reports/confidence
  → Reads snapshot + findings + actions
  → Generates InspectionConfidenceReport (Phase 7 pure function)
  → Returns JSON
```

### 2. Evidence Management Flow

```
POST /api/v1/evidence/blobs
  → Content-addressed storage (SHA-256 hash as ID)
  → Stores EvidenceBlob (immutable)
  → Returns content hash

POST /api/v1/evidence/records
  → Creates EvidenceRecord (metadata)
  → Links to EvidenceBlob via content hash
  → Tenant-scoped
```

### 3. Audit Verification Flow

```
GET /api/v1/audit/verify-chain
  → Reads entire audit log for tenant
  → Verifies hash chain integrity (Phase 0)
  → Returns verification result + any breaks
```

## API Endpoints

All endpoints require `Authorization: Bearer <JWT>` with `tenantId` claim.

### Snapshots

#### `POST /api/v1/snapshots`

**Request**:
```json
{
  "regulatoryState": "NEW_PROVIDER",
  "metadata": {
    "providerName": "Care Home Example",
    "serviceTypes": ["residential"]
  },
  "enabledDomains": ["CQC"],
  "activeRegulationIds": ["reg-cqc-2023-v1"],
  "activePolicyIds": ["policy-safeguarding-v2"]
}
```

**Response** (201):
```json
{
  "id": "snap-uuid-123",
  "tenantId": "tenant-abc",
  "asOf": "2026-01-22T10:00:00Z",
  "snapshotHash": "a1b2c3...",
  "createdAt": "2026-01-22T10:00:01Z"
}
```

**Constraints**:
- `id` = UUIDv4
- `snapshotHash` = deterministic hash of snapshot content (Phase 1)
- Immutable after creation

#### `GET /api/v1/snapshots/:id`

**Response** (200):
```json
{
  "id": "snap-uuid-123",
  "tenantId": "tenant-abc",
  "asOf": "2026-01-22T10:00:00Z",
  "regulatoryState": "NEW_PROVIDER",
  "metadata": { ... },
  "enabledDomains": ["CQC"],
  "activeRegulationIds": ["reg-cqc-2023-v1"],
  "activePolicyIds": ["policy-safeguarding-v2"],
  "snapshotHash": "a1b2c3...",
  "createdAt": "2026-01-22T10:00:01Z"
}
```

---

### Mock Inspection Sessions

#### `POST /api/v1/mock-sessions`

**Request**:
```json
{
  "contextSnapshotId": "snap-uuid-123",
  "logicProfileId": "profile-cqc-standard-v1",
  "maxFollowUpsPerTopic": 3,
  "maxTotalQuestions": 12
}
```

**Response** (201):
```json
{
  "id": "session-uuid-456",
  "tenantId": "tenant-abc",
  "contextSnapshotId": "snap-uuid-123",
  "logicProfileId": "profile-cqc-standard-v1",
  "status": "IN_PROGRESS",
  "totalQuestionsAsked": 0,
  "totalFindingsDrafted": 0,
  "sessionHash": "d4e5f6...",
  "startedAt": "2026-01-22T10:05:00Z"
}
```

**Constraints**:
- `id` = UUIDv4
- `status` = "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
- `sessionHash` = hash of session configuration (Phase 5)
- Appends to audit log

#### `GET /api/v1/mock-sessions/:id`

**Response** (200):
```json
{
  "id": "session-uuid-456",
  "tenantId": "tenant-abc",
  "status": "IN_PROGRESS",
  "contextSnapshotId": "snap-uuid-123",
  "logicProfileId": "profile-cqc-standard-v1",
  "totalQuestionsAsked": 3,
  "totalFindingsDrafted": 1,
  "events": [
    {
      "eventId": "evt-1",
      "eventType": "QUESTION_ASKED",
      "topicId": "topic-safeguarding",
      "timestamp": "2026-01-22T10:06:00Z"
    }
  ],
  "draftFindings": [ ... ],
  "startedAt": "2026-01-22T10:05:00Z",
  "completedAt": null
}
```

#### `POST /api/v1/mock-sessions/:id/questions`

**Request**:
```json
{
  "topicId": "topic-safeguarding",
  "question": "How do you document safeguarding incidents?",
  "isFollowUp": false
}
```

**Response** (201):
```json
{
  "eventId": "evt-uuid-789",
  "eventType": "QUESTION_ASKED",
  "topicId": "topic-safeguarding",
  "question": "How do you document safeguarding incidents?",
  "isFollowUp": false,
  "timestamp": "2026-01-22T10:06:00Z",
  "totalQuestionsAsked": 1
}
```

**Constraints**:
- Enforces `maxFollowUpsPerTopic` limit (Phase 5)
- Enforces `maxTotalQuestions` limit
- Returns 400 if limits exceeded
- Appends SessionEvent to audit log

#### `POST /api/v1/mock-sessions/:id/answers`

**Request**:
```json
{
  "eventId": "evt-uuid-789",
  "providerResponse": "We use a digital incident log with timestamps..."
}
```

**Response** (201):
```json
{
  "eventId": "evt-uuid-790",
  "eventType": "ANSWER_RECEIVED",
  "relatedQuestionEventId": "evt-uuid-789",
  "timestamp": "2026-01-22T10:07:00Z"
}
```

#### `POST /api/v1/mock-sessions/:id/findings`

**Request**:
```json
{
  "topicId": "topic-safeguarding",
  "title": "Incomplete safeguarding documentation",
  "description": "Digital log lacks required timestamps",
  "severity": "MEDIUM",
  "impactScore": 60,
  "likelihoodScore": 70,
  "regulationId": "reg-cqc-2023-v1",
  "regulationSectionId": "section-13-safeguarding"
}
```

**Response** (201):
```json
{
  "draftFindingId": "draft-uuid-111",
  "sessionId": "session-uuid-456",
  "topicId": "topic-safeguarding",
  "title": "Incomplete safeguarding documentation",
  "severity": "MEDIUM",
  "compositeRiskScore": 42,
  "createdAt": "2026-01-22T10:08:00Z"
}
```

**Constraints**:
- `compositeRiskScore` = computed from impact/likelihood + PRS multiplier (Phase 4)
- Remains in session until published
- Appends to audit log

#### `POST /api/v1/mock-sessions/:id/complete`

**Request**:
```json
{
  "publishFindings": true
}
```

**Response** (200):
```json
{
  "sessionId": "session-uuid-456",
  "status": "COMPLETED",
  "completedAt": "2026-01-22T10:10:00Z",
  "publishedFindings": ["finding-uuid-222"],
  "auditChainVerified": true
}
```

**Constraints**:
- If `publishFindings=true`, creates Finding records with `origin=SYSTEM_MOCK`, `reportingDomain=SYSTEM_MOCK`
- Sets session `status=COMPLETED`
- Verifies audit chain integrity before completing
- Returns 500 if chain verification fails

---

### Evidence Management

#### `POST /api/v1/evidence/blobs`

**Request** (multipart/form-data):
```
file: <binary data>
```

**Response** (201):
```json
{
  "contentHash": "sha256:a1b2c3d4e5f6...",
  "contentType": "application/pdf",
  "sizeBytes": 102400,
  "uploadedAt": "2026-01-22T10:15:00Z"
}
```

**Constraints**:
- `contentHash` = SHA-256 of file content
- Immutable (content-addressed storage)
- Deduplication: if hash exists, return existing record
- Max file size: 50MB

#### `POST /api/v1/evidence/records`

**Request**:
```json
{
  "contentHash": "sha256:a1b2c3d4e5f6...",
  "evidenceType": "POLICY_DOCUMENT",
  "title": "Safeguarding Policy v3.2",
  "description": "Updated safeguarding policy",
  "collectedAt": "2026-01-15T09:00:00Z",
  "metadata": {
    "documentVersion": "3.2",
    "approvedBy": "Jane Smith"
  }
}
```

**Response** (201):
```json
{
  "id": "evidence-uuid-333",
  "tenantId": "tenant-abc",
  "contentHash": "sha256:a1b2c3d4e5f6...",
  "evidenceType": "POLICY_DOCUMENT",
  "title": "Safeguarding Policy v3.2",
  "createdAt": "2026-01-22T10:16:00Z",
  "createdBy": "user-xyz"
}
```

**Constraints**:
- References EvidenceBlob via `contentHash`
- `evidenceType` must be from Topic Catalog enum (Phase 6)
- Tenant-scoped
- Appends to audit log

#### `GET /api/v1/evidence/records/:id`

**Response** (200):
```json
{
  "id": "evidence-uuid-333",
  "tenantId": "tenant-abc",
  "contentHash": "sha256:a1b2c3d4e5f6...",
  "evidenceType": "POLICY_DOCUMENT",
  "title": "Safeguarding Policy v3.2",
  "description": "Updated safeguarding policy",
  "collectedAt": "2026-01-15T09:00:00Z",
  "metadata": { ... },
  "createdAt": "2026-01-22T10:16:00Z",
  "createdBy": "user-xyz",
  "blobUrl": "/api/v1/evidence/blobs/sha256:a1b2c3d4e5f6..."
}
```

---

### Reports (Phase 7 Pure Outputs)

#### `GET /api/v1/reports/confidence?snapshotId=snap-uuid-123`

**Query Parameters**:
- `snapshotId` (required): ProviderContextSnapshot ID

**Response** (200):
```json
{
  "tenantId": "tenant-abc",
  "domain": "CQC",
  "generatedAt": "2026-01-22T10:20:00Z",
  "asOfSnapshot": "snap-uuid-123",
  "overallConfidenceScore": 72,
  "findingsSummary": {
    "critical": 0,
    "high": 2,
    "medium": 5,
    "low": 3,
    "total": 10
  },
  "remediationSummary": {
    "openActions": 4,
    "inProgressActions": 2,
    "completedActions": 1,
    "verifiedActions": 3
  },
  "topRiskAreas": [ ... ],
  "readinessIndicators": { ... }
}
```

**Constraints**:
- Pure function from Phase 7 `generateInspectionConfidenceReport`
- Reads snapshot + findings + actions from DB
- NO business logic in API layer
- Filters by tenant automatically (RLS)

#### `GET /api/v1/reports/risk-register?snapshotId=snap-uuid-123`

**Response** (200):
```json
{
  "tenantId": "tenant-abc",
  "domain": "CQC",
  "generatedAt": "2026-01-22T10:21:00Z",
  "asOfSnapshot": "snap-uuid-123",
  "entries": [
    {
      "findingId": "finding-uuid-222",
      "regulationId": "reg-cqc-2023-v1",
      "regulationSectionId": "section-13-safeguarding",
      "title": "Incomplete safeguarding documentation",
      "severity": "MEDIUM",
      "compositeRiskScore": 42,
      "identifiedAt": "2026-01-22T10:08:00Z",
      "actionId": null,
      "actionStatus": null,
      "daysSinceIdentified": 0
    }
  ],
  "summary": {
    "totalOpenFindings": 1,
    "criticalCount": 0,
    "highCount": 0,
    "mediumCount": 1,
    "lowCount": 0
  }
}
```

**Constraints**:
- Pure function from Phase 7 `generateRiskRegister`
- Sorted by `compositeRiskScore` descending

---

### Audit Verification

#### `GET /api/v1/audit/verify-chain`

**Response** (200):
```json
{
  "tenantId": "tenant-abc",
  "totalEvents": 47,
  "chainVerified": true,
  "lastEventHash": "f1g2h3i4...",
  "lastEventTimestamp": "2026-01-22T10:22:00Z",
  "breaks": []
}
```

**Response** (500 if chain broken):
```json
{
  "tenantId": "tenant-abc",
  "totalEvents": 47,
  "chainVerified": false,
  "breaks": [
    {
      "eventId": "evt-uuid-999",
      "expectedPreviousHash": "a1b2c3...",
      "actualPreviousHash": "x1y2z3...",
      "detectedAt": 23
    }
  ]
}
```

**Constraints**:
- Uses Phase 0 `verifyChain` function
- Reads all AuditEvent records for tenant (ordered by sequence)
- Returns 500 if ANY break detected (fail-safe)

---

## Database Schema

All tables use PostgreSQL with Row-Level Security (RLS) enabled.

### Common Patterns

1. **Tenant Isolation**: All tables have `tenant_id UUID NOT NULL` with RLS policies
2. **Timestamps**: Use `TIMESTAMPTZ` for all timestamp fields
3. **Primary Keys**: Use UUIDs with `gen_random_uuid()` default
4. **Immutability**: No `updated_at` columns on immutable entities

---

### 1. `provider_context_snapshots`

**Purpose**: Immutable provider state snapshots (Phase 1)

```sql
CREATE TABLE provider_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  regulatory_state TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  enabled_domains TEXT[] NOT NULL,
  active_regulation_ids TEXT[] NOT NULL,
  active_policy_ids TEXT[] NOT NULL,
  snapshot_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,

  CONSTRAINT pcs_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX idx_pcs_tenant_id ON provider_context_snapshots(tenant_id);
CREATE INDEX idx_pcs_as_of ON provider_context_snapshots(tenant_id, as_of);
CREATE UNIQUE INDEX idx_pcs_snapshot_hash ON provider_context_snapshots(tenant_id, snapshot_hash);

-- RLS Policy
ALTER TABLE provider_context_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_pcs ON provider_context_snapshots
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Constraints**:
- `regulatory_state` ∈ {NEW_PROVIDER, ESTABLISHED, RATING_GOOD, RATING_REQUIRES_IMPROVEMENT, RATING_INADEQUATE, SPECIAL_MEASURES, ENFORCEMENT_ACTION}
- `snapshot_hash` = deterministic SHA-256 hash (Phase 1)
- Immutable after creation (no updates)

---

### 2. `mock_inspection_sessions`

**Purpose**: Stateful mock inspection sessions (Phase 5)

```sql
CREATE TABLE mock_inspection_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  domain TEXT NOT NULL,
  context_snapshot_id UUID NOT NULL REFERENCES provider_context_snapshots(id),
  logic_profile_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  total_questions_asked INT NOT NULL DEFAULT 0,
  total_findings_drafted INT NOT NULL DEFAULT 0,
  max_followups_per_topic INT NOT NULL,
  max_total_questions INT NOT NULL,
  session_hash TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,

  CONSTRAINT mis_tenant_id_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT mis_status_check CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED'))
);

CREATE INDEX idx_mis_tenant_id ON mock_inspection_sessions(tenant_id);
CREATE INDEX idx_mis_status ON mock_inspection_sessions(tenant_id, status);
CREATE INDEX idx_mis_context_snapshot ON mock_inspection_sessions(context_snapshot_id);

-- RLS Policy
ALTER TABLE mock_inspection_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_mis ON mock_inspection_sessions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Constraints**:
- `domain` ∈ {CQC, IMMIGRATION}
- `status` = "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
- `session_hash` = deterministic hash (Phase 5)
- `completed_at` must be NULL if status=IN_PROGRESS

---

### 3. `session_events`

**Purpose**: Append-only log of session interactions (Phase 5)

```sql
CREATE TABLE session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES mock_inspection_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  topic_id TEXT,
  question TEXT,
  provider_response TEXT,
  is_follow_up BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT se_tenant_id_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT se_event_type_check CHECK (event_type IN (
    'SESSION_STARTED',
    'QUESTION_ASKED',
    'ANSWER_RECEIVED',
    'FINDING_DRAFTED',
    'SESSION_COMPLETED'
  ))
);

CREATE INDEX idx_se_session_id ON session_events(session_id, timestamp);
CREATE INDEX idx_se_tenant_id ON session_events(tenant_id);

-- RLS Policy
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_se ON session_events
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Constraints**:
- Immutable (append-only)
- `event_type` bounded enum (no free-text)
- `topic_id` must reference Topic Catalog (Phase 6)

---

### 4. `draft_findings`

**Purpose**: Findings in progress during mock inspection (Phase 5)

```sql
CREATE TABLE draft_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES mock_inspection_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  impact_score INT NOT NULL,
  likelihood_score INT NOT NULL,
  composite_risk_score INT NOT NULL,
  regulation_id TEXT NOT NULL,
  regulation_section_id TEXT NOT NULL,
  evidence_gaps TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT df_tenant_id_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT df_severity_check CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),
  CONSTRAINT df_impact_score_check CHECK (impact_score BETWEEN 0 AND 100),
  CONSTRAINT df_likelihood_score_check CHECK (likelihood_score BETWEEN 0 AND 100),
  CONSTRAINT df_composite_risk_score_check CHECK (composite_risk_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_df_session_id ON draft_findings(session_id);
CREATE INDEX idx_df_tenant_id ON draft_findings(tenant_id);

-- RLS Policy
ALTER TABLE draft_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_df ON draft_findings
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Constraints**:
- Mutable during session (can be edited)
- Deleted or promoted to `findings` when session completes
- `severity` bounded enum

---

### 5. `findings`

**Purpose**: Published inspection findings (Phase 1)

```sql
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  domain TEXT NOT NULL,
  context_snapshot_id UUID NOT NULL REFERENCES provider_context_snapshots(id),
  origin TEXT NOT NULL,
  reporting_domain TEXT NOT NULL,
  regulation_id TEXT NOT NULL,
  regulation_section_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  impact_score INT NOT NULL,
  likelihood_score INT NOT NULL,
  composite_risk_score INT NOT NULL,
  evidence_ids TEXT[] DEFAULT '{}',
  identified_at TIMESTAMPTZ NOT NULL,
  identified_by TEXT NOT NULL,
  finding_hash TEXT NOT NULL,

  CONSTRAINT f_tenant_id_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT f_origin_check CHECK (origin IN ('SYSTEM_MOCK', 'EXTERNAL_AUDIT', 'SELF_ASSESSMENT')),
  CONSTRAINT f_reporting_domain_check CHECK (reporting_domain IN ('SYSTEM_MOCK', 'REGULATORY_HISTORY')),
  CONSTRAINT f_mock_separation_check CHECK (
    (origin = 'SYSTEM_MOCK' AND reporting_domain = 'SYSTEM_MOCK') OR
    (origin != 'SYSTEM_MOCK' AND reporting_domain = 'REGULATORY_HISTORY')
  ),
  CONSTRAINT f_severity_check CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),
  CONSTRAINT f_impact_score_check CHECK (impact_score BETWEEN 0 AND 100),
  CONSTRAINT f_likelihood_score_check CHECK (likelihood_score BETWEEN 0 AND 100),
  CONSTRAINT f_composite_risk_score_check CHECK (composite_risk_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_f_tenant_id ON findings(tenant_id);
CREATE INDEX idx_f_domain ON findings(tenant_id, domain);
CREATE INDEX idx_f_origin ON findings(tenant_id, origin);
CREATE INDEX idx_f_reporting_domain ON findings(tenant_id, reporting_domain);
CREATE INDEX idx_f_context_snapshot ON findings(context_snapshot_id);
CREATE INDEX idx_f_severity ON findings(tenant_id, severity, composite_risk_score DESC);

-- RLS Policy
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_f ON findings
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Constraints**:
- **CRITICAL**: `f_mock_separation_check` enforces Phase 1 invariant
- `origin=SYSTEM_MOCK` MUST have `reporting_domain=SYSTEM_MOCK`
- `finding_hash` = deterministic SHA-256 hash (Phase 1)
- Immutable after creation

---

### 6. `evidence_blobs`

**Purpose**: Content-addressed immutable evidence storage (Phase 1)

```sql
CREATE TABLE evidence_blobs (
  content_hash TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT eb_content_hash_check CHECK (content_hash LIKE 'sha256:%')
);

CREATE INDEX idx_eb_uploaded_at ON evidence_blobs(uploaded_at);
```

**Constraints**:
- `content_hash` = SHA-256 of blob content (PRIMARY KEY)
- NO `tenant_id` (content-addressed, shared across tenants for deduplication)
- Immutable (no updates)
- `storage_path` = S3/filesystem path

---

### 7. `evidence_records`

**Purpose**: Tenant-scoped evidence metadata (Phase 1)

```sql
CREATE TABLE evidence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  content_hash TEXT NOT NULL REFERENCES evidence_blobs(content_hash),
  evidence_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  collected_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,

  CONSTRAINT er_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX idx_er_tenant_id ON evidence_records(tenant_id);
CREATE INDEX idx_er_content_hash ON evidence_records(content_hash);
CREATE INDEX idx_er_evidence_type ON evidence_records(tenant_id, evidence_type);

-- RLS Policy
ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_er ON evidence_records
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Constraints**:
- `evidence_type` must match Topic Catalog enum (Phase 6)
- References `evidence_blobs` via `content_hash`
- Immutable after creation

---

### 8. `audit_events`

**Purpose**: Hash-chained immutable audit log (Phase 0)

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ae_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_ae_event_hash ON audit_events(tenant_id, event_hash);
CREATE INDEX idx_ae_tenant_sequence ON audit_events(tenant_id, timestamp);
CREATE INDEX idx_ae_entity ON audit_events(tenant_id, entity_type, entity_id);

-- RLS Policy
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ae ON audit_events
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Constraints**:
- Append-only (no updates/deletes)
- `payload_hash` = SHA-256(JSON.stringify(payload))
- `event_hash` = SHA-256(payload_hash + previous_event_hash)
- First event in chain has `previous_event_hash = NULL`
- Chain verification uses Phase 0 `verifyChain` function

---

## Row-Level Security (RLS) Enforcement

### Tenant Context Setting

All API requests must set `app.tenant_id` before executing queries:

```typescript
// In API middleware
await db.query('SET LOCAL app.tenant_id = $1', [jwtPayload.tenantId]);
```

### RLS Policy Pattern

Every tenant-scoped table has an identical policy:

```sql
CREATE POLICY tenant_isolation_<table> ON <table>
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Effect**:
- SELECT: Returns only rows where `tenant_id` matches session
- INSERT: Fails if `tenant_id` doesn't match session
- UPDATE: Fails if `tenant_id` doesn't match session
- DELETE: Fails if `tenant_id` doesn't match session

### Application-Level Enforcement

API layer MUST:
1. Extract `tenantId` from JWT
2. Set `app.tenant_id` session variable
3. Rely on RLS for all queries (no manual filtering)

**Anti-pattern** (forbidden):
```typescript
// DON'T: Application-level filtering alone
const findings = await db.query(
  'SELECT * FROM findings WHERE tenant_id = $1',
  [tenantId]
);
```

**Correct** (RLS-enforced):
```typescript
// DO: Set session variable, let RLS enforce
await db.query('SET LOCAL app.tenant_id = $1', [tenantId]);
const findings = await db.query('SELECT * FROM findings');
// RLS automatically filters by tenant_id
```

### RLS Testing Strategy

Phase 8 gate tests MUST verify:
1. Cross-tenant read blocked
2. Cross-tenant write blocked
3. Session variable not set → empty results

---

## Phase 8 Gate Tests

Add to `docs/REGINTEL_PHASE_GATES.yml`:

```yaml
  phase8_integration_slice:
    description: "Minimal vertical slice with DB + API"
    depends_on: [phase7_outputs]
    required_tests:
      - id: db_tenant_isolation
        command: "pnpm vitest run -t \"integration:tenant-isolation\""
        asserts:
          - "cross-tenant read returns empty (not error)"
          - "cross-tenant write is blocked by RLS"
          - "tenant_id mismatch prevents INSERT"

      - id: mock_session_e2e
        command: "pnpm vitest run -t \"integration:mock-session\""
        asserts:
          - "create snapshot → start session → ask question → draft finding → complete session"
          - "published finding has origin=SYSTEM_MOCK"
          - "audit chain verifies after session complete"

      - id: evidence_content_addressing
        command: "pnpm vitest run -t \"integration:evidence\""
        asserts:
          - "duplicate blob upload returns existing content_hash"
          - "evidence_record references blob via content_hash"
          - "multiple tenants can reference same blob"

      - id: report_generation_e2e
        command: "pnpm vitest run -t \"integration:reports\""
        asserts:
          - "confidence report derives from DB snapshot + findings"
          - "risk register sorted by composite_risk_score DESC"
          - "no business logic in API layer (Phase 7 pure functions only)"

      - id: audit_chain_persistence
        command: "pnpm vitest run -t \"integration:audit-chain\""
        asserts:
          - "audit events append with correct previous_event_hash"
          - "verify-chain endpoint detects tampered event"
          - "audit log is append-only (UPDATE fails)"

      - id: mock_separation_db_constraint
        command: "pnpm vitest run -t \"integration:mock-separation\""
        asserts:
          - "SYSTEM_MOCK finding cannot have reporting_domain=REGULATORY_HISTORY"
          - "INSERT with violated constraint fails at DB level"
          - "constraint check is deterministic"

    blocks_next_phase_on_failure: true
```

### Test Implementation Guidance

**integration:tenant-isolation**
```typescript
// Test 1: Cross-tenant read blocked
await db.query('SET LOCAL app.tenant_id = $1', [tenantA]);
const findingsA = await db.query('SELECT * FROM findings');

await db.query('SET LOCAL app.tenant_id = $1', [tenantB]);
const findingsB = await db.query('SELECT * FROM findings');

expect(findingsA).not.toContainAnyFrom(findingsB);

// Test 2: Cross-tenant write blocked
await db.query('SET LOCAL app.tenant_id = $1', [tenantA]);
await expect(
  db.query('INSERT INTO findings (tenant_id, ...) VALUES ($1, ...)', [tenantB, ...])
).rejects.toThrow(); // RLS blocks INSERT
```

**integration:mock-session**
```typescript
// End-to-end flow
const snapshot = await api.post('/api/v1/snapshots', { ... });
const session = await api.post('/api/v1/mock-sessions', { contextSnapshotId: snapshot.id });
const question = await api.post(`/api/v1/mock-sessions/${session.id}/questions`, { ... });
const answer = await api.post(`/api/v1/mock-sessions/${session.id}/answers`, { ... });
const draftFinding = await api.post(`/api/v1/mock-sessions/${session.id}/findings`, { ... });
const completed = await api.post(`/api/v1/mock-sessions/${session.id}/complete`, { publishFindings: true });

expect(completed.publishedFindings).toHaveLength(1);

const finding = await db.query('SELECT * FROM findings WHERE id = $1', [completed.publishedFindings[0]]);
expect(finding.origin).toBe('SYSTEM_MOCK');
expect(finding.reporting_domain).toBe('SYSTEM_MOCK');

const auditVerify = await api.get('/api/v1/audit/verify-chain');
expect(auditVerify.chainVerified).toBe(true);
```

**integration:evidence**
```typescript
// Upload same blob twice
const file = Buffer.from('test content');
const upload1 = await api.post('/api/v1/evidence/blobs', { file });
const upload2 = await api.post('/api/v1/evidence/blobs', { file });

expect(upload1.contentHash).toBe(upload2.contentHash); // Deduplication

// Create records for different tenants
await api.setTenant(tenantA);
const recordA = await api.post('/api/v1/evidence/records', { contentHash: upload1.contentHash, ... });

await api.setTenant(tenantB);
const recordB = await api.post('/api/v1/evidence/records', { contentHash: upload1.contentHash, ... });

// Both reference same blob
const blob = await db.query('SELECT * FROM evidence_blobs WHERE content_hash = $1', [upload1.contentHash]);
expect(blob).toBeDefined(); // Single blob, two records
```

**integration:reports**
```typescript
// Setup: Create snapshot, findings, actions in DB
const snapshot = await createSnapshot({ ... });
const finding = await createFinding({ contextSnapshotId: snapshot.id, ... });
const action = await createAction({ findingId: finding.id, ... });

// Generate report via API
const report = await api.get(`/api/v1/reports/confidence?snapshotId=${snapshot.id}`);

// Verify pure derivation (no logic in API)
const expectedReport = generateInspectionConfidenceReport({
  tenantId: tenant.id,
  domain: 'CQC',
  asOfSnapshot: snapshot.id,
  findings: [finding],
  actions: [action]
});

expect(report).toEqual(expectedReport); // API just calls Phase 7 function
```

**integration:audit-chain**
```typescript
// Create events
await api.post('/api/v1/snapshots', { ... }); // Event 1
await api.post('/api/v1/mock-sessions', { ... }); // Event 2
await api.post(`/api/v1/mock-sessions/${sessionId}/questions`, { ... }); // Event 3

// Verify chain
const verify = await api.get('/api/v1/audit/verify-chain');
expect(verify.chainVerified).toBe(true);

// Tamper with event
await db.query('UPDATE audit_events SET payload = $1 WHERE id = $2', ['{}', event2Id]);

// Verification should fail
const verifyTampered = await api.get('/api/v1/audit/verify-chain');
expect(verifyTampered.chainVerified).toBe(false);
expect(verifyTampered.breaks).toHaveLength(1);
```

**integration:mock-separation**
```typescript
// Attempt to violate constraint
await expect(
  db.query(`
    INSERT INTO findings (tenant_id, origin, reporting_domain, ...)
    VALUES ($1, 'SYSTEM_MOCK', 'REGULATORY_HISTORY', ...)
  `, [tenantId, ...])
).rejects.toThrow(/f_mock_separation_check/); // DB constraint violation

// Valid SYSTEM_MOCK finding
const validMockFinding = await db.query(`
  INSERT INTO findings (tenant_id, origin, reporting_domain, ...)
  VALUES ($1, 'SYSTEM_MOCK', 'SYSTEM_MOCK', ...)
  RETURNING *
`, [tenantId, ...]);
expect(validMockFinding).toBeDefined();

// Valid REGULATORY_HISTORY finding
const validRegFinding = await db.query(`
  INSERT INTO findings (tenant_id, origin, reporting_domain, ...)
  VALUES ($1, 'EXTERNAL_AUDIT', 'REGULATORY_HISTORY', ...)
  RETURNING *
`, [tenantId, ...]);
expect(validRegFinding).toBeDefined();
```

---

## What Phase 8 Does NOT Include

**Out of Scope** (deferred to Phase 9+):
- GraphQL API
- WebSocket real-time updates
- Advanced query APIs (filtering, pagination, search)
- File storage (S3/filesystem integration)
- Authentication/Authorization middleware (use test JWT)
- Rate limiting
- API versioning beyond /v1
- Batch operations
- Data export (CSV, PDF)
- Email notifications
- Webhooks
- Admin panel
- Multi-domain filtering UI
- Advanced RBAC (beyond tenant isolation)

**Rationale**: Phase 8 proves the integration architecture. Features belong in Phase 9+.

---

## Implementation Checklist

### Prerequisites
- [ ] All Phase 0-7 gate tests passing
- [ ] Domain entities exported from packages/domain
- [ ] PostgreSQL 14+ with RLS support
- [ ] Node.js API framework selected (Express/Fastify)

### Database Setup
- [ ] Create all 8 tables with RLS enabled
- [ ] Add CHECK constraints for enum fields
- [ ] Add indexes for tenant_id + common queries
- [ ] Test RLS policies with cross-tenant attempts
- [ ] Verify `f_mock_separation_check` constraint

### API Layer
- [ ] JWT middleware extracts tenantId
- [ ] Set `app.tenant_id` session variable per request
- [ ] Implement 14 endpoints (snapshots, sessions, evidence, reports, audit)
- [ ] NO business logic in API handlers (call domain functions only)
- [ ] Return proper HTTP status codes (201, 400, 404, 500)

### Integration Tests
- [ ] Write 6 Phase 8 gate tests
- [ ] Test cross-tenant isolation
- [ ] Test end-to-end mock session flow
- [ ] Test evidence content-addressing
- [ ] Test report generation (pure Phase 7 functions)
- [ ] Test audit chain persistence + verification
- [ ] Test mock separation DB constraint

### Documentation
- [ ] API endpoint documentation (OpenAPI/Swagger)
- [ ] Database migration scripts
- [ ] RLS setup guide
- [ ] Local development setup (docker-compose)

---

## Success Criteria

Phase 8 is complete when:
1. All 19 prior gate tests still pass
2. All 6 new Phase 8 gate tests pass
3. `pnpm gate --strict` shows 25 passing tests
4. Mock inspection flow works end-to-end via API
5. RLS blocks all cross-tenant access attempts
6. Audit chain verifies after every mutation
7. Reports generate from DB via Phase 7 pure functions

---

## Open Questions for Implementation

1. **JWT Secret**: Use environment variable or Vault?
2. **DB Connection Pool**: Max connections per tenant?
3. **Evidence Blob Storage**: Filesystem or S3? (Phase 8 can use filesystem, S3 in Phase 9)
4. **API Framework**: Express (familiar) or Fastify (faster)?
5. **Test Database**: Separate DB per test or shared with cleanup?
6. **Migration Tool**: Knex.js, node-pg-migrate, or raw SQL?

---

## Appendix: Compliance Mapping

| Requirement | Implementation |
|-------------|----------------|
| **Phase 0: Tenant Isolation** | RLS on all tables + `app.tenant_id` session variable |
| **Phase 0: Audit Immutability** | `audit_events` table append-only, no UPDATE allowed |
| **Phase 0: Hash Chain** | `event_hash = SHA-256(payload_hash + previous_event_hash)` |
| **Phase 1: No Orphans** | `findings.context_snapshot_id` NOT NULL + FK constraint |
| **Phase 1: Mock Separation** | `f_mock_separation_check` DB constraint |
| **Phase 1: Immutable Findings** | No `updated_at` column, INSERT-only |
| **Phase 4: Deterministic Logic** | Profile evaluation uses pure function, no randomness |
| **Phase 5: Follow-up Limits** | API enforces `max_followups_per_topic` before INSERT |
| **Phase 6: Bounded Evidence Types** | `evidence_type` CHECK constraint + enum validation |
| **Phase 7: Output Purity** | API calls Phase 7 functions directly, no logic in handlers |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-22 | Initial Phase 8 integration plan |

