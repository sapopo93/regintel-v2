# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RegIntel v2 is a regulatory compliance platform for UK CQC-registered care providers. It helps providers prove inspection readiness with evidence before inspectors arrive. The system focuses on evidence-based compliance rather than checklist theatre.

**Current Phase:** Phase 10 (UI) per `.regintel/current_phase.txt`

**Test Status:** 295 tests passing (21 test files: domain, security, backend, UI, scripts)

## Build & Test Commands

```bash
pnpm install                      # Install dependencies
pnpm test                         # Run all tests via Vitest
pnpm gate                         # Run phase gate validation for current phase
pnpm gate --strict                # CI mode: SKIP treated as failure
pnpm validate:versions            # Validate version immutability rules
pnpm api:dev                      # Start API dev server (localhost:3001)
pnpm web:dev                      # Start web UI dev server (localhost:3000)
pnpm playwright                   # Run Playwright E2E tests (requires API + Web servers)
```

### Running Specific Tests

```bash
# Run single test file
pnpm vitest run packages/security/src/tenant.test.ts

# Run tests matching pattern
pnpm vitest run -t "security:tenant"
pnpm vitest run -t "audit:chain"
pnpm vitest run -t "spine:no-orphans"

# Watch mode for development
pnpm vitest watch

# End-to-end tests (Playwright)
cd apps/web && pnpm test:e2e              # Run all E2E tests
cd apps/web && pnpm test:e2e --ui         # Run with Playwright UI
cd apps/web && pnpm test:e2e --debug      # Run in debug mode
```

### Phase Gate Tests

Test names follow the pattern `<phase>:<gate>`. All phases 0-10 have passing gates:

```bash
pnpm vitest run -t "security:tenant"       # Phase 0: Tenant isolation
pnpm vitest run -t "audit:chain"           # Phase 0: Hash-chain verification
pnpm vitest run -t "security:secrets"      # Phase 0: Secrets scan
pnpm vitest run -t "spine:no-orphans"      # Phase 1: Domain model integrity
pnpm vitest run -t "spine:mock-separation" # Phase 1: Regulatory/mock separation
pnpm vitest run -t "spine:hashes"          # Phase 1: Hash determinism
pnpm vitest run -t "drift:cosmetic"        # Phase 2: Cosmetic change detection
pnpm vitest run -t "drift:normative"       # Phase 2: Normative change detection
pnpm vitest run -t "drift:determinism"     # Phase 2: Drift determinism
pnpm vitest run -t "policy-intel:edges"    # Phase 3: Non-destructive edge management
pnpm vitest run -t "policy-intel:migrations" # Phase 3: Migration recommendations
pnpm vitest run -t "logic:determinism"     # Phase 4: Logic profile determinism
pnpm vitest run -t "logic:interaction-hash" # Phase 4: Interaction hash stability
pnpm vitest run -t "mock:limits"           # Phase 5: Follow-up limits enforcement
pnpm vitest run -t "mock:replay"           # Phase 5: Event replay determinism
pnpm vitest run -t "mock:safety"           # Phase 5: Mock safety guarantees
pnpm vitest run -t "topics:scope"          # Phase 6: Topic regulation scope validation
pnpm vitest run -t "topics:evidence"       # Phase 6: Evidence alignment
pnpm vitest run -t "outputs:purity"        # Phase 7: Output purity validation
pnpm vitest run -t "ux:report_export"      # Phase 9e: Readiness export (CSV/PDF)
cd apps/web && pnpm vitest run -t "ui:constitutional"    # Phase 10: Constitutional UI requirements
cd apps/web && pnpm vitest run -t "ui:mock-safety"       # Phase 10: Mock inspection visual safety
cd apps/web && pnpm vitest run -t "ui:projection-purity" # Phase 10: No business logic in UI
cd apps/web && pnpm vitest run -t "ui:disclosure"        # Phase 10: Progressive disclosure
cd apps/web && pnpm vitest run -t "ui:no-interpretation" # Phase 10: Facts only, no interpretation
```

**CI Strict Mode:** When `CI=true`, SKIP results are treated as failures. All tests must explicitly PASS.

**E2E Testing:** Playwright tests in `apps/web/e2e/` validate constitutional UI requirements, mock inspection safety, progressive disclosure, and end-to-end user journeys. Tests automatically start both API (localhost:3001) and Web (localhost:3000) servers. Key test suites:
- `constitutional-requirements.spec.ts` - UI constitutional compliance
- `mock-safety.spec.ts` - Mock inspection visual safety guarantees
- `progressive-disclosure.spec.ts` - Progressive disclosure patterns
- `founder_full_journey.spec.ts` - Complete founder workflow
- `pipeline-end-to-end.spec.ts` - Full inspection pipeline
- `facility-cqc-pdf.spec.ts` - PDF export validation

## Environment Variables

Required environment variables are defined in `.env`:

```bash
# API Authentication Tokens
FOUNDER_TOKEN=demo-founder-token-12345
PROVIDER_TOKEN=demo-provider-token-12345

# Web App Configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_FOUNDER_TOKEN=demo-founder-token-12345
NEXT_PUBLIC_PROVIDER_TOKEN=demo-provider-token-12345

# CQC API Integration (Phase 10: Facility Onboarding)
CQC_API_KEY=your-cqc-api-key-here
```

**CQC API Key:** Obtain from [CQC Developer Portal](https://www.cqc.org.uk/about-us/transparency/using-cqc-data). The API key provides:
- Better rate limits (60 req/min vs 10 req/min public)
- Authenticated access to CQC location data
- Priority API access during high load

See [docs/TESTING_CQC_ONBOARDING.md](docs/TESTING_CQC_ONBOARDING.md) for testing facility onboarding with real CQC data.

## Architecture

### Phased Development Model

The system enforces **strict sequential phase progression** (Phase 0-9e). Each phase defines:
- **Must Exist:** Required components before advancing
- **Must NOT Exist:** Forbidden components (prevents scope creep)
- **Gate Criteria:** CI-enforced tests that must pass (`docs/REGINTEL_PHASE_GATES.yml`)

**Critical Rule:** Later phases cannot backfill incomplete earlier phases. If a feature cannot name its phase, it does not belong in RegIntel.

**Current Phase Tracking:** `.regintel/current_phase.txt` contains the active phase name (e.g., `phase9e_export`).

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Foundations: Multi-tenant isolation, RBAC, immutable audit log, secrets management | ✅ **COMPLETE** |
| 1 | The Spine: Core domain model (Regulation → Policy → Finding → Evidence → Action) | ✅ **COMPLETE** |
| 2 | Drift Engine: Regulatory change detection, normativity scoring | ✅ **COMPLETE** |
| 3 | Policy Intelligence: Impact assessment, non-destructive edge migrations | ✅ **COMPLETE** |
| 4 | PRS Logic Profiles: Deterministic severity/rigor rules | ✅ **COMPLETE** |
| 5 | Mock Inspection Engine: Stateful sessions, bounded questioning | ✅ **COMPLETE** |
| 6 | Topic Catalog: Relevance control, evidence alignment | ✅ **COMPLETE** |
| 7 | Provider Outputs: Inspection Confidence Report, Risk Register, Evidence Matrix | ✅ **COMPLETE** |
| 8 | Integration Slice: Minimal vertical slice across DB, API, audit | ✅ **COMPLETE** |
| 9e | Readiness Export: CSV/PDF export for mock inspection results | ✅ **COMPLETE** |
| 10 | Forensic UI: Constitutional requirements, mock safety, progressive disclosure | ✅ **COMPLETE** |

### Core Domain Model ("The Spine")

The spine is an immutable, hash-linked chain of regulatory intelligence:

- **Regulation** → versioned, section-level regulatory text (immutable)
- **Policy** → provider policies, versioned, clause-level (immutable)
- **RegulationPolicyLink** → edge-hashed mapping (immutable, deprecated not deleted)
- **ProviderContextSnapshot** → time-frozen provider state for temporal safety
- **InspectionFinding** → with `origin`/`reporting_domain` separation (mock vs regulatory)
- **Evidence** → two-layer model (EvidenceBlob content-addressed, EvidenceRecord metadata)
- **Action** → remediation state machine with verification

**Flow:** Regulation → RegulationPolicyLink → Policy → InspectionFinding → Evidence → Action

### Key Invariants

1. **Regulatory vs Mock Separation:** Mock inspection outputs NEVER appear in regulatory history. Enforced via `origin` (SYSTEM_MOCK/OFFICIAL_INSPECTOR) and `reporting_domain` (PREVIEW/REGULATORY_HISTORY) fields with DB constraints.

2. **Temporal Safety:** All evaluations reference immutable `ProviderContextSnapshot(as_of)`. No retroactive judgment. Time-of-evaluation is frozen.

3. **Immutability:** Regulation, Policy, RegulationPolicyLink, InspectionFinding, EvidenceBlob, ActionVerification are immutable. Mutations create new versions with distinct IDs.

4. **Hash-Chained Audit:** All state changes append to audit log with `previous_event_hash` for tamper detection. Chain verification detects unauthorized modifications.

5. **Determinism:** Same inputs must always produce same outputs (hashes, classifications, scores). No timestamps, UUIDs, or randomness in canonical hashes.

6. **Version Immutability:** Once a versioned artifact (e.g., `topic-catalog.v1.json`) is published, it CANNOT be modified. Changes require creating new versions (v2, v3, etc.). Enforced by `pnpm validate:versions` and CI. See `docs/VERSION_IMMUTABILITY.md`.

### AI Containment

This system is designed with AI-powered mock inspections. The architecture enforces:

- AI cannot modify authoritative data directly
- AI cannot bypass validation or escalate privileges
- No free-text prompts in config - Topic catalog uses IDs only
- User input never re-injected as instructions
- Mock inspections have bounded follow-up limits per topic
- AI responses are advisory only; they never auto-publish findings

### Multi-Tenancy

- Row-Level Security (RLS) enforced at DB layer (not application layer)
- Tenant-scoped primary keys: `tenantId:resourceId` format
- Application-level filtering alone is insufficient
- Cross-tenant access blocked by `TenantBoundaryViolationError`

### Monorepo Structure

```
packages/
  security/     - Phase 0: Tenant isolation, audit log, secrets scanning
  domain/       - Phases 1-9: Core domain models and business logic
apps/
  api/          - Phase 8+: Backend API server (mock-inspection-backend)
  web/          - Phase 10: Forensic UI with constitutional requirements (Next.js 14)
  worker/       - Background job processor (planned)
scripts/        - Build and validation scripts (gate.ts, validate-version-immutability.ts)
docs/           - Governance documents and phase plans
.regintel/      - Phase tracking (current_phase.txt)
.github/        - CI workflows (ci.yml: tests, phase-gates, version-immutability)
```

### Phase 0 Implementation (Foundations)

**Location:** `packages/security/src/`

**Modules:**
- `tenant.ts` - Tenant isolation with scoped keys
  - `scopeKey()` - Creates tenant-prefixed keys (`tenantId:resourceId`)
  - `TenantIsolatedStore<T>` - In-memory tenant-isolated storage
  - `TenantBoundaryViolationError` - Thrown on cross-tenant access attempts

- `audit.ts` - Hash-chained immutable audit log
  - `AuditLog` - Append-only event log with tamper detection
  - `computePayloadHash()` - Deterministic SHA-256 payload hashing
  - `computeEventHash()` - Chain link computation with previous hash
  - `verifyChain()` - End-to-end integrity verification

- `secrets-scan.ts` - Secrets detection
  - `scanDirectory()` - Recursively scans project for secrets
  - `scanString()` - Scans string content for secret patterns
  - `SECRET_PATTERNS` - AWS keys, API keys, JWTs, private keys, DB URLs, etc.
  - Auto-ignores: node_modules, .env.example, test files, lock files

### Phase 1-9 Implementation (Domain Models)

**Location:** `packages/domain/src/`

**Core Entities:**
- `regulation.ts` - Immutable regulatory text with versioning
- `policy.ts` - Provider policy documents with clause-level tracking
- `regulation-policy-link.ts` - Edge-hashed mappings between regulations and policies
- `provider-context-snapshot.ts` - Time-frozen provider state for temporal safety
- `inspection-finding.ts` - Findings with regulatory/mock domain separation
- `evidence.ts` - Two-layer evidence model (blob + record)
- `action.ts` - Remediation state machine with verification
- `drift-detector.ts` - Phase 2: Regulatory change detection
- `impact-assessment.ts` - Phase 3: Policy impact analysis
- `policy-intelligence.ts` - Phase 3: Non-destructive edge migration logic
- `prs-logic-profile.ts` - Phase 4: Provider regulatory state profiles with deterministic logic evaluation
- `mock-inspection-engine.ts` - Phase 5: Stateful, auditable mock inspections with bounded follow-ups
- `topic-catalog.ts` - Phase 6: Versioned topic catalog with regulation scope and evidence alignment validation
- `provider-outputs.ts` - Phase 7: Pure functions generating provider-facing reports from spine data
- `finding-generator.ts` - Phase 9c: Evidence handling for mock inspection findings
- `frozen-registries.ts` - Phase 9d: Immutable registry management for versioned artifacts (Topic Catalog v1, PRS Logic Profiles v1)
- `facility.ts` - Phase 10: Facility entity with inspection status tracking
- `cqc-client.ts` - Phase 10: CQC API integration with optional API key authentication
- `cqc-scraper.ts` - Phase 10: Web scraping for latest inspection reports (fresher than API)
- `onboarding.ts` - Phase 10: Facility onboarding orchestration with conflict resolution

**Backend (Phase 8+):**
- `apps/api/mock-inspection-backend.ts` - Mock inspection backend with session lifecycle management

## Key Files

| File | Purpose |
|------|---------|
| `.regintel/current_phase.txt` | Current development phase (machine-readable) |
| `docs/REGINTEL_PHASE_GATES.yml` | Machine-enforced phase gate definitions (CI reads this) |
| `docs/VERSION_IMMUTABILITY.md` | Version immutability rules and workflow |
| `docs/PHASE8_IMPLEMENTATION_CODEX.md` | Phase 8 implementation guidance |
| `docs/REGINTEL_PHASE8_INTEGRATION_PLAN.md` | Phase 8 integration plan |
| `docs/FACILITY_ONBOARDING_GUIDE.md` | Phase 10: Facility onboarding API documentation |
| `docs/TESTING_CQC_ONBOARDING.md` | Phase 10: Testing guide for CQC API integration |
| `scripts/gate.ts` | Phase gate runner implementation |
| `scripts/validate-version-immutability.ts` | Version immutability validator |
| `vitest.config.ts` | Test configuration (includes `packages/**/*.test.ts`, `scripts/**/*.test.ts`, `apps/**/*.test.ts`) |
| `.github/workflows/ci.yml` | CI pipeline: version-immutability, unit tests, phase-gates |
| `packages/security/src/` | Phase 0: Security foundations |
| `packages/domain/src/` | Phases 1-9: Domain models and business logic |
| `packages/domain/src/cqc-client.ts` | Phase 10: CQC API integration for facility onboarding |
| `packages/domain/src/cqc-scraper.ts` | Phase 10: Web scraping for latest CQC inspection reports |
| `packages/domain/src/onboarding.ts` | Phase 10: Facility onboarding orchestration logic |
| `packages/domain/src/facility.ts` | Phase 10: Facility entity and validation |
| `apps/api/` | Phase 8+: Backend API implementation |
| `apps/web/` | Phase 10: Forensic UI with constitutional requirements (Next.js 14, React 18, TypeScript) |

## Domain Concepts

**PRS (Provider Regulatory State):** Lifecycle-aware context (NEW_PROVIDER, SPECIAL_MEASURES, ENFORCEMENT_ACTION, RATING_INADEQUATE, etc.) that affects inspection rigor and severity scoring. Profiles are defined in versioned JSON artifacts.

**Topic Catalog:** Bounded inspection conversation topics with regulation scope selectors, evidence hunt profiles, and question plans. Topics use IDs, not prompt strings. Question modes: `evidence_first`, `narrative_first`, `contradiction_hunt`. Versioned artifacts ensure reproducibility.

**Domains:** CQC (Care Quality Commission) and IMMIGRATION. Domains must be explicitly enabled; disabled domains produce zero findings/actions.

**Reporting Domains:** PREVIEW (mock inspection results, never in regulatory history) vs REGULATORY_HISTORY (official inspection results).

**Origin Tracking:** Every finding records its origin (SYSTEM_MOCK, OFFICIAL_INSPECTOR, PROVIDER_SELF_REPORTED) for provenance.

## Development Workflow

### Adding a New Feature

1. **Identify the phase:** If it doesn't fit in current or earlier phases, it's out of scope.
2. **Read phase gates:** Check `docs/REGINTEL_PHASE_GATES.yml` for requirements.
3. **Write tests first:** Phase gate tests enforce architectural constraints.
4. **Implement:** Follow immutability and determinism rules.
5. **Validate:** Run `pnpm gate` to ensure all gates pass.
6. **Commit:** Use descriptive commit messages referencing phase.

### Modifying Versioned Artifacts

**NEVER modify existing versioned files** (e.g., `*.v1.json`). Instead:

1. Copy existing version: `cp artifact.v1.json artifact.v2.json`
2. Edit new version: `vim artifact.v2.json`
3. Update registries to support both versions
4. Update consumers to use new version
5. Old version remains frozen for historical reproducibility

See `docs/VERSION_IMMUTABILITY.md` for full workflow.

### Advancing to Next Phase

1. Ensure all current phase gates pass: `pnpm gate --strict`
2. Review phase manifest: What MUST exist, what MUST NOT exist
3. Update `.regintel/current_phase.txt` (e.g., `phase8_integration_slice`)
4. Implement next phase requirements
5. Write new gate tests in `docs/REGINTEL_PHASE_GATES.yml`

## Code Quality Rules

- **No AI in production logic:** AI is advisory only, never authoritative
- **No timestamps in hashes:** Use deterministic inputs only
- **No UUIDs:** Use scoped keys (`tenantId:resourceId`)
- **No soft deletes:** Deprecate and version instead
- **No application-layer tenant filtering:** Use DB-level RLS
- **No free-text prompts in config:** Use IDs and versioned catalogs
- **No retroactive judgment:** Always reference `ProviderContextSnapshot(as_of)`
- **No mutation:** Create new versions with distinct IDs
- **Test everything:** Phase gates enforce correctness
