# RegIntel v2 Gate Truth Table

**Generated:** 2026-01-23
**Current Phase:** phase10_ui
**Purpose:** End-to-end test audit for all required phase gates

---

## Executive Summary

| Category | Count | Status |
|----------|-------|--------|
| **Total Gates** | 38 | Phases 0-10 |
| **Unit Tests** | 262 passed | ✅ All passing |
| **E2E Tests** | 46/53 passed | ⚠️ 7 failing |
| **Integration Tests** | 0 implemented | ❌ **MISSING** |
| **Live Services** | 0 gates | ❌ None hit real DB/services |

---

## Critical Findings

### ❌ **Phase 8 Integration Gates: NOT IMPLEMENTED**

Phase 8 defines 6 integration tests requiring real database + API:
- `integration:tenant-isolation`
- `integration:mock-session`
- `integration:evidence`
- `integration:reports`
- `integration:audit-chain`
- `integration:mock-separation`

**Status:** NONE of these tests exist. Phase 8 gates are declared in YAML but have zero implementation.

### ⚠️ **Current Test Architecture**

All 262 passing tests are **in-memory unit tests**:
- No database connection
- No persistent storage
- No network calls
- Pure function testing only

### ⚠️ **E2E Tests Missing Backend Integration**

E2E tests (`cd apps/web && pnpm test:e2e`) verify UI behavior but:
- API returns hardcoded mock data (no DB)
- No real audit chain persistence
- No tenant isolation at DB layer
- 7/53 tests failing due to missing UI-API wiring

---

## Gate-by-Gate Truth Table

### Phase 0: Foundations

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `tenant_isolation` | `pnpm vitest run -t "security:tenant"` | `packages/security/src/tenant.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Postgres RLS, real tenant DB isolation |
| `audit_chain` | `pnpm vitest run -t "audit:chain"` | `packages/security/src/audit.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Postgres audit table, hash chain persistence |
| `secrets_scan` | `pnpm vitest run -t "security:secrets"` | `packages/security/src/secrets-scan.test.ts` | Vitest unit test via `pnpm test` | Unit | **Filesystem scan (real)** | ✅ Already E2E (scans repo) |

**Phase 0 Status:** ⚠️ 2/3 gates are unit-only, need DB integration

---

### Phase 1: The Spine

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `no_orphans` | `pnpm vitest run -t "spine:no-orphans"` | `packages/domain/src/spine.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Postgres foreign keys enforcing spine integrity |
| `mock_separation` | `pnpm vitest run -t "spine:mock-separation"` | `packages/domain/src/spine.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Postgres CHECK constraints on `reporting_domain` + `origin` |
| `hash_determinism` | `pnpm vitest run -t "spine:hashes"` | `packages/domain/src/spine.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already deterministic (no I/O) |

**Phase 1 Status:** ⚠️ 2/3 gates need DB constraints

---

### Phase 2: Drift Engine

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `cosmetic_change` | `pnpm vitest run -t "drift:cosmetic"` | `packages/domain/src/drift.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already deterministic |
| `normative_change` | `pnpm vitest run -t "drift:normative"` | `packages/domain/src/drift.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already deterministic |
| `drift_determinism` | `pnpm vitest run -t "drift:determinism"` | `packages/domain/src/drift.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already deterministic |

**Phase 2 Status:** ✅ All gates are pure functions (no E2E needed)

---

### Phase 3: Policy Intelligence

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `non_destructive_edges` | `pnpm vitest run -t "policy-intel:edges"` | `packages/domain/src/policy-intelligence.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Postgres immutable edges table, verify no UPDATEs/DELETEs |
| `migration_recommendations` | `pnpm vitest run -t "policy-intel:migrations"` | `packages/domain/src/policy-intelligence.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already deterministic |

**Phase 3 Status:** ⚠️ 1/2 gates need DB immutability enforcement

---

### Phase 4: PRS Logic Profiles

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `logic_determinism` | `pnpm vitest run -t "logic:determinism"` | `packages/domain/src/prs-logic-profile.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already deterministic |
| `interaction_hash` | `pnpm vitest run -t "logic:interaction-hash"` | `packages/domain/src/prs-logic-profile.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already deterministic |

**Phase 4 Status:** ✅ All gates are pure functions

---

### Phase 5: Mock Inspection Engine

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `followup_limits` | `pnpm vitest run -t "mock:limits"` | `packages/domain/src/mock-inspection-engine.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: DB session state persistence, verify limits across server restarts |
| `event_replay` | `pnpm vitest run -t "mock:replay"` | `packages/domain/src/mock-inspection-engine.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Postgres event sourcing, replay from DB |
| `mock_safety` | `pnpm vitest run -t "mock:safety"` | `packages/domain/src/mock-inspection-engine.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: DB constraints preventing mock → regulatory leakage |

**Phase 5 Status:** ⚠️ All 3 gates need DB persistence + event sourcing

---

### Phase 6: Topic Catalog

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `topic_scope` | `pnpm vitest run -t "topics:scope"` | `packages/domain/src/topic-catalog.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already validates catalog structure |
| `evidence_alignment` | `pnpm vitest run -t "topics:evidence"` | `packages/domain/src/topic-catalog.test.ts` | Vitest unit test via `pnpm test` | Unit | **Pure function** | ✅ Already validates alignment |

**Phase 6 Status:** ✅ All gates are catalog validation (no E2E needed)

---

### Phase 7: Provider Outputs

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `output_purity` | `pnpm vitest run -t "outputs:purity"` | `packages/domain/src/provider-outputs.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Verify reports derive from real DB spine data |

**Phase 7 Status:** ⚠️ Need DB-driven report generation

---

### Phase 8: Integration Slice ❌ **CRITICAL FAILURE**

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `db_tenant_isolation` | `pnpm vitest run -t "integration:tenant-isolation"` | ❌ **DOES NOT EXIST** | N/A | ❌ **MISSING** | ❌ No DB | **MUST IMPLEMENT:** Postgres with RLS, cross-tenant read/write tests |
| `mock_session_e2e` | `pnpm vitest run -t "integration:mock-session"` | ❌ **DOES NOT EXIST** | N/A | ❌ **MISSING** | ❌ No DB | **MUST IMPLEMENT:** Full session lifecycle through DB + API |
| `evidence_content_addressing` | `pnpm vitest run -t "integration:evidence"` | ❌ **DOES NOT EXIST** | N/A | ❌ **MISSING** | ❌ No DB | **MUST IMPLEMENT:** S3/blob storage + DB metadata layer |
| `report_generation_e2e` | `pnpm vitest run -t "integration:reports"` | ❌ **DOES NOT EXIST** | N/A | ❌ **MISSING** | ❌ No DB | **MUST IMPLEMENT:** Reports from DB spine via API |
| `audit_chain_persistence` | `pnpm vitest run -t "integration:audit-chain"` | ❌ **DOES NOT EXIST** | N/A | ❌ **MISSING** | ❌ No DB | **MUST IMPLEMENT:** Postgres audit log with hash chain verification |
| `mock_separation_db_constraint` | `pnpm vitest run -t "integration:mock-separation"` | ❌ **DOES NOT EXIST** | N/A | ❌ **MISSING** | ❌ No DB | **MUST IMPLEMENT:** Postgres CHECK constraints rejecting invalid combinations |

**Phase 8 Status:** ❌ **0/6 gates implemented. Phase is INCOMPLETE.**

**What exists instead:**
- `apps/api/src/server.test.ts` - Fails to load (missing supertest dependency resolution)
- `apps/api/mock-inspection-backend.test.ts` - 5 unit tests for backend logic (in-memory)

**What's missing:**
1. **No Docker Compose** for Postgres test database
2. **No database schema** (SQL migrations)
3. **No DB connection layer** (e.g., Prisma, Drizzle, raw pg)
4. **No integration test harness** (DB setup/teardown, seed data)
5. **No RLS policies** in Postgres
6. **No blob storage** (S3/MinIO) for evidence content-addressing

---

### Phase 9e: Readiness Export

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `report_export` | `pnpm vitest run -t "ux:report_export"` | `packages/domain/src/readiness-export.test.ts` | Vitest unit test via `pnpm test` | Unit | **In-memory only** | Need: Generate CSV/PDF from real DB session data |

**Phase 9e Status:** ⚠️ Export logic exists but operates on mock data

---

### Phase 10: Forensic UI

| Gate ID | Command | Implementation | Execution | Type | Live Services | E2E Gap |
|---------|---------|----------------|-----------|------|---------------|---------|
| `ui_constitutional` | `cd apps/web && pnpm vitest run -t "ui:constitutional"` | `apps/web/ui.test.ts` | Vitest unit test (jsdom) | Unit | **jsdom (fake DOM)** | Need: Real browser rendering verification |
| `ui_mock_safety` | `cd apps/web && pnpm vitest run -t "ui:mock-safety"` | `apps/web/ui.test.ts` | Vitest unit test (jsdom) | Unit | **jsdom (fake DOM)** | Need: Real browser visual regression testing |
| `ui_projection_purity` | `cd apps/web && pnpm vitest run -t "ui:projection-purity"` | `apps/web/ui.test.ts` | Vitest unit test (jsdom) | Unit | **jsdom (fake DOM)** | Need: Static analysis to detect business logic in UI |
| `ui_disclosure` | `cd apps/web && pnpm vitest run -t "ui:disclosure"` | `apps/web/ui.test.ts` | Vitest unit test (jsdom) | Unit | **jsdom (fake DOM)** | Need: Real browser interaction testing |
| `ui_no_interpretation` | `cd apps/web && pnpm vitest run -t "ui:no-interpretation"` | `apps/web/ui.test.ts` | Vitest unit test (jsdom) | Unit | **jsdom (fake DOM)** | Need: Visual regression to detect colors/emojis |
| `ui_menu_all_live` | `cd apps/web && pnpm test:e2e` | `apps/web/e2e/*.spec.ts` (5 files, 53 tests) | **Playwright E2E** | **E2E** | ✅ **Real browser + servers** | ⚠️ **PARTIAL:** 46/53 passing, but API returns hardcoded data (no DB) |

**Phase 10 Status:** ⚠️ Playwright E2E runs but backend has no DB

**Playwright Test Details:**
- **Execution:** `cd apps/web && pnpm test:e2e`
- **Files:** 5 spec files in `apps/web/e2e/`
  - `api-integration.spec.ts` - 8 tests (5 pass, 3 fail)
  - `constitutional-requirements.spec.ts` - 26 tests (22 pass, 4 fail)
  - `menu-navigation.spec.ts` - 8 tests (all pass)
  - `mock-safety.spec.ts` - 5 tests (all pass)
  - `progressive-disclosure.spec.ts` - 6 tests (all pass)
- **Current:** Uses real Next.js dev server + Express API server
- **Gap:** API serves hardcoded JSON (no Postgres)
- **Failing tests:**
  - Pages return HTML instead of making API calls (routing issue)
  - Constitutional metadata not rendered in UI

---

## Missing Infrastructure

### ❌ Database Layer (Phase 8 blocker)

**None of these exist:**
1. **Docker Compose** - No `docker-compose.yml` for Postgres + Redis
2. **Schema migrations** - No SQL DDL scripts or Prisma schema
3. **Connection layer** - No DB client (pg, Prisma, Drizzle)
4. **Row-Level Security** - No Postgres RLS policies
5. **Test fixtures** - No seed data or test harness
6. **CI database** - No ephemeral DB for CI pipeline

### ❌ Integration Test Harness

**What Phase 8 requires but doesn't have:**
- DB setup/teardown hooks
- Transaction rollback for test isolation
- Tenant seed data
- API request helpers (supertest setup)
- Evidence blob storage (S3/MinIO mock)

### ⚠️ Current API Implementation

**File:** `apps/api/src/server.ts`
- **Status:** Running on http://localhost:3001
- **Data:** Hardcoded JSON responses
- **DB Calls:** Zero
- **Audit Log:** Not persisted
- **Tenant Isolation:** Not enforced

---

## Recommendations

### 1. **CRITICAL: Implement Phase 8 Gates**

Phase 8 is marked complete in `current_phase.txt` but has **0% implementation**.

**Action Plan:**
1. Add `docker-compose.yml` with Postgres 16 + RLS enabled
2. Create schema migrations (regulations, policies, findings, audit_log, etc.)
3. Implement DB connection layer
4. Write 6 integration tests matching YAML gate definitions
5. Update `pnpm gate` to run integration tests with live DB

**Estimated Work:** 2-3 weeks (non-trivial)

### 2. **Fix Phase 10 E2E Test Failures**

**7 failing Playwright tests need:**
- Wire UI pages to API (currently returning HTML instead of making fetch calls)
- Render constitutional metadata in UI components
- Test against real DB (after Phase 8 implemented)

### 3. **Add Missing Test Infrastructure**

**For true E2E:**
- Visual regression testing (Percy, Chromatic) for mock safety styling
- Static analysis (ESLint rule) to detect business logic in UI
- DB snapshot testing for audit chain integrity
- Load testing for multi-tenant isolation

### 4. **Version Immutability Enforcement**

**Current:** `pnpm validate:versions` passes (unit test)
**Need:** Git hooks to block commits modifying `*.v1.json` files

---

## Definition of "True End-to-End"

A gate is **true E2E** if:
1. ✅ Uses real browser (Playwright) OR real DB (Postgres)
2. ✅ Persists data to disk (DB, blob storage)
3. ✅ Survives server restart (state is durable)
4. ✅ Network calls cross process boundaries (HTTP, DB protocol)
5. ✅ Enforces constraints at infrastructure layer (Postgres RLS, CHECK constraints)

**Current E2E Count:** 1/38 gates (only `ui_menu_all_live` uses real browser, but lacks DB)

---

## Appendix: How to Run Tests

### Unit Tests (All Phases)
```bash
pnpm test                          # Run all 262 unit tests
pnpm vitest run -t "security:"     # Phase 0 only
pnpm vitest run -t "spine:"        # Phase 1 only
pnpm vitest run -t "integration:"  # Phase 8 (currently 0 tests)
```

### E2E Tests (Phase 10)
```bash
cd apps/web
pnpm test:e2e                      # Run 53 Playwright tests (46 pass)
pnpm test:e2e --headed             # Watch tests run in browser
```

### Phase Gate Validation
```bash
pnpm gate                          # Run gate checker (reads YAML)
pnpm gate --strict                 # CI mode: SKIP = FAIL
```

### Servers (for E2E)
```bash
# Terminal 1: API server
cd apps/api && pnpm dev            # http://localhost:3001

# Terminal 2: Web server
cd apps/web && pnpm dev            # http://localhost:3000
```

---

## Conclusion

**RegIntel v2 has excellent unit test coverage (262 tests, all passing) but lacks true end-to-end integration.**

**The most critical gap is Phase 8:** All 6 integration gates are declared in governance but **zero are implemented**. The project cannot claim Phase 8 completion without a real database layer and integration test harness.

**Recommendation:** Block Phase 10 (current) advancement and backfill Phase 8 infrastructure before proceeding.

---

**Report End**
