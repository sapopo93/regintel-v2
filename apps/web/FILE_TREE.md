# RegIntel Web App File Structure

## Pages (apps/web/src/app)

```
app/
├── overview/
│   ├── page.tsx           # Provider overview (stats + details)
│   └── page.module.css
├── topics/
│   ├── page.tsx           # Topics list
│   ├── page.module.css
│   └── [topicId]/
│       ├── page.tsx       # Topic detail
│       └── page.module.css
├── mock-session/
│   ├── page.tsx           # Mock sessions list
│   ├── page.module.css
│   └── [sessionId]/
│       ├── page.tsx       # Session detail
│       └── page.module.css
├── findings/
│   ├── page.tsx           # Findings list
│   ├── page.module.css
│   └── [findingId]/
│       ├── page.tsx       # Finding detail (Summary → Evidence → Trace)
│       └── page.module.css
├── evidence/
│   ├── page.tsx           # Evidence records list
│   └── page.module.css
├── exports/
│   ├── page.tsx           # Export generation (CSV/PDF)
│   └── page.module.css
└── audit/
    ├── page.tsx           # Audit trail
    └── page.module.css
```

## API Integration (apps/web/src/lib/api)

```
lib/api/
├── client.ts              # API client with all endpoint methods
└── types.ts               # TypeScript types for API responses
```

## E2E Tests (apps/web/e2e)

```
e2e/
└── menu-navigation.spec.ts   # Playwright tests for menu navigation
```

## API Endpoints (apps/api/src)

All endpoints return constitutional metadata + data:

- GET /v1/providers
- GET /v1/providers/:id/overview
- GET /v1/providers/:id/topics
- GET /v1/providers/:id/topics/:topicId
- GET /v1/providers/:id/mock-sessions
- GET /v1/providers/:id/mock-sessions/:sessionId
- GET /v1/providers/:id/findings
- GET /v1/providers/:id/findings/:findingId
- GET /v1/providers/:id/evidence
- GET /v1/providers/:id/audit-trail
- POST /v1/providers/:id/exports
