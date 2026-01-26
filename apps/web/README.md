# RegIntel v2 - UI Implementation

Forensic-grade user interface for RegIntel v2 regulatory compliance platform.

## Philosophy

**"Make it impossible for a user to misinterpret the system."**

The UI is a **pure projection layer** - all business logic remains in the backend. The UI's job is to surface determinism, traceability, and trust.

## Constitutional Requirements

Every rendered view must answer:

1. **Which version?** - Topic Catalog v1, PRS Logic v1
2. **Which hash?** - Content-addressed artifact identifiers
3. **Which time?** - ISO 8601 snapshot timestamp
4. **Which domain?** - CQC or IMMIGRATION

If a view cannot answer these, it does not render.

## Architecture

### Three-Layer Progressive Disclosure

Every finding/evidence view has three layers:

1. **Summary** (what) - Facts only, no interpretation
2. **Evidence** (why) - Supporting data, accessible from Summary
3. **Trace** (how) - Deterministic reasoning chain, accessible from Evidence

**No shortcuts.** Users must navigate through layers sequentially.

### Visual Safety Rules

- **Mock inspection screens:** RED frame (4px) + "SIMULATION — NOT REGULATORY HISTORY" watermark
- **No traffic lights:** No green/yellow/red for good/warning/bad
- **Green only for:** "verified complete" status
- **Red only for:** Simulation frames and badges
- **Monospace for:** Hashes, IDs, timestamps
- **No emojis:** Ever

## Technology Stack

- **Framework:** Next.js 14+ with App Router
- **Language:** TypeScript (strict mode)
- **Styling:** CSS Modules with design tokens
- **State:** React Server Components + minimal client state
- **API Client:** Type-safe fetch wrapper using backend types
- **Testing:** Vitest with UI constitutional gate tests

## Project Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── overview/          # Provider overview screen
│   │   ├── topics/            # Topics list and detail
│   │   ├── mock-session/      # Mock inspection sessions
│   │   ├── findings/          # Findings list and detail
│   │   ├── evidence/          # Evidence inventory
│   │   ├── exports/           # Export generation
│   │   └── audit/             # Audit trail
│   │
│   ├── components/
│   │   ├── constitutional/    # Version, hash, time, domain components
│   │   ├── mock/              # Simulation frame, watermark, badges
│   │   ├── disclosure/        # Progressive disclosure panels
│   │   ├── layout/            # Sidebar, page header
│   │   ├── findings/          # Finding cards, WHY panel
│   │   ├── evidence/          # Evidence tables
│   │   └── audit/             # Audit event displays
│   │
│   ├── lib/
│   │   ├── api/               # Type-safe API client
│   │   ├── constants.ts       # UI constants (watermarks, labels)
│   │   ├── format.ts          # Display formatting utilities
│   │   └── validators.ts      # Constitutional UI validators
│   │
│   └── types/
│       └── ui.ts              # UI-specific types
│
├── ui.test.ts                 # UI phase gate tests
├── vitest.config.ts
└── README.md
```

## Design Tokens

Minimal, forensic palette:

```css
/* Base Grayscale */
--color-white: #ffffff
--color-charcoal: #1a1a1a
--color-slate-50 through --color-slate-900

/* Semantic Colors - STRICTLY CONTROLLED */
--color-simulation: #dc2626  /* Red - ONLY for simulation */
--color-verified: #16a34a    /* Green - ONLY for verified complete */
```

**No traffic light colors.** No interpretation through color.

## Key Components

### Constitutional Components

**MetadataBar** - Displays version, hash, time, domain on every view
**HashDisplay** - Truncated hash with copy + tooltip
**VersionBadge** - "Topic Catalog v1 ✓"
**TimestampDisplay** - ISO 8601 timestamp
**DomainBadge** - CQC / IMMIGRATION badge

### Mock Safety Components

**SimulationFrame** - Red border wrapper for mock screens
**SimulationWatermark** - Diagonal "SIMULATION — NOT REGULATORY HISTORY"
**MockBadge** - Origin badges (MOCK, CQC, SELF)
**FollowUpCounter** - "Follow-ups used: 2 / 4"

### Disclosure Components

**DisclosurePanel** - Three-layer disclosure container
**SummaryLayer** - What happened (facts only)
**EvidenceLayer** - Why it happened (supporting data)
**TraceLayer** - How the conclusion was reached (WHY panel)

### Layout Components

**Sidebar** - Persistent left sidebar (never collapses)
**PageHeader** - Page title + metadata bar

## Testing

### UI Phase Gate Tests

Run UI constitutional validation:

```bash
pnpm vitest run -t "ui:constitutional"  # Every view must answer: version, hash, time, domain
pnpm vitest run -t "ui:mock-safety"     # Mock screens have red frame + watermark
pnpm vitest run -t "ui:projection-purity" # No business logic in UI
pnpm vitest run -t "ui:disclosure"      # Progressive disclosure enforcement
pnpm vitest run -t "ui:no-interpretation" # Facts only, no traffic lights/emojis
```

Run all UI tests:

```bash
pnpm test
```

### Manual Testing Checklist

- [ ] Provider Overview shows facts only (no risk scores)
- [ ] Topic View shows follow-up counter from backend
- [ ] Mock Session has red frame (4px border)
- [ ] Mock Session has "SIMULATION — NOT REGULATORY HISTORY" watermark
- [ ] MOCK badge appears on mock findings
- [ ] Findings List has "Show Evidence" button
- [ ] Evidence layer has "Show Trace" button
- [ ] WHY Panel shows regulation section, evidence required/provided
- [ ] Evidence Screen is pure inventory (no aggregation)
- [ ] No emojis anywhere
- [ ] No traffic light colors (green/yellow/red for good/warning/bad)
- [ ] Green only appears for "verified complete"
- [ ] Red only appears for simulation frame

## Development

### Install dependencies

```bash
pnpm install
```

### Run development server

```bash
pnpm dev
```

### Build for production

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

## API Integration

The UI is a pure projection layer. All data comes from the backend API:

- **No business logic** - Severity, risk scores, evidence requirements computed by backend
- **No sorting** - Backend pre-sorts all lists
- **No aggregation** - Backend pre-computes all summaries
- **Constitutional metadata** - Every API response includes version, hash, time, domain

See `src/lib/api/client.ts` for the type-safe API client implementation.

## Phase Gate Compliance

This UI implementation satisfies Phase 10 requirements:

- **ui:constitutional** - Every view renders version, hash, time, domain
- **ui:mock-safety** - Mock screens visually distinct with red frame + watermark
- **ui:projection-purity** - Zero business logic in UI components
- **ui:disclosure** - Three-layer progressive disclosure enforced
- **ui:no-interpretation** - Facts only, no traffic lights or emojis

## Contributing

1. Read the UI constitution (this README)
2. Every new view MUST satisfy constitutional requirements
3. NO traffic light colors (green/yellow/red for good/warning/bad)
4. NO business logic in UI (all computation in backend)
5. NO emojis
6. Write phase gate tests for new invariants

## License

Proprietary - RegIntel v2 Platform
