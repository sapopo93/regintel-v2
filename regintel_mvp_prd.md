# REGINTEL MVP PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Product:** RegIntel v2 (MVP)
**Status:** Authoritative – Scope-Locked MVP
**Audience:** Engineering, Founders, Early Customers, Investors

---

## 0. One-Sentence Value Proposition

**RegIntel helps care providers prove inspection readiness with evidence, before inspectors arrive, without guessing or checklist theatre.**

---

## 1. Problem Statement (What We Are Solving)

Care providers fail inspections not because they do not care, but because:
- Evidence is fragmented and time-blind
- Policies drift from regulation silently
- Mock inspections are subjective and inconsistent
- Compliance software focuses on *activity*, not *proof*

Existing systems either:
- Overwhelm providers with features, or
- Hide critical risk until inspection day

---

## 2. Target Customer (MVP)

### Primary
- UK CQC-registered care providers (small to mid-sized)
- Providers preparing for:
  - First inspection
  - Re-inspection after Requires Improvement / Inadequate

### Secondary (Optional Capability)
- Providers with sponsor licences (Immigration enabled explicitly)

---

## 3. MVP Scope (What Ships)

### 3.1 Core Capabilities

1. **Regulation Intelligence**
   - Versioned CQC regulations
   - Section-level change detection

2. **Policy Mapping**
   - Provider policies linked to specific regulation clauses
   - Visibility of stale mappings when regulation changes

3. **Provider Context Awareness (PRS)**
   - Lifecycle-aware logic (new, established, special measures)
   - Time-frozen context snapshots

4. **Mock Inspection Engine**
   - Topic-driven, evidence-first mock inspections
   - Bounded questioning (no AI wandering)
   - Deterministic scoring and severity

5. **Evidence Management**
   - Secure evidence upload
   - Proof-of-existence even if files are later removed

6. **Remediation Controls (Actions)**
   - Findings generate traceable actions
   - Closure requires verification evidence

7. **Inspection Confidence Report**
   - What would likely pass
   - What would likely fail
   - Why (with traceability)

---

## 4. Explicitly Out of Scope (MVP)

The following are **not included**:
- Care planning systems
- Rota / HR management
- Incident management replacement
- Generic dashboards
- Auto-remediation without human review

---

## 5. Core User Journeys (MVP)

### Journey 1 — New Provider Readiness
1. Provider uploads policies and key evidence
2. Declares provider state (NEW_PROVIDER)
3. Runs mock inspection
4. Receives inspection confidence report

---

### Journey 2 — Preparing for Re-Inspection
1. Provider selects inspection context date
2. Runs mock inspection under correct PRS
3. Reviews findings and actions
4. Uploads remediation evidence
5. Verifies closure

---

### Journey 3 — Regulatory Change Awareness
1. Regulation changes detected
2. System highlights affected policy mappings
3. Provider reviews impact assessment
4. Accepts or modifies migration

---

## 6. MVP Outputs (Customer-Visible)

1. **Inspection Confidence Report**
   - Overall readiness score
   - Findings by topic
   - Severity classification

2. **Risk Register**
   - Open findings
   - Linked actions and evidence status

3. **Evidence Readiness Matrix**
   - Required vs provided evidence per topic

---

## 7. Non-Functional Requirements

- Deterministic outputs
- Full audit trail
- Tenant isolation
- Fast onboarding (≤ 1 day)
- Minimal UI complexity

---

## 8. Success Metrics (MVP)

### Customer Success
- Provider can explain readiness in ≤ 15 minutes
- Reduced inspection surprises

### Product
- First mock inspection usable within 1 hour of onboarding
- Zero mock findings leaking into regulatory exports

### Engineering
- No phase gate violations
- Minimal refactoring between releases

---

## 9. MVP Release Constraints

- All features must comply with:
  - REGINTEL_ENGINEERING_CONSTITUTION.md
  - REGINTEL_PHASE_MANIFEST.md
  - REGINTEL_SECURITY_MODEL.md
  - REGINTEL_PHASE_GATES.yml
  - REGINTEL_TOPIC_CATALOG_V1.json

---

## 10. MVP Definition of Done

The MVP is considered complete when:
- A provider can run a mock inspection
- Receive findings with evidence traceability
- Close an action with verification
- Export an inspection confidence report

---

## 11. Final MVP Rule

> **If a feature does not directly improve inspection readiness with proof, it does not belong in the MVP.**

