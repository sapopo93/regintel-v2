# REGINTEL SECURITY MODEL

**Status:** Authoritative (Security Constitution)
**Audience:** Engineering, Security Reviewers, Auditors, Enterprise Customers
**Applies To:** All environments (dev, staging, production)

---

## 0. Purpose

This document defines the **non-negotiable security architecture** of RegIntel.

Security in RegIntel is not a feature add-on. It is a **structural property** of the system, designed to:
- Protect providers from regulatory harm
- Prevent data leakage across tenants
- Eliminate ambiguity between simulation and regulatory fact
- Provide audit-grade defensibility

If functionality compromises security invariants, **the functionality must be removed**.

---

## 1. Threat Model (What We Defend Against)

### 1.1 Primary Threats
- Cross-tenant data leakage
- Accidental contamination of regulatory history with simulated data
- Retroactive reinterpretation of historical compliance
- Evidence tampering or deletion
- Privilege escalation (human or AI)
- Prompt injection or AI behavior override

### 1.2 Explicitly Out of Scope
- Nation-state attacks
- Zero-day hypervisor compromise

---

## 2. Identity, Access & Tenant Isolation

### 2.1 Tenant Isolation

**Invariant:** No request may read or write data outside its tenant boundary.

**Mechanisms**
- Tenant-scoped primary keys
- Row-Level Security (RLS) or equivalent enforced at DB layer
- Tenant-aware encryption key derivation

**Hard Rule**
- Application-level filtering is insufficient on its own

---

### 2.2 Authentication

- Short-lived access tokens
- Refresh token rotation
- Device/session revocation support
- MFA-ready (not optional in production)

---

### 2.3 Authorization (RBAC)

**Principle:** Least privilege, explicit scope

Example roles:
- OWNER
- REGISTERED_MANAGER
- QA_LEAD
- STAFF_VIEW

RBAC decisions must be enforced server-side.

---

## 3. Data Integrity & Immutability

### 3.1 Immutable Records

The following objects are immutable once created:
- Regulation
- Policy (versions)
- RegulationPolicyLink
- InspectionFinding
- EvidenceBlob
- ActionVerification

Mutations occur only by:
- Creating a new version
- Deprecating the previous record

---

### 3.2 Hash-Chained Audit Log

All state-changing events must append to an audit log with:
- previous_event_hash
- event_payload_hash
- timestamp

Tampering invalidates the chain.

---

## 4. Evidence Security

### 4.1 Evidence Storage Model

- EvidenceBlob is content-addressed (sha256)
- Storage is append-only where supported
- Metadata lives separately in EvidenceRecord

---

### 4.2 Deletion & Revocation

**Rule:** Evidence may never be hard-deleted if referenced.

- User deletion request ⇒ access revoked
- Hash + metadata retained for historical proof

---

### 4.3 Malware & File Safety

- All uploads scanned
- Quarantine on detection
- Quarantined blobs cannot be referenced by Findings or Actions

---

## 5. Regulatory vs Simulation Separation

### 5.1 Domain Separation

**Invariant:** Simulated outputs must never be treated as regulatory fact.

**Enforced By**
- `origin` and `reporting_domain` fields
- DB constraints
- Separate views/read models

---

### 5.2 Export Safety

- Regulatory exports include only REGULATORY_HISTORY
- Mock data is excluded by default
- Any inclusion of mock data requires explicit user intent

---

## 6. Temporal Safety (No Retroactive Judgment)

- All evaluations reference ProviderContextSnapshot(as_of)
- Snapshots are immutable
- Logic profiles are versioned

Re-evaluation with new rules requires explicit re-run.

---

## 7. AI Containment & Safety

### 7.1 AI Trust Boundary

AI models:
- Cannot modify authoritative data directly
- Cannot bypass validation or constraints
- Cannot escalate privileges

AI outputs must pass strict schema validation.

---

### 7.2 Prompt Injection Resistance

- No free-text prompts stored in config
- Topic catalog uses IDs only
- Interaction directives are bounded enums
- User input is never re-injected as instructions

---

## 8. Domain Capability Gating (Immigration)

- Domains must be explicitly enabled
- Disabled domains produce zero:
  - topics
  - findings
  - actions
  - alerts

This prevents false compliance risk.

---

## 9. Operational Security

### 9.1 Environment Separation

- Separate credentials per environment
- Production data never used in dev

---

### 9.2 Monitoring & Alerting

- Security events logged centrally
- Alerts on:
  - cross-tenant access attempts
  - mass exports
  - privilege changes

---

### 9.3 Backups & Recovery

- Encrypted backups
- Regular restore drills
- Defined RPO / RTO

---

## 10. Security Testing & Gates

Security is enforced by phase gates:

- Phase 0: tenant isolation, audit chain
- Phase 1: separation constraints
- Phase 5: AI containment

Gate failure blocks merge.

---

## 11. Disclosure & Responsibility

- Security issues are logged, not hidden
- Fixes are versioned
- Silent changes are prohibited

---

## 12. Final Security Rule

> **If you cannot prove a control exists in code or schema, the control does not exist.**

