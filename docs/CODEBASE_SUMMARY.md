# RegIntel v2 — Codebase Summary

> **Purpose:** Structured reference for querying via NotebookLM or other RAG systems.
> **Generated:** 2026-03-11 | **Phase:** 11 (Blue Ocean) | **Status:** In Progress

---

## 1. What This System Is

RegIntel v2 (branded as **Regintelia**) is a regulatory compliance intelligence platform for UK CQC-registered care providers. It replaces checklist theatre — ticking boxes before an inspection — with **evidence-based inspection readiness** that is provably correct, temporally safe, and tamper-detectable.

The system ingests real provider evidence (policies, care plans, training records, MAR charts, visit logs), audits it against CQC's Single Assessment Framework (SAF), runs mock inspections that simulate CQC questioning patterns, and produces analyst-grade reports with root cause analysis and SMART remediation plans.

**Market:** ~30,000 CQC-registered care locations in England — residential homes, nursing homes, domiciliary care, supported living, hospices. Sector spend: £34.5B/year.

**Core promise:** Every output is deterministic. Same inputs = same outputs = same SHA-256 hashes. Reports are reproducible and independently verifiable.

---

## 2. Repository Structure

```
regintel-v2/
├── packages/
│   ├── security/        # Phase 0: tenant isolation, audit log, secrets scanning
│   └── domain/          # Phases 1–11: core domain models and business logic
├── apps/
│   ├── api/             # Phase 8+: Express API server (port 3001) with Prisma ORM
│   └── web/             # Phase 10+: Next.js 14 UI (port 3000) with Clerk auth
├── scripts/             # Build and validation (gate.ts, validate-version-immutability.ts)
├── docs/                # Governance documents and phase plans
└── .regintel/           # current_phase.txt — machine-readable phase tracking
```

**Path aliases:**
- `@regintel/domain` → `packages/domain/src`
- `@regintel/security` → `packages/security/src`

**Package manager:** `pnpm` (not npm/yarn)

---

## 3. Development Phases

The system follows strict sequential phase progression (0–11). Each phase defines must-exist components, must-not-exist components, and CI-enforced gate criteria.

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Foundations: multi-tenant isolation, RBAC, immutable audit log, secrets management | Complete |
| 1 | The Spine: core domain model (Regulation → Policy → Finding → Evidence → Action) | Complete |
| 2 | Drift Engine: regulatory change detection, normativity scoring | Complete |
| 3 | Policy Intelligence: impact assessment, non-destructive edge migrations | Complete |
| 4 | PRS Logic Profiles: deterministic severity/rigor rules | Complete |
| 5 | Mock Inspection Engine: stateful sessions, bounded questioning | Complete |
| 6 | Topic Catalog: relevance control, evidence alignment | Complete |
| 7 | Provider Outputs: Inspection Confidence Report, Risk Register, Evidence Matrix | Complete |
| 8 | Integration Slice: minimal vertical slice across DB, API, audit | Complete |
| 9e | Readiness Export: CSV/PDF export for mock inspection results | Complete |
| 10 | Forensic UI: constitutional requirements, mock safety, progressive disclosure | Complete |
| 11 | Blue Ocean Reports: PhD-level analyst output with RCA, SMART actions, ≥95% completeness | **In Progress** |

**Current phase:** 11 (Blue Ocean) — `/.regintel/current_phase.txt`

---

## 4. Core Architecture

### 4.1 The Spine — Immutable Domain Model

All data flows through a hash-linked chain of immutable entities:

```
Regulation → RegulationPolicyLink → Policy → ProviderContextSnapshot → InspectionFinding → Evidence → Action
```

- **No mutation:** changes create new versions with distinct IDs
- **No deletion:** deprecated entities are superseded, never erased
- **Hash-chained audit:** every state change appended with `previous_event_hash` for tamper detection
- **Temporal safety:** all evaluations reference an immutable `ProviderContextSnapshot(as_of)` — no retroactive judgment

Key source files:
- `packages/domain/src/inspection-finding.ts` — finding creation with mock/regulatory enforcement
- `packages/domain/src/evidence.ts` — two-layer evidence model (EvidenceBlob + EvidenceRecord)
- `packages/domain/src/action.ts` — remediation state machine
- `packages/domain/src/provider-context-snapshot.ts` — time-frozen provider state
- `packages/domain/src/regulation-policy-link.ts` — edge-hashed regulation-to-policy mapping

### 4.2 Multi-Tenancy

- Tenant isolation enforced at **database layer** via PostgreSQL Row-Level Security (RLS) — not application code
- Primary keys: `tenantId:resourceId` format
- Cross-tenant reads return empty result sets (no information leakage about existence)
- Cross-tenant writes blocked by RLS policies
- `TenantBoundaryViolationError` thrown on violation
- FOUNDER role can override tenant via `x-tenant-id` header; PROVIDER role locked to own tenant

### 4.3 Determinism Guarantee

- No timestamps in canonical hashes
- No UUIDs in deterministic computations
- No randomness in scoring or classification
- Same `ProviderContextSnapshot` + same PRS Logic Profile + same Topic Catalog = identical outputs

### 4.4 Mock vs Regulatory Separation

The most critical invariant in the system. Mock inspection outputs **never** appear in regulatory history.

Enforcement layers:
1. **`origin` field:** `SYSTEM_MOCK` | `OFFICIAL_INSPECTOR` | `PROVIDER_SELF_REPORTED`
2. **`reporting_domain` field:** `PREVIEW` (mock) | `REGULATORY_HISTORY` (official)
3. **Domain layer:** `createInspectionFinding()` throws `MockContaminationError` if `SYSTEM_MOCK` finding targets `REGULATORY_HISTORY`
4. **Export guard:** `validateExportSafety()` blocks non-mock findings from mock exports; throws `RegulatoryHistoryExportError`
5. **UI:** mock screens show red frame + "SIMULATION (MOCK) — NOT REGULATORY HISTORY" watermark
6. **E2E tests:** `apps/web/e2e/mock-safety.spec.ts` verifies visual safety guarantees

### 4.5 AI Containment

AI is **advisory only** — it cannot modify authoritative data, bypass validation, or auto-publish findings.

Rules:
- No free-text prompts in config — Topic Catalog uses IDs only
- User input never re-injected as instructions
- Mock inspections have bounded follow-up limits per topic
- AI responses never auto-publish findings
- AI cannot escalate privileges

---

## 5. Key Domain Concepts

### PRS (Provider Regulatory State)

Lifecycle-aware context that adjusts inspection rigor and severity scoring:

| PRS State | Severity Multiplier | Max Follow-ups | Question Mode | Attention Threshold |
|-----------|---------------------|----------------|---------------|---------------------|
| NEW_PROVIDER | 1.0× | 4 | Evidence First | 14 days |
| ESTABLISHED | 1.0× | 4 | Evidence First | 14 days |
| RATING_REQUIRES_IMPROVEMENT | 1.2× | 5 | Narrative First | 10 days |
| RATING_INADEQUATE | 1.3× | 5 | Contradiction Hunt | 7 days |
| ENFORCEMENT_ACTION | 1.3× | 5 | Contradiction Hunt | 7 days |
| SPECIAL_MEASURES | 1.5× | 5 | Contradiction Hunt | 7 days |
| REOPENED_SERVICE | 1.2× | 5 | Narrative First | 10 days |
| MERGED_SERVICE | 1.0× | 4 | Evidence First | 14 days |

Composite risk score: `impact × likelihood × PRS multiplier`

### Topic Catalog

Bounded inspection topics with regulation scope selectors, evidence hunt profiles, and question plans. Versioned artifacts (e.g., `topic-catalog.v1.json`) — once published, immutable. 34 CQC-mapped topics across 5 Key Questions (Safe S1-S9, Effective E1-E9, Caring C1-C4, Responsive R1-R4, Well-Led W1-W8).

Question modes:
- **Evidence First** — collects evidence before probing
- **Narrative First** — explanation before evidence
- **Contradiction Hunt** — probes inconsistencies between stated policy and actual practice

### SAF34 — CQC Single Assessment Framework

34 Quality Statements across 5 Key Questions. Evidence maps to quality statements via two tiers:
- **Tier 1:** AI-verified SAF ratings from document audit (high confidence)
- **Tier 2:** Evidence type heuristic fallback (e.g., TRAINING → S6/E8/W6; CARE_PLAN → E1/R1/C2/E6)

### Reporting Domains

- **PREVIEW** — mock inspection outputs, never in regulatory history
- **REGULATORY_HISTORY** — official inspector findings only

### Blue Ocean Reports (Phase 11)

PhD-level analyst reports requiring ≥95% completeness across:
- **Section coverage:** 13/13 mandatory sections present
- **Evidence coverage:** every finding linked to ≥1 evidence item
- **SMART action completeness:** every action has owner + deadline + acceptance criteria + verification method
- **RCA quality:** every CRITICAL/HIGH finding has ≥2 hypotheses with disconfirming tests

Two variants:
- **BLUE_OCEAN_BOARD** — governance committees, summary-focused
- **BLUE_OCEAN_AUDIT** — compliance teams/auditors, includes full RCA, evidence index with hash verification, data lineage

13 mandatory sections: Executive Summary, Scope & Context, Findings Overview, Major Findings, Evidence Index, Root Cause Analysis, Contributing Factors, Evidence Readiness, Remediation Plan, Risk Outlook, Regulatory Mapping, Quality Gates, Data Lineage.

---

## 6. Domain Package — Key Files

```
packages/domain/src/
├── inspection-finding.ts       # InspectionFinding creation, MockContaminationError
├── evidence.ts                 # EvidenceBlob (content-addressed) + EvidenceRecord (metadata)
├── evidence-types.ts           # 44 recognized evidence types
├── action.ts                   # Remediation state machine with verification
├── provider-context-snapshot.ts # Time-frozen provider state
├── regulation-policy-link.ts   # Edge-hashed regulation-to-policy mapping
├── mock-inspection-engine.ts   # Stateful session, bounded questioning
├── topic-catalog.ts            # Topic catalog, versioned, immutable
├── prs-logic-profile.ts        # PRS severity/rigor rules
├── finding-generator.ts        # Finding generation from mock sessions
├── saf34.ts                    # SAF 34 Quality Statement mappings
├── drift-detector.ts           # Regulatory change detection
├── impact-assessment.ts        # Policy impact assessment
├── cqc-intelligence.ts         # CQC peer monitoring, RISK/OUTSTANDING signals
├── cqc-client.ts               # CQC public API client
├── cqc-scraper.ts              # CQC website scraper for latest reports
├── readiness-export.ts         # CSV/PDF export, validateExportSafety()
├── blue-ocean-report.ts        # Blue Ocean report generation
├── provider-outputs.ts         # Inspection Confidence Report, Risk Register
├── facility.ts                 # Facility domain model
├── facility-context.ts         # Service-type-aware topic selection
├── service-type-topics.ts      # Which topics apply to which service types
└── policy-intelligence.ts      # Policy impact assessment, edge migrations
```

---

## 7. API — Endpoints

Express server at `apps/api/src/app.ts`, port 3001.

### Provider & Facility
```
GET    /v1/providers
POST   /v1/providers
GET    /v1/providers/:providerId/dashboard
GET    /v1/providers/:providerId/facilities
POST   /v1/facilities/onboard              # Single facility onboarding with CQC enrichment
POST   /v1/facilities/onboard-bulk         # Bulk onboarding (up to 50)
GET    /v1/facilities/:facilityId
GET    /v1/facilities/:facilityId/evidence
POST   /v1/facilities/:facilityId/evidence
POST   /v1/facilities/:facilityId/sync-latest-report   # Async CQC report scraping
```

### Mock Inspection Sessions
```
GET    /v1/providers/:providerId/mock-sessions
POST   /v1/providers/:providerId/mock-sessions
GET    /v1/providers/:providerId/mock-sessions/:sessionId
POST   /v1/providers/:providerId/mock-sessions/:sessionId/answer
POST   /v1/providers/:providerId/mock-sessions/:sessionId/complete
```

### Topics & Overview
```
GET    /v1/providers/:providerId/topics
GET    /v1/providers/:providerId/topics/:topicId
GET    /v1/providers/:providerId/overview
```

### Exports
```
GET    /v1/providers/:providerId/exports
POST   /v1/providers/:providerId/exports           # CSV, PDF, BLUE_OCEAN_BOARD, BLUE_OCEAN_AUDIT
GET    /v1/providers/:providerId/exports/:exportId
```

### Evidence Blobs
```
POST   /v1/evidence/blobs         # Content-addressed blob upload
GET    /v1/evidence/blobs/:hash   # Download by SHA-256 hash
```

### Background Jobs
```
GET    /api/background-jobs/:jobId
```

### Webhooks
```
POST   /api/webhooks/clerk        # Clerk auth webhook
```

---

## 8. API — Key Source Files

```
apps/api/src/
├── app.ts              # Express app, all route registration
├── server.ts           # Server startup, port binding
├── auth.ts             # Dual-mode auth: Clerk JWTs + legacy tokens
├── db-store.ts         # Prisma database operations
├── store.ts            # In-memory store (dev/test fallback)
├── metadata.ts         # buildConstitutionalMetadata() — provenance on every response
├── blob-storage.ts     # Content-addressed filesystem blob store
├── document-auditor.ts # AI document audit against SAF using Gemini
├── audit-worker.ts     # BullMQ background worker for document audits
├── trigger-audit.ts    # Queue a document audit job
├── malware-scanner.ts  # ClamAV integration
└── webhooks/clerk.ts   # Clerk webhook handler
```

### Database Schema (Prisma)

Key models in `apps/api/prisma/schema.prisma`:
- `ProviderContextSnapshot` — time-frozen provider state for temporal safety
- `MockInspectionSession` — session lifecycle and state
- `SessionEvent` — append-only event log for mock session
- `DraftFinding` — session-scoped findings that never touch regulatory record
- `Finding` — official regulatory findings
- `EvidenceBlob` — content-addressed storage record
- `EvidenceRecord` — metadata linking blob to provider/facility
- `AuditEvent` — hash-chained audit log (immutable, append-only)

---

## 9. Web App — UI Routes

Next.js 14 app at `apps/web/`, port 3000.

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/providers` | Provider list |
| `/dashboard` | Provider dashboard |
| `/facilities` | Facility list |
| `/facilities/[facilityId]` | Facility detail + evidence upload |
| `/topics` | Topic catalog view |
| `/topics/[topicId]` | Topic detail |
| `/mock-session` | Mock inspection session |
| `/evidence` | Evidence management |
| `/exports` | Report exports (CSV, PDF, Blue Ocean) |
| `/audit-trail` | Audit log viewer |

### Authentication

Dual-mode (`apps/web/middleware.ts`):
1. **Clerk JWTs** — production auth via `@clerk/express`
2. **Legacy tokens** — `FOUNDER_TOKEN` / `PROVIDER_TOKEN` for dev/test; bypassed when `E2E_TEST_MODE=true`

Two roles:
- **FOUNDER** — can override tenant via `x-tenant-id` header
- **PROVIDER** — locked to own tenant

---

## 10. Testing

### Two Vitest Configs

1. **Root** (`vitest.config.ts`) — covers `packages/**`, `scripts/**`, `apps/web/**`. Excludes `apps/api/src/**`.
2. **API** (`apps/api/vitest.config.ts`) — covers `apps/api/src/**/*.test.ts` only.

### Commands

```bash
pnpm test                                    # Root: packages, scripts, web unit tests
cd apps/api && pnpm test                     # API unit tests
cd apps/api && pnpm test:integration         # Integration tests (needs Postgres)
pnpm gate                                    # Phase gate validation
pnpm gate --strict                           # CI mode: SKIP = failure
pnpm playwright                              # E2E tests (needs both servers running)
```

### E2E Test Suites (Playwright)

Located in `apps/web/e2e/`:
- `constitutional-requirements.spec.ts` — UI constitutional compliance
- `mock-safety.spec.ts` — mock inspection visual safety guarantees (watermark, red frame, no regulatory leakage)
- `progressive-disclosure.spec.ts` — 3-layer progressive disclosure (Summary → Evidence → Trace)
- `founder_full_journey.spec.ts` — complete founder workflow
- `pipeline-end-to-end.spec.ts` — full inspection pipeline
- `facility-cqc-pdf.spec.ts` — PDF export validation

### Phase Gate Tests

Pattern: `<phase>:<gate>`. Run all: `pnpm gate`. Run one: `pnpm vitest run -t "<phase>:<gate>"`.

Phase 10 UI gates must run from `apps/web`: `cd apps/web && pnpm vitest run -t "ui:<gate>"`.

---

## 11. CI Pipeline

Five parallel GitHub Actions jobs (`.github/workflows/ci.yml`):

1. **version-immutability** — validates versioned artifacts are frozen
2. **tests** — root `pnpm test` (packages, scripts, web unit tests)
3. **integration-db** — Postgres-based RLS and API integration tests
4. **phase-gates** — `pnpm gate --strict`
5. **playwright** — E2E tests

---

## 12. Infrastructure Dependencies

| Dependency | Purpose | Fallback |
|-----------|---------|---------|
| PostgreSQL | Primary data store with RLS | None |
| Redis + BullMQ | Background job queues | In-memory (`FORCE_IN_MEMORY_QUEUE=true`) |
| ClamAV | Virus scanning for evidence uploads | Disabled (`CLAMAV_ENABLED=false`) |
| Tesseract | OCR for evidence document processing | Disabled (`TESSERACT_ENABLED=false`) |
| Gemini AI | Advisory document audit (never authoritative) | Disabled (`ENABLE_AI_INSIGHTS=false`) |
| Clerk | Production auth (JWTs) | Legacy tokens (dev) |

---

## 13. Version Immutability

Once a versioned artifact (e.g., `topic-catalog.v1.json`) is published, it **cannot be modified**. Changes require new versions (v2, v3). Enforced by `pnpm validate:versions` in CI.

See `docs/VERSION_IMMUTABILITY.md` for full rules.

---

## 14. Constitutional Metadata

Every API response includes metadata built by `buildConstitutionalMetadata()` in `apps/api/src/metadata.ts`:
- Topic catalog version + hash
- PRS logic profiles version + hash
- Report source
- Snapshot details
- Watermarks (mock vs regulatory)
- Reporting domain

---

## 15. Code Quality Rules (What NOT to Do)

- No AI in production decision-making — advisory only, never authoritative
- No timestamps in hashes — deterministic inputs only
- No UUIDs — use scoped keys (`tenantId:resourceId`)
- No soft deletes — deprecate and version instead
- No application-layer tenant filtering — use DB-level RLS
- No free-text prompts in config — use IDs and versioned catalogs
- No retroactive judgment — always reference `ProviderContextSnapshot(as_of)`
- No mutation — create new versions with distinct IDs
- NEVER modify existing versioned files — create new versions

---

## 16. Key Documents

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Instructions for Claude Code when working in this repo |
| `.regintel/current_phase.txt` | Current development phase |
| `docs/REGINTEL_PHASE_GATES.yml` | Machine-enforced phase gate definitions |
| `docs/FEATURE_MAP.md` | Source of truth for UI routes and API endpoint mappings |
| `docs/REGINTELIA_CAPABILITIES.md` | Full product capabilities and competitive positioning |
| `docs/VERSION_IMMUTABILITY.md` | Version immutability rules |
| `docs/CLERK_SETUP.md` | Clerk authentication setup |
| `docs/BLOB_STORAGE.md` | Evidence blob storage system |
| `docs/PRODUCTION_SECURITY_CHECKLIST.md` | Production deployment security requirements |
| `scripts/gate.ts` | Phase gate runner |
| `apps/api/prisma/schema.prisma` | Database schema |
