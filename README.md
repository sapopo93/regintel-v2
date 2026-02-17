# RegIntel v2 — Regulatory Intelligence Platform

**RegIntel helps care providers prove inspection readiness with evidence, before inspectors arrive, without guessing or checklist theatre.**

---

## What It Does

RegIntel is a compliance intelligence platform for UK CQC-registered care providers. It replaces manual compliance tracking, subjective mock inspections, and scattered evidence with a deterministic, auditable system.

### Core Capabilities

| Capability | Description |
|-----------|-------------|
| **Regulation Intelligence** | Versioned CQC regulations with section-level change detection. When regulations change, you know immediately. |
| **Regulatory Drift Engine** | Detects when policies drift from regulation. Classifies changes as cosmetic, clarifying, or normative. Generates impact assessments. |
| **Policy Mapping** | Links provider policies to specific regulation clauses. Highlights stale mappings when regulation changes. |
| **Mock Inspection Engine** | Topic-driven, evidence-first mock inspections. Bounded AI questioning (no wandering). Deterministic scoring and severity classification. |
| **Evidence Management** | Secure evidence upload with proof-of-existence. Evidence linked to findings and actions with full traceability. |
| **Remediation Controls** | Findings generate traceable actions. Closure requires verification evidence. State machine enforcement. |
| **Provider Context Awareness** | Lifecycle-aware logic — new providers, established, special measures, enforcement action. Time-frozen context snapshots. |
| **Inspection Confidence Report** | What would likely pass. What would likely fail. Why — with full traceability to evidence and regulation. |

### CQC Domains Covered
- ✅ Safe
- ✅ Effective
- ✅ Caring
- ✅ Responsive
- ✅ Well-Led

### Additional Domain
- ✅ Immigration / Sponsor Licence compliance (optional overlay)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Frontend                     │
│          Next.js 14 + React 18              │
│         Clerk Authentication                 │
│         Stripe Billing                       │
├─────────────────────────────────────────────┤
│                   API                        │
│            Express + TypeScript              │
│          Prisma ORM + PostgreSQL             │
│         Multi-tenant (RLS enforced)          │
├─────────────────────────────────────────────┤
│                 Worker                       │
│       Background processing tasks            │
│    Regulatory drift detection jobs           │
└─────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript |
| Authentication | Clerk (SSO-ready, MFA-capable) |
| Payments | Stripe (subscription + one-time) |
| API | Express.js, TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Testing | Vitest (unit), Playwright (E2E) |
| Monorepo | pnpm workspaces |

---

## Engineering Quality

### Phase-Gated Development
RegIntel was built using strict phase-gated engineering. Each phase has mandatory gate tests that must pass before the next phase begins. No exceptions.

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Security, tenancy, audit immutability | ✅ Complete |
| Phase 1 | Canonical domain model (Regulation → Action) | ✅ Complete |
| Phase 2 | Regulatory Drift Engine | ✅ Complete |
| Phase 3 | Impact assessment & non-destructive migrations | ✅ Complete |
| Phase 4 | PRS Logic Profiles (Provider Regulatory State) | ✅ Complete |
| Phase 5 | Stateful Mock Inspection Engine | ✅ Complete |
| Phase 6 | Topic Catalog & relevance control | ✅ Complete |

### Security Model
- **Multi-tenant isolation** — Row-Level Security enforced at database layer
- **Immutable audit log** — Hash-chained, tamper-evident
- **Mock/regulatory separation** — Simulated data cannot contaminate regulatory history
- **Evidence integrity** — Proof-of-existence even after deletion
- **Prompt injection defence** — AI behaviour bounded by topic catalog
- **No secrets in repo** — Automated secrets scanning

### Codebase Metrics
- **143 source files**
- **~32,000 lines of TypeScript**
- **244-line Prisma schema** (15+ models)
- **Comprehensive test suite** (Vitest + Playwright)
- **Full documentation suite** (PRD, security model, phase manifest, topic catalog)

---

## Project Structure

```
regintel-v2/
├── apps/
│   ├── web/          # Next.js frontend
│   ├── api/          # Express API + Prisma
│   └── worker/       # Background jobs
├── packages/         # Shared libraries
├── docs/             # Engineering documentation
├── scripts/          # Build & deployment scripts
└── Documentation
    ├── regintel_mvp_prd.md              # Product Requirements
    ├── regintel_phase_gates.md          # CI-enforced phase gates
    ├── regintel_phase_manifest.md       # Phase delivery spec
    ├── regintel_security_model.md       # Security constitution
    └── regintel_topic_catalog_v_1.md    # Mock inspection topics
```

---

## User Journeys

### 1. New Provider Readiness
Upload policies → Declare provider state → Run mock inspection → Receive confidence report

### 2. Re-Inspection Preparation
Select inspection context → Run mock under correct PRS → Review findings → Upload remediation evidence → Verify closure

### 3. Regulatory Change Response
Regulation change detected → Affected policy mappings highlighted → Impact assessment generated → Provider reviews and accepts/modifies

---

## Setup

### Prerequisites
- Node.js 18+
- pnpm 8+
- PostgreSQL 14+

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/regintel

# Clerk Authentication
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...

# Stripe
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

### Quick Start
```bash
pnpm install
pnpm prisma migrate deploy
pnpm dev
```

---

## Deliverables Included in This Repository

1. **Full source code** — Frontend, API, Worker, shared packages
2. **Database schema** — Prisma schema with migrations
3. **Test suite** — Unit tests (Vitest) + E2E tests (Playwright)
4. **Product documentation** — PRD, security model, phase manifest
5. **Topic catalog** — Structured mock inspection question bank covering all CQC domains
6. **Engineering constitution** — Coding standards and architectural rules
7. **Phase gates** — CI-enforceable quality gates for continued development

---

## Licence

Proprietary. All rights reserved.

---

*Built by Tender Risk Assurance — [tenderriskassurance.co.uk](https://tenderriskassurance.co.uk)*
