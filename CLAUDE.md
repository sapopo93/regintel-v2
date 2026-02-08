# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RegIntel v2 is a regulatory compliance platform for UK CQC-registered care providers. It helps providers prove inspection readiness with evidence before inspectors arrive. The system focuses on evidence-based compliance rather than checklist theatre.

**Current Phase:** Phase 11 (Blue Ocean) per `.regintel/current_phase.txt`

## Build & Test Commands

```bash
pnpm install                      # Install dependencies
pnpm test                         # Run all tests via Vitest (excludes apps/api — see below)
pnpm gate                         # Run phase gate validation for current phase
pnpm gate --strict                # CI mode: SKIP treated as failure
pnpm validate:versions            # Validate version immutability rules
pnpm api:dev                      # Start API dev server (localhost:3001)
pnpm web:dev                      # Start web UI dev server (localhost:3000)
pnpm worker:dev                   # Start worker service (BullMQ consumers)
pnpm playwright                   # Run Playwright E2E tests (requires API + Web servers)
```

### Running Specific Tests

```bash
# Run single test file (root vitest — covers packages/*, scripts/*, apps/web/*)
pnpm vitest run packages/security/src/tenant.test.ts

# Run tests matching pattern
pnpm vitest run -t "security:tenant"

# Watch mode
pnpm vitest watch

# API tests (separate vitest config — must run from apps/api)
cd apps/api && pnpm test                                  # All API unit tests
cd apps/api && pnpm test:integration                      # Integration tests (needs Postgres)

# API-specific scripts
cd apps/api && pnpm db:generate                           # Generate Prisma client
cd apps/api && pnpm db:migrate                            # Run Prisma migrations

# Web tests
cd apps/web && pnpm test                                  # Web unit tests
cd apps/web && pnpm test:e2e                              # Playwright E2E tests
cd apps/web && pnpm test:e2e --ui                         # Playwright with UI
```

**Important:** The root `pnpm test` excludes `apps/api/src/**` — API tests have their own vitest config and must be run separately via `cd apps/api && pnpm test`.

### Phase Gate Tests

Test names follow the pattern `<phase>:<gate>`. All phases 0-11 have gate tests:

```bash
# Phase 0: Foundations
pnpm vitest run -t "security:tenant"
pnpm vitest run -t "audit:chain"
pnpm vitest run -t "security:secrets"

# Phase 1: The Spine
pnpm vitest run -t "spine:no-orphans"
pnpm vitest run -t "spine:mock-separation"
pnpm vitest run -t "spine:hashes"

# Phase 2: Drift Engine
pnpm vitest run -t "drift:cosmetic"
pnpm vitest run -t "drift:normative"
pnpm vitest run -t "drift:determinism"

# Phase 3: Policy Intelligence
pnpm vitest run -t "policy-intel:edges"
pnpm vitest run -t "policy-intel:migrations"

# Phase 4: PRS Logic Profiles
pnpm vitest run -t "logic:determinism"
pnpm vitest run -t "logic:interaction-hash"

# Phase 5: Mock Inspection Engine
pnpm vitest run -t "mock:limits"
pnpm vitest run -t "mock:replay"
pnpm vitest run -t "mock:safety"

# Phase 6: Topic Catalog
pnpm vitest run -t "topics:scope"
pnpm vitest run -t "topics:evidence"

# Phase 7: Provider Outputs
pnpm vitest run -t "outputs:purity"

# Phase 9e: Readiness Export
pnpm vitest run -t "ux:report_export"

# Phase 10: Forensic UI (run from apps/web)
cd apps/web && pnpm vitest run -t "ui:constitutional"
cd apps/web && pnpm vitest run -t "ui:mock-safety"
cd apps/web && pnpm vitest run -t "ui:projection-purity"
cd apps/web && pnpm vitest run -t "ui:disclosure"
cd apps/web && pnpm vitest run -t "ui:no-interpretation"

# Phase 11: Blue Ocean Reports
pnpm vitest run -t "blue-ocean:completeness"
pnpm vitest run -t "blue-ocean:rca"
pnpm vitest run -t "blue-ocean:smart-actions"
pnpm vitest run -t "blue-ocean:golden"
```

**CI Strict Mode:** When `CI=true`, SKIP results are treated as failures. All tests must explicitly PASS.

**E2E Testing:** Playwright tests in `apps/web/e2e/` automatically start both API and Web servers. Key test suites:
- `constitutional-requirements.spec.ts` — UI constitutional compliance
- `mock-safety.spec.ts` — Mock inspection visual safety guarantees
- `progressive-disclosure.spec.ts` — Progressive disclosure patterns
- `founder_full_journey.spec.ts` — Complete founder workflow
- `pipeline-end-to-end.spec.ts` — Full inspection pipeline
- `facility-cqc-pdf.spec.ts` — PDF export validation

## Environment Variables

The root `.env` file contains all required variables. Authentication is migrating from legacy tokens to Clerk:

```bash
# Clerk Authentication (production auth — see docs/CLERK_SETUP.md)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Legacy tokens (DEPRECATED — still used by E2E tests and dev)
FOUNDER_TOKEN=demo-founder-token-12345
PROVIDER_TOKEN=demo-provider-token-12345

# API
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
TENANT_ID=demo
PORT=3001

# Database (required for integration tests and API)
DATABASE_URL=postgres://localhost:5432/regintel_dev

# CQC API (optional — unauthenticated works with lower rate limits)
CQC_API_KEY=your-cqc-api-key-here

# Blob Storage
BLOB_STORAGE_PATH=/var/regintel/evidence-blobs

# E2E test mode — bypasses Clerk middleware when true
E2E_TEST_MODE=true
```

## Architecture

### Test Configuration (Two Vitest Configs)

The repo has **two separate vitest configurations**:

1. **Root** (`vitest.config.ts`) — Runs `scripts/**`, `packages/**`, `apps/web/**` tests. **Excludes `apps/api/src/**`**.
2. **API** (`apps/api/vitest.config.ts`) — Runs only `apps/api/src/**/*.test.ts`. Has its own path aliases.

Both define `@regintel/domain` and `@regintel/security` aliases pointing to the package source directories.

### Authentication: Dual-Mode (Clerk + Legacy Tokens)

The API supports two auth mechanisms simultaneously (`apps/api/src/auth.ts`):

1. **Legacy tokens** — `FOUNDER_TOKEN` / `PROVIDER_TOKEN` checked first. Used in dev/test.
2. **Clerk JWTs** — Verified via `@clerk/express` when `CLERK_SECRET_KEY` is set. Production auth.

Two roles: `FOUNDER` (can override tenant via `x-tenant-id` header) and `PROVIDER` (locked to own tenant).

The web app middleware (`apps/web/middleware.ts`) can bypass Clerk entirely when `E2E_TEST_MODE=true` or `CLERK_SECRET_KEY` is not set, allowing Playwright tests to run without Clerk.

### Phased Development Model

The system enforces **strict sequential phase progression** (Phase 0-11). Each phase defines:
- **Must Exist:** Required components before advancing
- **Must NOT Exist:** Forbidden components (prevents scope creep)
- **Gate Criteria:** CI-enforced tests that must pass (`docs/REGINTEL_PHASE_GATES.yml`)

**Critical Rule:** Later phases cannot backfill incomplete earlier phases. If a feature cannot name its phase, it does not belong in RegIntel.

**Current Phase Tracking:** `.regintel/current_phase.txt` contains the active phase name.

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Foundations: Multi-tenant isolation, RBAC, immutable audit log, secrets management | Complete |
| 1 | The Spine: Core domain model (Regulation → Policy → Finding → Evidence → Action) | Complete |
| 2 | Drift Engine: Regulatory change detection, normativity scoring | Complete |
| 3 | Policy Intelligence: Impact assessment, non-destructive edge migrations | Complete |
| 4 | PRS Logic Profiles: Deterministic severity/rigor rules | Complete |
| 5 | Mock Inspection Engine: Stateful sessions, bounded questioning | Complete |
| 6 | Topic Catalog: Relevance control, evidence alignment | Complete |
| 7 | Provider Outputs: Inspection Confidence Report, Risk Register, Evidence Matrix | Complete |
| 8 | Integration Slice: Minimal vertical slice across DB, API, audit | Complete |
| 9e | Readiness Export: CSV/PDF export for mock inspection results | Complete |
| 10 | Forensic UI: Constitutional requirements, mock safety, progressive disclosure | Complete |
| 11 | Blue Ocean Reports: PhD-level analyst output with RCA, SMART actions, ≥95% completeness | In Progress |

### Core Domain Model ("The Spine")

Immutable, hash-linked chain: **Regulation → RegulationPolicyLink → Policy → InspectionFinding → Evidence → Action**

- **Regulation** — versioned, section-level regulatory text (immutable)
- **Policy** — provider policies, versioned, clause-level (immutable)
- **RegulationPolicyLink** — edge-hashed mapping (immutable, deprecated not deleted)
- **ProviderContextSnapshot** — time-frozen provider state for temporal safety
- **InspectionFinding** — with `origin`/`reporting_domain` separation (mock vs regulatory)
- **Evidence** — two-layer model: EvidenceBlob (content-addressed) + EvidenceRecord (metadata)
- **Action** — remediation state machine with verification

### Key Invariants

1. **Regulatory vs Mock Separation:** Mock inspection outputs NEVER appear in regulatory history. Enforced via `origin` (SYSTEM_MOCK/OFFICIAL_INSPECTOR) and `reporting_domain` (PREVIEW/REGULATORY_HISTORY) fields.

2. **Temporal Safety:** All evaluations reference immutable `ProviderContextSnapshot(as_of)`. No retroactive judgment.

3. **Immutability:** Regulation, Policy, RegulationPolicyLink, InspectionFinding, EvidenceBlob, ActionVerification are immutable. Mutations create new versions with distinct IDs.

4. **Hash-Chained Audit:** All state changes append to audit log with `previous_event_hash` for tamper detection.

5. **Determinism:** Same inputs must always produce same outputs (hashes, classifications, scores). No timestamps, UUIDs, or randomness in canonical hashes.

6. **Version Immutability:** Once a versioned artifact (e.g., `topic-catalog.v1.json`) is published, it CANNOT be modified. Changes require new versions (v2, v3). Enforced by `pnpm validate:versions`.

7. **Constitutional Metadata:** Every API response includes metadata built by `buildConstitutionalMetadata()` in `apps/api/src/metadata.ts` — topic catalog version/hash, PRS logic profiles version/hash, report source, snapshot details, watermarks.

### AI Containment

- AI cannot modify authoritative data directly
- AI cannot bypass validation or escalate privileges
- No free-text prompts in config — Topic catalog uses IDs only
- User input never re-injected as instructions
- Mock inspections have bounded follow-up limits per topic
- AI responses are advisory only; they never auto-publish findings

### Multi-Tenancy

- Row-Level Security (RLS) enforced at DB layer (not application layer)
- Tenant-scoped primary keys: `tenantId:resourceId` format
- Cross-tenant access blocked by `TenantBoundaryViolationError`
- FOUNDER role can override tenant via `x-tenant-id` header; PROVIDER role is locked to own tenant

### Monorepo Structure

```
packages/
  security/       - Phase 0: Tenant isolation, audit log, secrets scanning
  domain/         - Phases 1-11: Core domain models and business logic
  queue/          - BullMQ job queue infrastructure with Redis/in-memory fallback
  ai-validation/  - AI output validation framework (zero hallucination tolerance)
  ai-workers/     - Gemini AI integration with containment (sanitization, bounds checking)
  storage/        - Blob storage abstraction
  cqc-ingestion/  - CQC API integration and report parsing
apps/
  api/            - Phase 8+: Express API server with Prisma ORM
  web/            - Phase 10+: Next.js 14 UI with Clerk auth
services/
  worker/         - Dedicated BullMQ worker service (malware scan, OCR, AI processing)
scripts/          - Build and validation scripts (gate.ts, validate-version-immutability.ts)
docs/             - Governance documents and phase plans
.regintel/        - Phase tracking (current_phase.txt)
```

Path aliases: `@regintel/domain` → `packages/domain/src`, `@regintel/security` → `packages/security/src`.

### Background Job System (packages/queue + services/worker)

BullMQ-based job queue with Redis backend and in-memory fallback for development:

**Queue Names:**
- `scrape-report` - CQC report scraping
- `malware-scan` - ClamAV virus scanning
- `evidence-process` - Tesseract OCR + text extraction
- `ai-evidence-analysis` - Gemini evidence analysis
- `ai-policy-generation` - Gemini policy generation
- `ai-mock-insight` - Gemini mock inspection insights

**Worker Service:** `services/worker/src/index.ts` runs all 6 workers. Start with `pnpm worker:dev`.

**Environment Variables:**
```bash
REDIS_URL=redis://localhost:6379      # Redis connection
GEMINI_API_KEY=xxx                    # Gemini API key
GEMINI_MODEL_ID=gemini-2.0-flash      # Model to use
AI_CONFIDENCE_THRESHOLD=0.7           # Minimum confidence for AI outputs
CLAMD_SOCKET=/var/run/clamav/clamd.ctl # ClamAV socket
```

### AI Validation Framework (packages/ai-validation)

**Critical Design Principle:** "AI generates, Rules validate, Engine decides"

All AI outputs pass through `ValidationEngine` with rules:
- `noHallucinatedRegulationsRule` - Only allows Reg 9-20 (CQC regulations)
- `noComplianceAssertionsRule` - AI cannot claim "compliant/non-compliant"
- `noRatingPredictionsRule` - AI cannot predict CQC ratings
- `noInspectionGuaranteesRule` - AI cannot guarantee outcomes
- `confidenceConsistencyRule` - Detects hedging language inconsistency

When validation fails, deterministic fallback templates are used (`template-fallback.ts`).

### CI Pipeline (`.github/workflows/ci.yml`)

Five parallel jobs:
1. **version-immutability** — Validates versioned artifacts are frozen
2. **tests** — Runs root `pnpm test` (packages, scripts, web unit tests)
3. **integration-db** — Postgres-based RLS and API integration tests
4. **phase-gates** — Runs `pnpm gate --strict`
5. **playwright** — E2E tests

### API Endpoints (apps/api/src/app.ts)

Key endpoint groups:
- `/v1/providers/:providerId/mock-sessions` — Mock inspection session lifecycle
- `/v1/providers/:providerId/exports` — Report exports (CSV, PDF, Blue Ocean)
- `/v1/facilities/onboard` — Single facility onboarding with CQC enrichment
- `/v1/facilities/onboard-bulk` — Bulk onboarding (up to 50)
- `/v1/facilities/:facilityId/sync-latest-report` — Async CQC report scraping
- `/v1/evidence/blobs` — Content-addressed evidence blob upload/download
- `/v1/evidence/blobs/:blobHash/scan` — Malware scan status
- `/v1/background-jobs/:jobId` — Background job status
- `/v1/providers/:id/mock-sessions/:id/ai-insights` — AI advisory insights (not authoritative)
- `/api/webhooks/clerk` — Clerk webhook handler

### Database (apps/api/prisma/schema.prisma)

Prisma ORM with PostgreSQL. Key models: `ProviderContextSnapshot`, `MockInspectionSession`, `SessionEvent`, `DraftFinding`, `Finding`, `EvidenceBlob`, `EvidenceRecord`, `AuditEvent`. RLS enforced at DB layer.

## Key Files

| File | Purpose |
|------|---------|
| `.regintel/current_phase.txt` | Current development phase (machine-readable) |
| `docs/REGINTEL_PHASE_GATES.yml` | Machine-enforced phase gate definitions |
| `docs/VERSION_IMMUTABILITY.md` | Version immutability rules and workflow |
| `docs/FEATURE_MAP.md` | Source of truth for UI routes and API endpoint mappings |
| `docs/CLERK_SETUP.md` | Clerk authentication setup guide |
| `docs/BLOB_STORAGE.md` | Evidence blob storage system documentation |
| `docs/PRODUCTION_SECURITY_CHECKLIST.md` | Production deployment security requirements |
| `scripts/gate.ts` | Phase gate runner implementation |
| `vitest.config.ts` | Root test config (excludes apps/api) |
| `apps/api/vitest.config.ts` | API-specific test config |

## Domain Concepts

**PRS (Provider Regulatory State):** Lifecycle-aware context (NEW_PROVIDER, SPECIAL_MEASURES, ENFORCEMENT_ACTION, RATING_INADEQUATE, etc.) that affects inspection rigor and severity scoring.

**Topic Catalog:** Bounded inspection topics with regulation scope selectors, evidence hunt profiles, and question plans. Topics use IDs, not prompt strings. Question modes: `evidence_first`, `narrative_first`, `contradiction_hunt`. Versioned artifacts ensure reproducibility.

**Domains:** CQC (Care Quality Commission) and IMMIGRATION. Disabled domains produce zero findings/actions.

**Reporting Domains:** PREVIEW (mock — never in regulatory history) vs REGULATORY_HISTORY (official).

**Origin Tracking:** Every finding records its origin (SYSTEM_MOCK, OFFICIAL_INSPECTOR, PROVIDER_SELF_REPORTED).

**Blue Ocean Reports (Phase 11):** PhD-level analyst output requiring ≥95% completeness across section coverage (13/13 sections), evidence coverage, SMART action completeness (owner, deadline, acceptance criteria, verification), and RCA quality (≥2 hypotheses per critical/high finding with disconfirming tests).

**Export Formats:** CSV, PDF (mock inspections), BLUE_OCEAN_BOARD, BLUE_OCEAN_AUDIT (both real and mock, markdown-based).

## Code Quality Rules

- **No AI in production logic:** AI is advisory only, never authoritative
- **No timestamps in hashes:** Use deterministic inputs only
- **No UUIDs:** Use scoped keys (`tenantId:resourceId`)
- **No soft deletes:** Deprecate and version instead
- **No application-layer tenant filtering:** Use DB-level RLS
- **No free-text prompts in config:** Use IDs and versioned catalogs
- **No retroactive judgment:** Always reference `ProviderContextSnapshot(as_of)`
- **No mutation:** Create new versions with distinct IDs
- **NEVER modify existing versioned files** (e.g., `*.v1.json`) — create new versions instead
