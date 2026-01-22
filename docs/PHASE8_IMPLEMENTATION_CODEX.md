# Phase 8 Implementation Codex

**Status**: Ready for implementation
**Prerequisites**: All Phase 0-7 gates passing (19 tests)
**Target**: 25 passing gates (19 existing + 6 new)

## CRITICAL CONSTRAINTS

1. **READ FIRST**: `/Users/user/regintel-v2/docs/REGINTEL_PHASE8_INTEGRATION_PLAN.md`
2. **NO SCOPE CREEP**: Implement ONLY what is specified in the plan
3. **NO CODE MODIFICATIONS**: Until all tests are written and understand requirements
4. **DETERMINISTIC**: No randomness, no LLM prompts, no free-text fields
5. **RLS FIRST**: Database isolation at PostgreSQL level, not application
6. **PURE FUNCTIONS**: API handlers call Phase 7 functions directly, no business logic

---

## IMPLEMENTATION ORDER

### Phase 1: Database Setup (Do First)

#### Step 1.1: Create Migration File

**File**: `packages/db/migrations/001_phase8_initial_schema.sql`

**Content**: Copy all 8 CREATE TABLE statements from Phase 8 plan sections:
- provider_context_snapshots (lines 203-223)
- mock_inspection_sessions (lines 234-257)
- session_events (lines 268-289)
- draft_findings (lines 300-323)
- findings (lines 334-376)
- evidence_blobs (lines 387-399)
- evidence_records (lines 410-430)
- audit_events (lines 441-462)

**Validation**:
```bash
psql -d regintel_test -f packages/db/migrations/001_phase8_initial_schema.sql
psql -d regintel_test -c "\dt" | grep -E "(provider_context_snapshots|mock_inspection_sessions|session_events|draft_findings|findings|evidence_blobs|evidence_records|audit_events)"
# Must show all 8 tables
```

#### Step 1.2: Verify RLS Policies

```bash
psql -d regintel_test -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('provider_context_snapshots', 'mock_inspection_sessions', 'session_events', 'draft_findings', 'findings', 'evidence_records', 'audit_events');"
# All must show rowsecurity = true
```

#### Step 1.3: Test Mock Separation Constraint

```bash
psql -d regintel_test -c "INSERT INTO findings (tenant_id, domain, context_snapshot_id, origin, reporting_domain, regulation_id, regulation_section_id, title, description, severity, impact_score, likelihood_score, composite_risk_score, identified_at, identified_by, finding_hash) VALUES (gen_random_uuid(), 'CQC', gen_random_uuid(), 'SYSTEM_MOCK', 'REGULATORY_HISTORY', 'reg-1', 'sec-1', 'test', 'test', 'LOW', 50, 50, 25, now(), 'test', 'hash');"
# MUST FAIL with: violates check constraint "f_mock_separation_check"
```

---

### Phase 2: Integration Test Infrastructure

#### Step 2.1: Create Test Database Helper

**File**: `tests/integration/helpers/db.ts`

```typescript
import pg from 'pg';

const testPool = new pg.Pool({
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'regintel_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'postgres',
});

export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resetDatabase() {
  await testPool.query('TRUNCATE provider_context_snapshots, mock_inspection_sessions, session_events, draft_findings, findings, evidence_blobs, evidence_records, audit_events CASCADE');
}

export { testPool };
```

#### Step 2.2: Create Test Fixtures

**File**: `tests/integration/helpers/fixtures.ts`

```typescript
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';

export async function createSnapshot(
  client: PoolClient,
  overrides: Partial<any> = {}
) {
  const id = randomUUID();
  const tenantId = overrides.tenantId || randomUUID();

  const result = await client.query(`
    INSERT INTO provider_context_snapshots (
      id, tenant_id, as_of, regulatory_state, metadata,
      enabled_domains, active_regulation_ids, active_policy_ids,
      snapshot_hash, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    id,
    tenantId,
    overrides.asOf || new Date().toISOString(),
    overrides.regulatoryState || 'ESTABLISHED',
    overrides.metadata || {},
    overrides.enabledDomains || ['CQC'],
    overrides.activeRegulationIds || [],
    overrides.activePolicyIds || [],
    overrides.snapshotHash || 'hash-' + id,
    overrides.createdBy || 'test-user',
  ]);

  return result.rows[0];
}

export async function createMockSession(
  client: PoolClient,
  contextSnapshotId: string,
  overrides: Partial<any> = {}
) {
  const id = randomUUID();
  const tenantId = overrides.tenantId || randomUUID();

  const result = await client.query(`
    INSERT INTO mock_inspection_sessions (
      id, tenant_id, domain, context_snapshot_id, logic_profile_id,
      status, max_followups_per_topic, max_total_questions,
      session_hash, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    id,
    tenantId,
    overrides.domain || 'CQC',
    contextSnapshotId,
    overrides.logicProfileId || 'profile-1',
    overrides.status || 'IN_PROGRESS',
    overrides.maxFollowupsPerTopic || 3,
    overrides.maxTotalQuestions || 12,
    overrides.sessionHash || 'hash-' + id,
    overrides.createdBy || 'test-user',
  ]);

  return result.rows[0];
}

// Add createFinding, createEvidence, etc. following same pattern
```

---

### Phase 3: Write Integration Tests (BEFORE API Implementation)

#### Step 3.1: Test 1 - Tenant Isolation

**File**: `tests/integration/tenant-isolation.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { withTenant, resetDatabase, testPool } from './helpers/db.js';
import { createSnapshot } from './helpers/fixtures.js';
import { randomUUID } from 'crypto';

describe('integration:tenant-isolation', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('cross-tenant read returns empty (not error)', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    // Tenant A creates snapshot
    await withTenant(tenantA, async (client) => {
      await createSnapshot(client, { tenantId: tenantA });
    });

    // Tenant B queries - should see nothing
    await withTenant(tenantB, async (client) => {
      const result = await client.query('SELECT * FROM provider_context_snapshots');
      expect(result.rows).toHaveLength(0);
    });

    // Tenant A should see their snapshot
    await withTenant(tenantA, async (client) => {
      const result = await client.query('SELECT * FROM provider_context_snapshots');
      expect(result.rows).toHaveLength(1);
    });
  });

  it('cross-tenant write is blocked by RLS', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    await withTenant(tenantA, async (client) => {
      // Attempt to insert with different tenant_id
      await expect(
        createSnapshot(client, { tenantId: tenantB })
      ).rejects.toThrow();
    });
  });

  it('tenant_id mismatch prevents INSERT', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    await withTenant(tenantA, async (client) => {
      await expect(
        client.query(`
          INSERT INTO provider_context_snapshots (
            id, tenant_id, as_of, regulatory_state, metadata,
            enabled_domains, active_regulation_ids, active_policy_ids,
            snapshot_hash, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          randomUUID(),
          tenantB, // Different tenant!
          new Date().toISOString(),
          'ESTABLISHED',
          {},
          ['CQC'],
          [],
          [],
          'hash-123',
          'test-user',
        ])
      ).rejects.toThrow(/new row violates row-level security policy/);
    });
  });
});
```

#### Step 3.2: Test 2 - Mock Session E2E

**File**: `tests/integration/mock-session-e2e.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { withTenant, resetDatabase } from './helpers/db.js';
import { createSnapshot, createMockSession } from './helpers/fixtures.js';
import { randomUUID } from 'crypto';

describe('integration:mock-session', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('create snapshot → start session → ask question → draft finding → complete session', async () => {
    const tenantId = randomUUID();

    const snapshot = await withTenant(tenantId, async (client) => {
      return await createSnapshot(client, { tenantId });
    });

    const session = await withTenant(tenantId, async (client) => {
      return await createMockSession(client, snapshot.id, { tenantId });
    });

    // Ask question
    const questionEvent = await withTenant(tenantId, async (client) => {
      const result = await client.query(`
        INSERT INTO session_events (
          session_id, tenant_id, event_type, topic_id,
          question, is_follow_up
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        session.id,
        tenantId,
        'QUESTION_ASKED',
        'topic-1',
        'Test question?',
        false,
      ]);
      return result.rows[0];
    });

    expect(questionEvent.event_type).toBe('QUESTION_ASKED');

    // Record answer
    await withTenant(tenantId, async (client) => {
      await client.query(`
        INSERT INTO session_events (
          session_id, tenant_id, event_type, provider_response
        ) VALUES ($1, $2, $3, $4)
      `, [session.id, tenantId, 'ANSWER_RECEIVED', 'Test answer']);
    });

    // Draft finding
    const draftFinding = await withTenant(tenantId, async (client) => {
      const result = await client.query(`
        INSERT INTO draft_findings (
          session_id, tenant_id, topic_id, title, description,
          severity, impact_score, likelihood_score, composite_risk_score,
          regulation_id, regulation_section_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        session.id,
        tenantId,
        'topic-1',
        'Test Finding',
        'Test description',
        'MEDIUM',
        60,
        70,
        42,
        'reg-1',
        'sec-1',
      ]);
      return result.rows[0];
    });

    // Complete session and publish finding
    await withTenant(tenantId, async (client) => {
      // Publish finding with SYSTEM_MOCK origin
      await client.query(`
        INSERT INTO findings (
          id, tenant_id, domain, context_snapshot_id,
          origin, reporting_domain, regulation_id, regulation_section_id,
          title, description, severity, impact_score, likelihood_score,
          composite_risk_score, identified_at, identified_by, finding_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        randomUUID(),
        tenantId,
        'CQC',
        snapshot.id,
        'SYSTEM_MOCK',
        'SYSTEM_MOCK',
        draftFinding.regulation_id,
        draftFinding.regulation_section_id,
        draftFinding.title,
        draftFinding.description,
        draftFinding.severity,
        draftFinding.impact_score,
        draftFinding.likelihood_score,
        draftFinding.composite_risk_score,
        new Date().toISOString(),
        'system',
        'hash-' + randomUUID(),
      ]);

      // Mark session complete
      await client.query(
        'UPDATE mock_inspection_sessions SET status = $1, completed_at = $2 WHERE id = $3',
        ['COMPLETED', new Date().toISOString(), session.id]
      );
    });

    // Verify finding exists with correct origin
    const finding = await withTenant(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM findings WHERE context_snapshot_id = $1',
        [snapshot.id]
      );
      return result.rows[0];
    });

    expect(finding.origin).toBe('SYSTEM_MOCK');
    expect(finding.reporting_domain).toBe('SYSTEM_MOCK');
  });
});
```

#### Step 3.3: Test 3 - Evidence Content Addressing

**File**: `tests/integration/evidence.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { testPool, resetDatabase } from './helpers/db.js';
import { createHash } from 'crypto';

describe('integration:evidence', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('duplicate blob upload returns existing content_hash', async () => {
    const content = Buffer.from('test content');
    const hash = 'sha256:' + createHash('sha256').update(content).digest('hex');

    // First upload
    await testPool.query(`
      INSERT INTO evidence_blobs (content_hash, content_type, size_bytes, storage_path)
      VALUES ($1, $2, $3, $4)
    `, [hash, 'text/plain', content.length, '/storage/' + hash]);

    // Duplicate upload - check if exists first
    const existing = await testPool.query(
      'SELECT * FROM evidence_blobs WHERE content_hash = $1',
      [hash]
    );
    expect(existing.rows).toHaveLength(1);

    // Should not insert duplicate
    await expect(
      testPool.query(`
        INSERT INTO evidence_blobs (content_hash, content_type, size_bytes, storage_path)
        VALUES ($1, $2, $3, $4)
      `, [hash, 'text/plain', content.length, '/storage/' + hash])
    ).rejects.toThrow(/duplicate key/);
  });

  it('evidence_record references blob via content_hash', async () => {
    const content = Buffer.from('test content');
    const hash = 'sha256:' + createHash('sha256').update(content).digest('hex');
    const tenantId = '00000000-0000-0000-0000-000000000001';

    // Create blob
    await testPool.query(`
      INSERT INTO evidence_blobs (content_hash, content_type, size_bytes, storage_path)
      VALUES ($1, $2, $3, $4)
    `, [hash, 'text/plain', content.length, '/storage/' + hash]);

    // Create record with tenant isolation
    const client = await testPool.connect();
    try {
      await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
      const result = await client.query(`
        INSERT INTO evidence_records (
          tenant_id, content_hash, evidence_type, title, collected_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [tenantId, hash, 'POLICY_DOCUMENT', 'Test Doc', new Date().toISOString(), 'test-user']);

      expect(result.rows[0].content_hash).toBe(hash);
    } finally {
      client.release();
    }
  });

  it('multiple tenants can reference same blob', async () => {
    const content = Buffer.from('shared content');
    const hash = 'sha256:' + createHash('sha256').update(content).digest('hex');
    const tenantA = '00000000-0000-0000-0000-000000000001';
    const tenantB = '00000000-0000-0000-0000-000000000002';

    // Create blob once
    await testPool.query(`
      INSERT INTO evidence_blobs (content_hash, content_type, size_bytes, storage_path)
      VALUES ($1, $2, $3, $4)
    `, [hash, 'text/plain', content.length, '/storage/' + hash]);

    // Tenant A creates record
    const clientA = await testPool.connect();
    await clientA.query('SET LOCAL app.tenant_id = $1', [tenantA]);
    await clientA.query(`
      INSERT INTO evidence_records (
        tenant_id, content_hash, evidence_type, title, collected_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantA, hash, 'POLICY_DOCUMENT', 'Doc A', new Date().toISOString(), 'user-a']);
    clientA.release();

    // Tenant B creates record
    const clientB = await testPool.connect();
    await clientB.query('SET LOCAL app.tenant_id = $1', [tenantB]);
    await clientB.query(`
      INSERT INTO evidence_records (
        tenant_id, content_hash, evidence_type, title, collected_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantB, hash, 'POLICY_DOCUMENT', 'Doc B', new Date().toISOString(), 'user-b']);
    clientB.release();

    // Verify single blob, two records
    const blobs = await testPool.query('SELECT * FROM evidence_blobs WHERE content_hash = $1', [hash]);
    expect(blobs.rows).toHaveLength(1);

    const records = await testPool.query('SELECT * FROM evidence_records WHERE content_hash = $1', [hash]);
    expect(records.rows).toHaveLength(2);
  });
});
```

#### Step 3.4-3.6: Write Remaining Tests

**Files to create**:
- `tests/integration/reports.test.ts` - Test 4: Report generation
- `tests/integration/audit-chain.test.ts` - Test 5: Audit persistence
- `tests/integration/mock-separation.test.ts` - Test 6: DB constraint

Follow same pattern as above, implementing assertions from Phase 8 plan.

---

### Phase 4: Run Tests (Should Fail)

```bash
pnpm vitest run -t "integration:"
# Expected: All 6 tests FAIL (no API layer yet)
```

---

### Phase 5: API Implementation

**DO NOT START UNTIL ALL 6 TESTS ARE WRITTEN AND FAILING**

#### Step 5.1: Create API Package

```bash
mkdir -p packages/api/src
cd packages/api
pnpm init
pnpm add express pg @types/express @types/pg
```

**File**: `packages/api/package.json`

```json
{
  "name": "@regintel/api",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3"
  }
}
```

#### Step 5.2: Implement Endpoints

**File**: `packages/api/src/routes/snapshots.ts`

```typescript
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { createProviderContextSnapshot } from '@regintel/domain';

export const snapshotsRouter = Router();

snapshotsRouter.post('/', async (req, res) => {
  const { regulatoryState, metadata, enabledDomains, activeRegulationIds, activePolicyIds } = req.body;
  const tenantId = req.tenantId; // From auth middleware

  const snapshot = createProviderContextSnapshot({
    id: randomUUID(),
    tenantId,
    asOf: new Date().toISOString(),
    regulatoryState,
    metadata,
    enabledDomains,
    activeRegulationIds,
    activePolicyIds,
    createdBy: req.userId,
  });

  // Insert to DB
  await req.db.query('SET LOCAL app.tenant_id = $1', [tenantId]);
  await req.db.query(`
    INSERT INTO provider_context_snapshots (...)
    VALUES (...)
  `, [...]);

  res.status(201).json(snapshot);
});

snapshotsRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  await req.db.query('SET LOCAL app.tenant_id = $1', [tenantId]);
  const result = await req.db.query(
    'SELECT * FROM provider_context_snapshots WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }

  res.json(result.rows[0]);
});
```

**Repeat for all 14 endpoints** following Phase 8 plan specification.

#### Step 5.3: Implement Report Endpoints (Pure Functions Only)

**File**: `packages/api/src/routes/reports.ts`

```typescript
import { Router } from 'express';
import { generateInspectionConfidenceReport } from '@regintel/domain';

export const reportsRouter = Router();

reportsRouter.get('/confidence', async (req, res) => {
  const { snapshotId } = req.query;
  const tenantId = req.tenantId;

  // NO BUSINESS LOGIC HERE - just fetch and call Phase 7 function
  await req.db.query('SET LOCAL app.tenant_id = $1', [tenantId]);

  const snapshot = await req.db.query('SELECT * FROM provider_context_snapshots WHERE id = $1', [snapshotId]);
  const findings = await req.db.query('SELECT * FROM findings WHERE context_snapshot_id = $1', [snapshotId]);
  const actions = await req.db.query('SELECT * FROM actions WHERE finding_id = ANY($1)', [findings.rows.map(f => f.id)]);

  // Call pure Phase 7 function
  const report = generateInspectionConfidenceReport({
    tenantId,
    domain: snapshot.rows[0].enabled_domains[0],
    asOfSnapshot: snapshotId,
    findings: findings.rows,
    actions: actions.rows,
  });

  res.json(report);
});
```

---

### Phase 6: Validate Tests Pass

```bash
pnpm vitest run -t "integration:"
# Expected: All 6 tests PASS
```

If any fail, debug until all pass. DO NOT PROCEED until 100% pass rate.

---

### Phase 7: Run Full Gate Validation

```bash
pnpm gate --strict
# Expected: 25 tests pass (19 existing + 6 new)
```

---

### Phase 8: Update Current Phase

**ONLY AFTER ALL 25 TESTS PASS**:

```bash
echo "phase8_integration_slice" > .regintel/current_phase.txt
pnpm gate --strict
# Must still show 25 passing tests
```

---

## VALIDATION CHECKLIST

Before marking Phase 8 complete:

- [ ] All 8 database tables created with RLS enabled
- [ ] `f_mock_separation_check` constraint prevents SYSTEM_MOCK → REGULATORY_HISTORY
- [ ] All 6 integration tests written and passing
- [ ] All 19 prior gate tests still passing
- [ ] `pnpm gate --strict` shows 25 passing tests, 0 failures, 0 skips
- [ ] API handlers call Phase 7 pure functions (no business logic in API layer)
- [ ] RLS blocks cross-tenant access in all 7 tenant-scoped tables
- [ ] Audit chain verifies after mutations
- [ ] Evidence blobs deduplicate via content_hash
- [ ] Mock session E2E flow works: snapshot → session → question → finding → complete

---

## FORBIDDEN ACTIONS

- ❌ Skip writing tests first
- ❌ Add business logic to API handlers
- ❌ Implement features not in Phase 8 plan
- ❌ Use application-level tenant filtering instead of RLS
- ❌ Allow SYSTEM_MOCK findings in REGULATORY_HISTORY
- ❌ Modify audit_events after insertion
- ❌ Advance phase before all 25 tests pass

---

## ON COMPLETION

Update CLAUDE.md to reflect Phase 8 completion:

```markdown
**Current Phase:** Phase 8 (Integration Slice) - All phases 0-8 complete!

## Test Coverage
- **Phase Gates**: 25 tests (all passing)
- **Total Tests**: 157 tests (151 domain + 6 integration)
```

---

## REFERENCES

- Phase 8 Plan: `/Users/user/regintel-v2/docs/REGINTEL_PHASE8_INTEGRATION_PLAN.md`
- Phase Gates: `/Users/user/regintel-v2/docs/REGINTEL_PHASE_GATES.yml`
- Current Phase: `/Users/user/regintel-v2/.regintel/current_phase.txt`
- Domain Entities: `/Users/user/regintel-v2/packages/domain/src/`
