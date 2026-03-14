# Regintelia — System Capabilities, Features & Strategic Positioning

> **Document type:** Foundational Reference
> **Audience:** Internal teams, investors, sales, partnerships, technical evaluators
> **Purpose:** Single source of truth for what Regintelia is, what it does, and where it wins. All other documentation (sales decks, API docs, onboarding guides, compliance certificates) should derive from this document.

---

## 1. What Regintelia Is

Regintelia is a **regulatory compliance intelligence platform** for UK CQC-registered care providers. It replaces checklist theatre — the ritual of ticking boxes before an inspector arrives — with **evidence-based inspection readiness** that is provably correct, temporally safe, and tamper-detectable.

The system ingests real provider evidence (policies, care plans, training records, MAR charts, visit logs), audits it against CQC's Single Assessment Framework (SAF), runs mock inspections that simulate CQC questioning patterns, and produces analyst-grade reports with root cause analysis and SMART remediation plans.

Every output is **deterministic**: the same inputs produce the same outputs, the same hashes, the same report. Nothing is approximated. Nothing is improvised. The system either knows something or it doesn't — and it says which.

---

## 2. Core Architecture

### 2.1 The Spine — Immutable Domain Model

All data flows through a hash-linked chain of immutable entities:

```
Regulation → RegulationPolicyLink → Policy → ProviderContextSnapshot → InspectionFinding → Evidence → Action
```

- **No entity is ever mutated.** Changes create new versions with distinct IDs.
- **No entity is ever deleted.** Deprecated entities are superseded, never erased.
- **Every state change is audited** in an append-only log where each event references the hash of the previous event — a tamper-detection chain.
- **Every evaluation references an immutable snapshot** of provider state at a specific point in time. No retroactive judgment.

This architecture means that any output from Regintelia can be independently verified. An inspector, auditor, or regulator can trace any finding back through the evidence that produced it, the snapshot that framed it, and the regulation that required it — with cryptographic proof that nothing was altered after the fact.

### 2.2 Multi-Tenancy & Data Isolation

Tenant isolation is enforced at the **database layer** via PostgreSQL Row-Level Security (RLS), not application code. A bug in the application cannot leak data across tenants because the database itself refuses to return rows belonging to other tenants.

- Primary keys are tenant-scoped: `tenantId:resourceId`
- Cross-tenant reads return empty result sets (not errors — no information leakage about existence)
- Cross-tenant writes are blocked by RLS policies
- The audit log itself is tenant-scoped and hash-chained per tenant

### 2.3 Determinism Guarantee

Regintelia's outputs are **reproducible by design**:

- No timestamps in canonical hashes
- No UUIDs in deterministic computations
- No randomness in scoring, classification, or severity calculation
- Same ProviderContextSnapshot + same PRS Logic Profile + same Topic Catalog = identical outputs

This matters because regulators and boards need to trust that a report generated today would produce the same conclusions if regenerated tomorrow from the same evidence. Regintelia doesn't just claim this — it proves it with matching SHA-256 hashes.

---

## 3. Capabilities

### 3.1 Evidence Ingestion & Storage

**What it does:** Accepts provider documents (PDF, Word, Excel, CSV, images), stores them in a content-addressed blob store, deduplicates automatically, and scans for malware.

**Technical detail:**
- SHA-256 content addressing: duplicate uploads are detected and deduplicated at the storage layer
- Sharded filesystem: blobs stored at `/ab/cd/abcdef123...` paths for filesystem performance at scale
- ClamAV integration for virus scanning (background job, quarantine for infected files)
- Tesseract OCR for extracting text from scanned documents and images
- 44 recognized evidence types spanning clinical records, governance, staffing, legal/safeguarding, domiciliary care, clinical monitoring, and person-centred care
- Multi-tenant blob sharing: the same physical document (by hash) can be referenced by multiple tenants without duplication

**Edge case advantage:** A care group operating 50 homes can upload a group-wide safeguarding policy once. Every facility references the same blob hash. When the policy is updated, a new version is uploaded — the old version remains immutable and auditable. No "which version was live on March 3rd?" ambiguity.

### 3.2 AI-Powered Document Audit

**What it does:** Every uploaded document is automatically audited against CQC's SAF quality statements relevant to its type and the facility's service type. The audit produces a compliance score, SAF statement ratings, findings with severity, corrections with priority, and a risk matrix.

**Technical detail:**
- Automatic document type detection from filename patterns (44 types, with co-occurrence validation to prevent false positives)
- Service-type-aware auditing: a domiciliary care provider's visit log is audited against different SAF statements than a nursing home's MAR chart
- AI is **advisory only** — it cannot modify authoritative data, bypass validation, or auto-publish findings
- Audit results include: overall result (PASS/NEEDS_IMPROVEMENT/CRITICAL_GAPS), compliance score (0-100), per-statement ratings (MET/PARTIALLY_MET/NOT_MET/NOT_APPLICABLE), findings with regulatory references, corrections with priority tiers (IMMEDIATE/THIS_WEEK/THIS_MONTH), and a risk matrix with enforcement likelihood
- CQC tone and language: outputs use CQC's own regulatory vocabulary, not generic compliance jargon
- RIDDOR-aware: incident reports are checked against RIDDOR reporting requirements

**Edge case advantage:** A provider uploads 200 documents during annual policy review. Each is automatically audited in the background job queue. The manager sees a dashboard of compliance scores across all documents — not a stack of unread PDFs. The system catches that the infection control policy references superseded 2019 guidance before an inspector does.

### 3.3 CQC Integration & Intelligence

**What it does:** Connects to CQC's public API and website to enrich facility data, scrape latest inspection reports, and monitor peer providers for risk and outstanding signals.

**Technical detail:**

**Facility Onboarding:**
- CQC Location ID lookup auto-populates facility name, address, service type, capacity, latest rating
- Bulk onboarding: up to 50 facilities in one request (care groups)
- Idempotent: re-onboarding the same CQC ID updates the facility rather than duplicating it
- Background job scrapes the CQC website for the latest inspection report (more current than the API)

**Live CQC Intelligence Alerts:**
- Monitors other providers' published inspection reports
- Generates RISK_SIGNAL alerts when a peer provider in the same service type receives "Requires Improvement" or "Inadequate" ratings — flagging the quality statements where your own evidence is thin
- Generates OUTSTANDING_SIGNAL alerts when a peer achieves "Outstanding" — identifying what excellence looks like for your service type
- Alert severity is calibrated against your own SAF coverage: HIGH when coverage <30-40%, MEDIUM at 30-70%, LOW above 70%
- Dismissible, with audit trail

**Edge case advantage:** A domiciliary care provider in Manchester sees that two competitors just received "Requires Improvement" for safe staffing (S6). Regintelia checks their own S6 evidence coverage and alerts them: "Your S6 coverage is 28% — HIGH risk. Upload training matrix and supervision records to close this gap before your own inspection." The provider acts before CQC even schedules their visit. This is **pre-emptive compliance** — something no checklist app can do.

### 3.4 Mock Inspection Engine

**What it does:** Simulates a CQC inspection with structured questioning across 34 topics, bounded follow-ups, and draft findings that never leak into regulatory history.

**Technical detail:**
- 34 CQC-mapped topics across 5 Key Questions (Safe, Effective, Caring, Responsive, Well-Led)
- Service-type-aware topic selection: domiciliary care excludes premises-equipment, nutrition-hydration, deprivation-of-liberty; supported living excludes premises-equipment
- Three question modes per topic:
  - **Evidence First:** "Show me your medication error log for the last quarter" — collects evidence before probing
  - **Narrative First:** "Describe how you handle safeguarding referrals" — explanation before evidence
  - **Contradiction Hunt:** "Your policy says X but your incident log shows Y — explain" — probes inconsistencies (enabled for high-risk PRS states)
- Bounded follow-ups: 4-5 per topic depending on PRS state, enforced globally across the session
- Append-only event log: SESSION_STARTED → TOPIC_OPENED → QUESTION_ASKED → ANSWER_RECEIVED → FINDING_DRAFTED → TOPIC_CLOSED → SESSION_COMPLETED
- **Mock/Regulatory wall:** Database constraint prevents SYSTEM_MOCK findings from appearing in REGULATORY_HISTORY. This is enforced at the schema level, not application code. A bug in the UI cannot leak mock findings into official records.
- UI renders mock screens with a red frame and "SIMULATION (MOCK) — NOT REGULATORY HISTORY" watermark

**Edge case advantage:** A new registered manager runs 3 mock inspections before their first real CQC visit. Each mock produces findings, evidence gaps, and severity scores — but none of it contaminates the facility's regulatory record. When CQC arrives, the official findings are recorded separately with `origin: OFFICIAL_INSPECTOR`. The mock findings remain available for internal learning but are architecturally incapable of appearing in any regulatory submission.

### 3.5 PRS-Aware Severity Scoring

**What it does:** Adjusts inspection rigor, severity multipliers, and readiness thresholds based on the provider's regulatory state — because a finding at a provider under Special Measures is not the same as the same finding at an Outstanding-rated provider.

**Technical detail:**

| PRS State | Severity Multiplier | Max Follow-ups | Interaction Mode | Attention Threshold |
|-----------|-------------------|----------------|-----------------|-------------------|
| NEW_PROVIDER | 1.0 | 4 | Evidence First | 14 days |
| ESTABLISHED | 1.0 | 4 | Evidence First | 14 days |
| RATING_REQUIRES_IMPROVEMENT | 1.2 | 5 | Narrative First | 10 days |
| RATING_INADEQUATE | 1.3 | 5 | Contradiction Hunt | 7 days |
| ENFORCEMENT_ACTION | 1.3 | 5 | Contradiction Hunt | 7 days |
| SPECIAL_MEASURES | 1.5 | 5 | Contradiction Hunt | 7 days |
| REOPENED_SERVICE | 1.2 | 5 | Narrative First | 10 days |
| MERGED_SERVICE | 1.0 | 4 | Evidence First | 14 days |

- Composite risk score: `impact x likelihood x PRS multiplier`
- Readiness weights shift: providers under scrutiny need heavier evidence weighting (70%) vs mock coverage (30%)
- Readiness thresholds tighten: red zone starts at 60% for established providers but 50% for those under enforcement

**Edge case advantage:** A provider exits Special Measures. Their PRS state updates to ESTABLISHED. Regintelia automatically recalculates all severity scores with the lower multiplier, adjusts follow-up limits, and shifts from Contradiction Hunt to Evidence First mode. The provider sees their risk register drop — not because anything changed operationally, but because the regulatory context changed. This is the difference between "you have a problem" and "you have a problem given your regulatory history."

### 3.6 SAF34 Quality Statement Coverage

**What it does:** Maps all provider evidence to CQC's 34 Quality Statements across the 5 Key Questions, producing a real-time coverage map with gap analysis.

**Technical detail:**
- Three-tier evidence-to-QS mapping:
  - **Tier 1:** AI-verified SAF ratings from document audit (high confidence — the document was analysed and rated against specific statements)
  - **Tier 2:** Evidence type heuristic fallback (40+ evidence types mapped to quality statements, e.g., CQC_REPORT → S1/S3/E1/R1/W1/W4; POLICY → W1/W2/W4/W5; TRAINING → S6/E8/W6; CARE_PLAN → E1/R1/C2/E6) — used when audit is pending, failed, or skipped
  - **Tier 3:** Keyword-based fallback for unmapped types (e.g., OTHER) — scans filename and description against 34 per-QS keyword patterns (e.g., "fire safety" → S5, "governance" → W1, "nutrition" → E2) to ensure even miscategorised evidence contributes to coverage
- Coverage calculation: percentage of quality statements with at least one supporting evidence item
- Gap analysis: identifies which quality statements have zero evidence coverage
- Per-Key-Question breakdown: Safe (S1-S9), Effective (E1-E9), Caring (C1-C4), Responsive (R1-R4), Well-Led (W1-W8)

**Edge case advantage:** A provider has uploaded 47 documents but has zero evidence touching W3 (Freedom to Speak Up) and W8 (Staffing sustainability). Without Regintelia, they wouldn't know until an inspector asks "Can you show me your whistleblowing policy?" and they scramble. With Regintelia, the gap is visible on the dashboard immediately after upload.

### 3.7 Blue Ocean Reports (Phase 11)

**What it does:** Generates PhD-level analyst reports with root cause analysis, SMART remediation plans, evidence traceability, and quality gates — exceeding what any individual compliance consultant could produce manually.

**Technical detail:**

**Two report variants:**
- **BLUE_OCEAN_BOARD:** Summary-focused for board and governance committees. Emphasizes risk outlook, remediation status, and quality gates.
- **BLUE_OCEAN_AUDIT:** Detail-focused for compliance teams and external auditors. Includes full RCA with disconfirming tests, evidence index with hash verification, and data lineage.

**Output formats:** Both variants can be exported as **PDF** (print-ready with watermarks, severity colour coding, metadata footers on every page), **Word (DOCX)** (editable with styled tables, headers/footers, and colour-coded severity indicators), or **markdown** (for integration into other tools).

**13 mandatory sections:**
1. Executive Summary — total findings, major findings, top severity, open/verified actions
2. Scope & Context — snapshot IDs, reporting domain, finding window, source
3. Findings Overview — severity breakdown, top regulations, total count
4. Major Findings — sorted by priority (CRITICAL/HIGH first, then composite risk score)
5. Evidence Index — numbered references (E1, E2...) with type, upload timestamp, primary hash, supported findings
6. Root Cause Analysis — minimum 2 hypotheses per CRITICAL/HIGH finding, each with disconfirming tests
7. Contributing Factors — aggregated patterns across findings
8. Evidence Readiness — coverage percentage with action verification status
9. Remediation Plan — action status breakdown, action-by-finding mapping
10. Risk Outlook — highest/average composite scores, risk tier breakdown
11. Regulatory Mapping — regulations covered with finding counts
12. Quality Gates — RCA quality, mock watermark presence, domain consistency, determinism verification
13. Data Lineage — bidirectional Finding-Evidence-Action traceability

**Completeness scoring (target >= 95%):**
- Section coverage: 13/13 sections present
- Evidence coverage: every finding linked to at least one evidence item
- Action completeness: every action has owner + deadline + acceptance criteria + verification method
- RCA completeness: every CRITICAL/HIGH finding has >= 2 hypotheses with disconfirming tests

**RCA hypothesis templates:**
- Process Control Gap (procedure missing/outdated/unenforced)
- Capability Gap (staffing/training/tooling insufficient)
- Governance Erosion (internal audit/QA failed to detect — triggered for Reg 12/13/15/18 or CRITICAL)
- Cultural/Systemic Gap (safety culture failure — CRITICAL findings only)

**Edge case advantage:** A care group presents a Blue Ocean Audit report to their CQC relationship manager proactively, before any inspection is scheduled. The report includes root cause analysis with disconfirming tests ("To rule out process control gap: locate the dated procedure and verify 3 staff can describe it"). The relationship manager has never seen a provider produce this level of analysis. The provider has shifted the dynamic from "being inspected" to "demonstrating mastery." This is the blue ocean — the space where providers compete on intelligence, not compliance.

### 3.8 Inspector Evidence Pack

**What it does:** Assembles a facility-level evidence package organized by SAF quality statement, ready for an inspector to review. Combines AI-verified audit results with evidence type heuristics for maximum coverage.

**Technical detail:**
- Per-quality-statement evidence grouping with three-tier mapping:
  - **Tier 1:** AI-verified SAF ratings from completed document audit (highest confidence)
  - **Tier 2:** Evidence type heuristic fallback mapping 40+ evidence types to quality statements (e.g., CQC_REPORT → S1/S3/E1/R1/W1/W4; POLICY → W1/W2/W4/W5)
  - **Tier 3:** Keyword-based fallback for OTHER-typed or unmapped evidence — scans filename and description against per-QS keyword patterns to infer relevance
- Outstanding Readiness Indicators: audit-verified signals (e.g., policy scored 92% on W4) plus keyword-matched signals (e.g., "policy reviewed annually" detected in document text)
- Includes evidence metadata: type, upload date, audit status, compliance score
- Constitutional metadata: topic catalog version/hash, PRS logic version/hash, snapshot timestamp
- Available as **PDF**, **Word (DOCX)**, or **markdown** — inspector-ready documents that can be printed or emailed

**Edge case advantage:** An inspector arrives unannounced. The registered manager opens Regintelia on their phone, generates an Inspector Evidence Pack as a PDF, and hands the inspector a professionally formatted document organized by the exact quality statements the inspector will assess. Instead of "let me find that file," it's "here's everything, organized by your framework." The inspection shifts from adversarial to collaborative.

### 3.9 Readiness Journey

**What it does:** Provides a 10-step guided checklist for facilities to achieve inspection readiness, with contextual SAF guidance at each step.

**Edge case advantage:** A newly registered domiciliary care service has never been inspected. The founder has no compliance background. The Readiness Journey walks them through: onboard facility → upload core policies → upload clinical records → run first mock → review findings → upload missing evidence → run second mock → generate SAF coverage → generate Blue Ocean report → prepare Inspector Pack. Each step shows which SAF statements it satisfies and why.

### 3.10 Expiring Evidence Tracking

**What it does:** Monitors evidence expiry dates and alerts providers before documents expire.

**Edge case advantage:** A provider's fire safety certificate expires in 12 days. DBS checks for 3 staff members expire next month. Training matrices are 14 months old. Regintelia surfaces all of this in one view, sorted by urgency. The provider doesn't discover expired evidence when an inspector asks for it.

### 3.11 Multi-Facility Dashboard

**What it does:** Aggregates compliance status across all facilities for care groups operating multiple locations.

**Edge case advantage:** A care group with 23 residential homes and 8 domiciliary care branches sees a single dashboard showing SAF coverage, finding counts, and readiness scores per facility. They can identify their weakest facility (67% coverage, 4 CRITICAL findings) and their strongest (94% coverage, zero CRITICAL) — and allocate compliance team time accordingly.

### 3.12 Constitutional Metadata

**What it does:** Every API response and UI view includes provenance metadata: topic catalog version + hash, PRS logic profile version + hash, report source, snapshot timestamp, domain, reporting domain, and ingestion status.

**Why it matters:** If a regulation changes, or the topic catalog is updated, or the PRS logic is refined, every historical report can be traced to the exact version of every component that produced it. This is forensic-grade reproducibility.

### 3.13 Production-Grade Export System

**What it does:** Generates real, print-ready documents in PDF, Word (DOCX), and enriched CSV formats across all report types — mock findings, Blue Ocean reports, and Inspector Evidence Packs. Documents open correctly in Acrobat, Word, and Excel with professional formatting.

**Technical detail:**
- **PDF generation:** pdfkit-based binary PDF with title pages, severity colour coding, watermarks on every page, metadata footers (topic catalog version/hash, PRS logic version/hash), and formatted tables
- **DOCX generation:** Open XML Word documents via docx library with styled headings, tables, headers/footers, bullet lists, and colour-coded severity indicators — editable by care managers who need to annotate before sharing
- **Enriched CSV:** Action plan columns (action count, actions completed, owner role, target completion date), evidence coverage percentage per finding, and a `# SUMMARY` row with aggregate statistics (total findings, overall evidence coverage, open/verified actions, highest risk score)
- **Binary storage:** PDF and DOCX exports stored as base64-encoded content with a `contentEncoding` field, decoded on download — backward compatible with existing UTF-8 text exports
- **Format selection UI:** Users choose report type (Blue Ocean Board, Audit, Inspector Pack, CSV, PDF) and file format (PDF or Word) independently — a Blue Ocean Board can be downloaded as either PDF or DOCX

**Supported format matrix:**

| Report Type | PDF | DOCX | CSV | Markdown |
|---|---|---|---|---|
| Mock Findings | Yes | Yes | Yes (enriched) | No |
| Blue Ocean Board | Yes | Yes | No | Yes |
| Blue Ocean Audit | Yes | Yes | No | Yes |
| Inspector Evidence Pack | Yes | Yes | No | Yes |

**Edge case advantage:** A registered manager needs to email the Blue Ocean Board report to their governance committee before a meeting. They download it as a Word document, add a cover note, and email it — no "Failed to load PDF" errors, no raw markdown that non-technical board members can't open. The compliance lead prints the Inspector Evidence Pack as a PDF and places it in the physical inspection folder. The finance team opens the enriched CSV in Excel and filters by severity to estimate remediation costs from the action plan columns.

### 3.14 Progressive Disclosure UI

**What it does:** Presents information in three layers: Summary (counts, facts, status) → Evidence (supporting documents, audit results) → Trace (hash verification, metadata, lineage). Users cannot jump from Summary to Trace — they must pass through Evidence.

**Why it matters:** Prevents the "trust me" problem. A board member sees the summary. A compliance manager drills into evidence. An auditor verifies the trace. Each layer is designed for its audience.

---

## 4. Security & Compliance Posture

| Capability | Implementation | Why It Matters |
|-----------|---------------|---------------|
| Tenant isolation | PostgreSQL RLS (database-enforced) | Application bugs cannot leak data |
| Audit trail | Hash-chained, append-only, immutable | Tamper detection is cryptographic, not procedural |
| Content addressing | SHA-256 blob hashing | Evidence integrity is verifiable |
| Malware scanning | ClamAV with quarantine | Uploaded documents are scanned before processing |
| Auth | Clerk JWTs (production) + legacy tokens (dev) | Enterprise SSO-ready |
| Rate limiting | 100 req/15 min per tenant | Abuse prevention |
| Secrets scanning | Pre-commit hook | No credentials in codebase |
| Mock/regulatory wall | DB schema constraint | Architecturally impossible to leak mock data into regulatory records |
| No AI authority | AI is advisory only — cannot modify data, bypass validation, or auto-publish | Regulatory defensibility |
| Input safety | No free-text prompts in config, user input never re-injected as instructions | Prompt injection prevention |
| Version immutability | Versioned artifacts frozen after publish, CI-enforced | Historical reproducibility |
| Temporal safety | All evaluations reference immutable ProviderContextSnapshot | No retroactive judgment |

---

## 5. Competitive Advantages

### 5.1 vs. Checklist Apps (Log my Care, Care Compliance, QCS)

Checklist apps ask "did you do X?" Regintelia asks "can you prove X, and does your proof hold up under the analytical framework CQC actually uses?" The difference is between ticking a box and surviving a SAF quality statement deep-dive.

- **They store documents.** Regintelia audits them against SAF and tells you what's wrong before an inspector does.
- **They track tasks.** Regintelia traces findings to evidence to actions with cryptographic proof of the chain.
- **They generate reports.** Regintelia generates reports with root cause analysis, disconfirming tests, and SMART remediation — the level of analysis CQC's own assessment teams produce.

### 5.2 vs. Compliance Consultants

A good CQC compliance consultant costs GBP 500-1,500/day, visits quarterly, and produces a report based on what they saw that day. Regintelia is continuous, deterministic, and doesn't have a bad day.

- A consultant's report reflects their judgment. Regintelia's report reflects the evidence, scored against published SAF statements, with the exact logic profile version that produced each score.
- A consultant might miss that your infection control policy references 2019 guidance. Regintelia's document audit catches it every time.
- A consultant can't monitor 15 peer providers' inspection results and alert you to emerging risks. Regintelia does this automatically.

**Regintelia doesn't replace consultants — it makes them 10x more effective.** A consultant using Regintelia spends their day on judgment calls and relationship management, not reading policies and checking dates.

### 5.3 vs. Generic GRC Platforms (Vanta, Drata, OneTrust)

Generic GRC platforms are designed for ISO 27001, SOC 2, GDPR — frameworks with stable, predictable control sets. CQC is different:

- CQC inspectors exercise professional judgment. The same evidence can produce different outcomes depending on provider context (PRS state), service type, and the specific inspector's focus areas.
- CQC uses the Single Assessment Framework with 34 quality statements, not a fixed checklist.
- CQC evaluates "lived experience" — whether care is actually good, not just whether procedures exist.

Regintelia is purpose-built for this regulatory environment. PRS-aware severity scoring, service-type topic selection, and SAF34 quality statement mapping are not bolt-on features — they are the core domain model.

---

## 6. Edge Cases & Niche Customer Segments

### 6.1 Providers Under Special Measures or Enforcement Action

**The situation:** CQC has placed the provider under heightened scrutiny. Follow-up inspections happen at shorter intervals. Every finding carries a higher severity multiplier. The provider needs to demonstrate rapid, verifiable improvement — not just "we've updated the policy" but "here's the policy, here's the audit trail, here's the root cause analysis, here's the remediation plan with deadlines, here's verification that each action was completed."

**Why Regintelia wins:** PRS-aware severity scoring with 1.5x multiplier under Special Measures. Contradiction Hunt questioning mode that probes inconsistencies between stated policy and actual practice. Blue Ocean reports with RCA and disconfirming tests that demonstrate analytical rigour to the relationship manager. The provider doesn't just comply — they demonstrate they understand why they failed and what they've done about it.

**Niche:** Turnaround specialists, interim registered managers brought in to rescue failing services, CQC relationship managers who need structured evidence of improvement.

### 6.2 Care Groups Acquiring New Services

**The situation:** A care group acquires a residential home that was previously independently managed. They need to: onboard the facility, ingest existing evidence, assess current compliance, identify gaps, and bring the new service up to group standards — fast.

**Why Regintelia wins:** Bulk onboarding (50 facilities/request). CQC auto-enrichment populates facility data from CQC's registry. Document audit processes existing evidence and produces immediate SAF coverage map. Multi-facility dashboard shows how the new acquisition compares to existing services. The group can quantify the compliance gap on day one, not after 3 months of manual review.

**Niche:** Private equity-backed care groups (e.g., HC-One, Four Seasons, Barchester), franchise operators, and care group M&A advisors who need compliance due diligence.

### 6.3 Domiciliary Care Providers

**The situation:** Home care providers face unique challenges — no physical premises, distributed workforce, visit-based rather than facility-based care. Standard compliance tools designed for residential homes miss critical domiciliary evidence types: visit logs, missed visit records, electronic call monitoring (ECM) data.

**Why Regintelia wins:** Service-type-aware topic selection excludes irrelevant residential topics (premises-equipment, nutrition-hydration). Domiciliary-specific evidence types (VISIT_LOG, MISSED_VISIT_RECORD) with SAF mappings (S2, S3, S6, W4, R1, R4, C1). Document audit prompts tailored to domiciliary care context. False-positive-resistant document type detection (co-occurrence validation prevents "GP latest call notes" from being misclassified as a missed visit record).

**Niche:** Growing domiciliary care providers (5-50 care workers), domiciliary care franchises (e.g., Home Instead, Bluebird Care), supported living providers, and personal care agencies.

### 6.4 Newly Registered Services (Never Inspected)

**The situation:** A new care service has registered with CQC but has never been inspected. They have no rating, no inspection history, no benchmark. They don't know what CQC will focus on or what "good" looks like.

**Why Regintelia wins:** The Readiness Journey provides a structured 10-step path from zero to inspection-ready. Mock inspections simulate CQC questioning patterns so the registered manager practises before the real thing. SAF34 coverage shows exactly which quality statements have evidence and which don't. Blue Ocean reports provide the analytical framework CQC will use — before CQC uses it.

**Niche:** First-time registered managers, startup care services, adult social care entrepreneurs, local authority-funded new services.

### 6.5 Providers Preparing for CQC's Well-Led Framework Reviews

**The situation:** CQC's Well-Led reviews assess governance, leadership, and organisational culture — W1 through W8. These are the hardest quality statements to evidence because they're about systems, not individual care records.

**Why Regintelia wins:** Blue Ocean reports include Contributing Factors analysis (section 7) that identifies systemic patterns across findings — exactly what Well-Led reviewers look for. RCA hypothesis templates include Governance Erosion (triggered for Reg 12/13/15/18) and Cultural/Systemic Gap (CRITICAL findings) — the root causes that drive Well-Led ratings. The Quality Gates section explicitly scores domain consistency and determinism — demonstrating that the provider's quality assurance system is rigorous enough to produce reproducible results.

**Niche:** NHS trusts preparing for Well-Led reviews, large care groups with governance committees, providers whose last Well-Led rating was "Requires Improvement."

### 6.6 Multi-Sector Providers (CQC + Immigration)

**The situation:** Some providers are regulated by both CQC (for care quality) and the Home Office (for sponsored worker compliance). They need to manage two regulatory domains without cross-contamination.

**Why Regintelia wins:** Domain separation (CQC vs IMMIGRATION) is a first-class concept. Disabled domains produce zero findings and zero actions. Evidence can be tagged to specific domains. Reports are domain-scoped. A provider can run their CQC compliance and immigration compliance through the same platform without one domain's findings leaking into the other's reports.

**Niche:** Care providers sponsoring overseas workers (Skilled Worker visa), nursing homes with significant international recruitment, domiciliary care agencies using the health and care visa route.

### 6.7 Providers Facing Whistleblowing or Safeguarding Investigations

**The situation:** A whistleblowing complaint or safeguarding referral triggers CQC scrutiny. The provider needs to demonstrate they took the concern seriously, investigated thoroughly, and implemented remediation — with a complete audit trail.

**Why Regintelia wins:** Immutable, hash-chained audit log proves when evidence was uploaded, when findings were recorded, and when actions were taken. No one can backdate a policy upload or delete an inconvenient finding. The tamper-detection chain means the provider can prove to CQC (or a tribunal) that their response timeline is authentic.

**Niche:** Providers under safeguarding investigation, providers responding to CQC Section 31 notices, legal teams advising on regulatory defence.

### 6.8 Compliance Consultancies & CQC Specialists

**The situation:** Independent compliance consultants manage portfolios of 10-30 care providers. They visit each provider quarterly, review evidence, and produce reports manually. They're capacity-constrained — each report takes 2-3 days to write.

**Why Regintelia wins:** A consultant can onboard all their clients, trigger document audits on uploaded evidence, and generate Blue Ocean reports — replacing 3 days of manual work with 3 minutes of automated analysis. The consultant's value shifts from "I read your policies" to "I interpret the analysis and advise on strategy." They can serve 3x more clients at higher value.

**Niche:** Independent CQC compliance consultants, managed service providers for care compliance, local authority quality assurance teams.

### 6.9 Providers with Complex or Hybrid Service Types

**The situation:** Some facilities provide multiple service types — residential care with nursing, or supported living with personal care. Standard compliance tools treat them as a single type.

**Why Regintelia wins:** Service-type-aware topic selection and evidence requirements adapt to the registered service type. While the current system normalises hybrid types to a primary type, the architecture supports per-facility service type configuration. A residential home with nursing gets nursing-relevant topics; a supported living service gets supported-living-relevant topics.

**Niche:** Dual-registered services, providers transitioning between service types, complex care providers (learning disability + nursing).

### 6.10 Board Members & Non-Executive Directors

**The situation:** NEDs and board members need assurance that compliance is robust but don't have time (or expertise) to read clinical audit reports. They need board-level summaries with risk quantification.

**Why Regintelia wins:** BLUE_OCEAN_BOARD reports are designed specifically for governance committees. Executive summary with finding counts and severity. Risk outlook with composite scores. Quality gates that give a red/amber/green at a glance. Progressive disclosure means the board member sees the summary; if they want to drill down, the evidence is one click away.

**Niche:** Care group boards, clinical governance committees, NHS trust board assurance frameworks, CQC's own governance teams reviewing provider submissions.

---

## 7. Technical Differentiators (Engineering)

### 7.1 Deterministic Reproducibility

Every report, score, and classification can be reproduced independently. The system ships with version-immutable artifacts (topic catalog, PRS logic profiles) that are frozen after publish and CI-enforced. A report generated in March 2026 using Topic Catalog v1 and PRS Logic v1 will produce identical hashes if regenerated from the same inputs in March 2028.

### 7.2 Constitutional Metadata

Every API response includes provenance metadata: which version of which component produced this output, from which snapshot, at what time, in which domain. This is not logging — it is embedded in the response payload. A frontend rendering a finding must display the constitutional metadata. This is enforced by the `buildConstitutionalMetadata()` function that wraps all API responses.

### 7.3 Phase-Gated Development

The system is built in strict sequential phases (0-11), each with CI-enforced gate criteria. Later phases cannot backfill earlier phases. Phase gate tests run in CI as a blocking check — a PR that breaks a phase gate cannot merge. This prevents scope creep and ensures architectural integrity.

### 7.4 Two Vitest Configurations

Root tests (packages, scripts, web) and API tests run in separate Vitest configurations with separate path aliases. This ensures packages can be tested independently of the API, and the API's Prisma-dependent tests don't pollute the root test suite.

### 7.5 Background Job Architecture

BullMQ with Redis backend, with automatic in-memory fallback for development and testing. Job types: CQC report scraping, malware scanning, document auditing, evidence processing, AI insights. All jobs are tenant-scoped and audit-logged.

### 7.6 Dual Authentication

Clerk JWTs for production with enterprise SSO support. Legacy token authentication for development and E2E testing. Both modes coexist — the API checks legacy tokens first, then falls back to Clerk JWT verification. This enables Playwright E2E tests to run without a Clerk account.

---

## 8. What Regintelia Is Not

- **Not a care management system.** It doesn't schedule shifts, manage medication rounds, or record daily care notes. It ingests evidence from systems that do.
- **Not a document management system.** It doesn't version-control Word documents or manage approval workflows. It stores evidence blobs, audits them, and maps them to regulatory requirements.
- **Not an AI chatbot.** AI is advisory only, bounded, and never authoritative. There is no free-text "ask anything" interface. AI insights are generated within the structured mock inspection framework with bounded follow-ups.
- **Not a CQC replacement.** It doesn't rate providers or make regulatory judgments. It helps providers prepare for the people who do.

---

## 9. Platform Summary

| Dimension | Detail |
|-----------|--------|
| **Target market** | UK CQC-registered care providers (residential, nursing, domiciliary, supported living, hospice) |
| **Primary users** | Registered managers, compliance leads, board members, CQC compliance consultants |
| **Core value** | Evidence-based inspection readiness with provable correctness |
| **Key differentiator** | Deterministic, hash-verified, PRS-aware, service-type-specific compliance intelligence |
| **Architecture** | Immutable domain model, hash-chained audit, RLS multi-tenancy, content-addressed storage |
| **AI posture** | Advisory only — never authoritative, never auto-publishing, always bounded |
| **Export formats** | PDF (pdfkit binary), Word DOCX, enriched CSV, markdown — across mock findings, Blue Ocean Board/Audit, and Inspector Evidence Pack |
| **Evidence types** | 44 recognized types across clinical, governance, staffing, legal, domiciliary, safety, monitoring |
| **SAF coverage** | 34 quality statements across 5 Key Questions, three-tier evidence mapping (AI-verified, type heuristic, keyword fallback) |
| **Security** | RLS, hash-chain audit, ClamAV, Clerk SSO, secrets scanning, mock/regulatory DB constraint |
| **Infrastructure** | PostgreSQL, Redis/BullMQ, Node.js/Express API, Next.js 14 UI, Prisma ORM |
| **Development model** | 12-phase sequential gating with CI enforcement |
| **Current phase** | Phase 11 (Blue Ocean) — PhD-level analyst reporting |
