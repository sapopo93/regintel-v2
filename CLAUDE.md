# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RegIntel v2 is a regulatory compliance platform for UK CQC-registered care providers. It helps providers prove inspection readiness with evidence before inspectors arrive. The system focuses on evidence-based compliance rather than checklist theatre.

**Current Phase:** Phase 8 (Integration Slice) - All phases 0-8 complete!

## Test Coverage

- **Phase Gates**: 25 tests (all passing)
- **Total Tests**: 157 tests (151 domain + 6 integration)

## Build & Test Commands

```bash
pnpm install                      # Install dependencies
pnpm test                         # Run all tests via Vitest
pnpm test <pattern>               # Run tests matching pattern (e.g., pnpm test security:tenant)
pnpm gate                         # Run phase gate validation for current phase
```

### Phase Gate Tests

Test names follow the pattern `<phase>:<gate>`. Run tests using vitest's `-t` flag:
```bash
pnpm vitest run -t "security:tenant"       # Phase 0: Tenant isolation
pnpm vitest run -t "audit:chain"           # Phase 0: Hash-chain verification
pnpm vitest run -t "security:secrets"      # Phase 0: Secrets scan
pnpm vitest run -t "spine:no-orphans"      # Phase 1: Domain model integrity
pnpm vitest run -t "spine:mock-separation" # Phase 1: Regulatory/mock separation
pnpm vitest run -t "drift:normative"       # Phase 2: Normative change detection
pnpm vitest run -t "policy-intel:edges"    # Phase 3: Non-destructive edge management
pnpm vitest run -t "logic:determinism"     # Phase 4: Logic profile determinism
pnpm vitest run -t "mock:limits"           # Phase 5: Follow-up limits enforcement
pnpm vitest run -t "mock:replay"           # Phase 5: Event replay determinism
pnpm vitest run -t "topics:scope"          # Phase 6: Topic regulation scope validation
pnpm vitest run -t "outputs:purity"        # Phase 7: Output purity validation
```

**CI Strict Mode:** When `CI=true`, SKIP results are treated as failures. All tests must explicitly PASS.

## Architecture

### Phased Development Model

The system enforces **strict sequential phase progression** (Phase 0-8). Each phase defines:
- **Must Exist:** Required components before advancing
- **Must NOT Exist:** Forbidden components (prevents scope creep)
- **Gate Criteria:** CI-enforced tests that must pass

Later phases cannot backfill incomplete earlier phases. If a feature cannot name its phase, it does not belong in RegIntel.

| Phase | Focus |
|-------|-------|
| 0 | Foundations: Multi-tenant isolation, RBAC, immutable audit log, secrets management (✅ **COMPLETE**) |
| 1 | The Spine: Core domain model (Regulation → Policy → Finding → Evidence → Action) (✅ **COMPLETE**) |
| 2 | Drift Engine: Regulatory change detection, normativity scoring (✅ **COMPLETE**) |
| 3 | Policy Intelligence: Impact assessment, non-destructive edge migrations (✅ **COMPLETE**) |
| 4 | PRS Logic Profiles: Deterministic severity/rigor rules (✅ **COMPLETE**) |
| 5 | Mock Inspection Engine: Stateful sessions, bounded questioning (✅ **COMPLETE**) |
| 6 | Topic Catalog: Relevance control, evidence alignment (✅ **COMPLETE**) |
| 7 | Provider Outputs: Inspection Confidence Report, Risk Register, Evidence Matrix (✅ **COMPLETE**) |
| 8 | Integration Slice: Minimal vertical slice across DB, API, audit (✅ **COMPLETE**) |

### Core Domain Model ("The Spine")

- **Regulation** → versioned, section-level regulatory text (immutable)
- **Policy** → provider policies, versioned, clause-level (immutable)
- **RegulationPolicyLink** → edge-hashed mapping (immutable, deprecated not deleted)
- **ProviderContextSnapshot** → time-frozen provider state for temporal safety
- **InspectionFinding** → with `origin`/`reporting_domain` separation (mock vs regulatory)
- **Evidence** → two-layer model (EvidenceBlob content-addressed, EvidenceRecord metadata)
- **Action** → remediation state machine with verification

### Key Invariants

1. **Regulatory vs Mock Separation:** Mock inspection outputs NEVER appear in regulatory history. Enforced via `origin` and `reporting_domain` fields with DB constraints.
2. **Temporal Safety:** All evaluations reference immutable `ProviderContextSnapshot(as_of)`. No retroactive judgment.
3. **Immutability:** Regulation, Policy, RegulationPolicyLink, InspectionFinding, EvidenceBlob, ActionVerification are immutable. Mutations create new versions.
4. **Hash-Chained Audit:** All state changes append to audit log with `previous_event_hash` for tamper detection.
5. **Determinism:** Same inputs must always produce same outputs (hashes, classifications, scores).

### AI Containment

- AI cannot modify authoritative data directly
- AI cannot bypass validation or escalate privileges
- No free-text prompts in config - Topic catalog uses IDs only
- User input never re-injected as instructions
- Mock inspections have bounded follow-up limits per topic

### Multi-Tenancy

- Row-Level Security (RLS) enforced at DB layer (not application layer)
- Tenant-scoped primary keys
- Application-level filtering alone is insufficient

### Monorepo Structure

The project uses a monorepo layout:

```
packages/
  security/     - Phase 0: Tenant isolation, audit log, secrets scanning
  domain/       - Phases 1-3: Core domain models and business logic
apps/
  api/          - Backend API server (future)
  web/          - Frontend web application (future)
  worker/       - Background job processor (future)
scripts/        - Build and validation scripts (gate.ts)
```

### Phase 0 Implementation (Foundations)

**Status:** ✅ All gate tests passing

**Modules:**
- `packages/security/src/tenant.ts` - Tenant isolation with scoped keys
  - `scopeKey()` - Creates tenant-prefixed keys
  - `TenantIsolatedStore<T>` - In-memory tenant-isolated storage
  - `TenantBoundaryViolationError` - Thrown on cross-tenant access attempts
  - All primary keys must use `tenantId:resourceId` format

- `packages/security/src/audit.ts` - Hash-chained immutable audit log
  - `AuditLog` - Append-only event log with tamper detection
  - `computePayloadHash()` - Deterministic SHA-256 payload hashing
  - `computeEventHash()` - Chain link computation with previous hash
  - `verifyChain()` - End-to-end integrity verification
  - Events linked via `previousEventHash` forming tamper-evident chain

- `packages/security/src/secrets-scan.ts` - Secrets detection
  - `scanDirectory()` - Recursively scans project for secrets
  - `scanString()` - Scans string content for secret patterns
  - `SECRET_PATTERNS` - AWS keys, API keys, JWTs, private keys, DB URLs, etc.
  - Auto-ignores: node_modules, .env.example, test files, lock files

### Phase 1-7 Implementation (Domain Models)

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

## Key Files

| File | Purpose |
|------|---------|
| `.regintel/current_phase.txt` | Current development phase |
| `docs/REGINTEL_PHASE_GATES.yml` | Machine-enforced phase gate definitions (CI reads this) |
| `regintel_phase_gates.md` | Human-readable phase gate reference |
| `regintel_phase_manifest.md` | What must/must not exist per phase |
| `regintel_security_model.md` | Security invariants and threat model |
| `regintel_topic_catalog_v_1.md` | Topic definitions for mock inspections |
| `scripts/gate.ts` | Phase gate runner implementation |
| `vitest.config.ts` | Test configuration (includes packages/**/*.test.ts) |
| `packages/security/src/` | Phase 0: Security foundations |
| `packages/domain/src/` | Phases 1-3: Domain models and business logic |

## Domain Concepts

**PRS (Provider Regulatory State):** Lifecycle-aware context (NEW_PROVIDER, SPECIAL_MEASURES, ENFORCEMENT_ACTION, RATING_INADEQUATE, etc.) that affects inspection rigor and severity scoring.

**Topic Catalog:** Bounded inspection conversation topics with regulation scope selectors, evidence hunt profiles, and question plans. Topics use IDs, not prompt strings. Question modes: `evidence_first`, `narrative_first`, `contradiction_hunt`.

**Domains:** CQC (Care Quality Commission) and IMMIGRATION. Domains must be explicitly enabled; disabled domains produce zero findings/actions.
