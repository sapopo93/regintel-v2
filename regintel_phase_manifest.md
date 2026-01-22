# REGINTEL PHASE MANIFEST

**Status:** Authoritative (Scope Control Document)
**Audience:** Engineering, Product, Delivery
**Purpose:** Enforce phased delivery, prevent scope creep, eliminate refactor debt

---

## 0. Purpose of This Document

This document defines **what is allowed to exist in RegIntel at each phase**.

It answers three questions unambiguously:
1. What must be built *before* moving on
2. What is *explicitly forbidden* at that phase
3. What evidence proves the phase is complete

If work appears in a later phase before its prerequisites are signed off, it is **invalid by definition**.

---

## 1. Phase Progression Rules (Global)

1. Phases are **strictly sequential**.
2. A phase is considered *complete* only when:
   - All required components exist
   - All gate tests pass
   - No forbidden components are present
3. Later phases **may not backfill or compensate** for incomplete earlier phases.
4. CI enforces phase gates using `REGINTEL_PHASE_GATES.yml`.

---

## 2. Phase 0 — Platform Foundations ✅ COMPLETE

### Objective
Establish a secure, deterministic, multi-tenant base on which all higher-order logic depends.

### Must Exist
- ✅ Multi-tenant isolation (RLS or equivalent) - `src/core/tenant.ts`
- ⏳ RBAC with least-privilege roles (DB layer, not yet implemented)
- ✅ Immutable audit log (hash-chained) - `src/core/audit.ts`
- ✅ Secrets management (no secrets in repo) - `src/core/secrets-scan.ts`
- ⏳ Environment separation (dev / staging / prod) (not yet required)

### Must NOT Exist
- Business logic
- Domain objects
- AI integration

### Gate Criteria
- ✅ Cross-tenant access attempts are blocked (15 tests passing)
- ✅ Audit log chain verifies end-to-end (16 tests passing)
- ✅ Secrets scan passes (19 tests passing)

---

## 3. Phase 1 — Canonical Domain Model (The Spine)

### Objective
Define the immutable regulatory reasoning graph.

### Must Exist
- Regulation (versioned, section-level)
- Policy (versioned, clause-level)
- RegulationPolicyLink (edge-hashed, non-destructive)
- ProviderStateInterval + ProviderContextSnapshot
- InspectionFinding (with provenance separation)
- Evidence (two-layer model)
- Action (remediation control state machine)

### Must NOT Exist
- Dashboards
- Mock inspections
- Drift detection
- Automation

### Gate Criteria
- No orphan objects (DB-enforced)
- Mock findings cannot appear in regulatory views
- Hash determinism tests pass

---

## 4. Phase 2 — Regulatory Drift Engine

### Objective
Detect *meaningful* regulatory change without alert fatigue.

### Must Exist
- Regulation snapshots
- Section-level diffing
- Normativity Delta scoring
- Change classification
- RegulatoryChangeEvent (immutable)

### Must NOT Exist
- Auto-updating policy links
- User-facing alerts without impact filtering

### Gate Criteria
- Typo changes classified as COSMETIC
- should → must classified as NORMATIVE
- Drift output is deterministic for same inputs

---

## 5. Phase 3 — Policy Intelligence Engine

### Objective
Safely manage stale Regulation–Policy links when regulations change.

### Must Exist
- ImpactAssessment object
- ImpactAssessmentItem (per edge)
- Non-destructive migration logic
- Deterministic mapping profiles

### Must NOT Exist
- Silent link mutation
- Auto-accept migrations

### Gate Criteria
- Old edges are deprecated, not overwritten
- All migration proposals are auditable
- Deterministic mapping for identical inputs

---

## 6. Phase 4 — PRS Logic Profiles

### Objective
Define *how* the system judges severity and rigor based on provider context.

### Must Exist
- Versioned PRSLogicProfile
- Deterministic LogicRules
- Severity and scoring controls
- Bounded interaction directives

### Must NOT Exist
- Free-text AI decision making
- Hardcoded logic paths

### Gate Criteria
- Same snapshot + profile ⇒ identical outputs
- Interaction directive hash stable

---

## 7. Phase 5 — Mock Inspection Engine

### Objective
Execute constrained, auditable mock inspections.

### Must Exist
- MockInspectionSession (time-frozen)
- SessionTopicState (counters enforced)
- DraftFinding buffer
- Append-only SessionEvent log

### Must NOT Exist
- Stateless chat flows
- Direct creation of regulatory findings

### Gate Criteria
- Follow-up limits enforced
- Event replay reproduces state
- Mock findings never leak to regulatory history

---

## 8. Phase 6 — Topic Catalog

### Objective
Control relevance and scope of inspection conversations.

### Must Exist
- Versioned TopicCatalog
- Regulation scope selectors
- Evidence hunt profiles
- Question/template IDs (no prompt strings)
- Topic-level PRS overrides

### Must NOT Exist
- Ad-hoc question generation
- Topics without regulatory scope

### Gate Criteria
- Topics only reference allowed regulation sections
- Evidence requests align with topic definitions

---

## 9. Phase 7 — Provider Outputs (MVP Surface)

### Objective
Expose monetizable value with minimal UI.

### Must Exist
- Inspection Confidence Report
- Risk Register (open findings)
- Evidence Readiness Matrix
- Action Verification view

### Must NOT Exist
- General-purpose dashboards
- Operational management screens

### Gate Criteria
- Outputs are derivable solely from canonical spine
- No business logic in UI layer

---

## 10. Explicitly Frozen / Out-of-Scope Areas

The following are **intentionally excluded** unless this document is amended:

- Care planning
- Rota / scheduling
- HR systems
- Incident management replacement
- Generic BI dashboards
- Auto-remediation without verification

---

## 11. Final Enforcement Rule

> **If a feature cannot name the phase it belongs to, it does not belong in RegIntel.**

