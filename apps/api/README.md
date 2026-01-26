# RegIntel API Server

Express.js REST API for RegIntel Phase 10 UI.

## Installation

```bash
pnpm install
```

## Running

```bash
# Development mode with hot reload
pnpm dev

# Production build and start
pnpm build
pnpm start
```

Server runs on http://localhost:3001 (configurable via PORT env var).

## Endpoints

All endpoints return constitutional metadata:

```typescript
{
  topicCatalogVersion: "v1",
  topicCatalogHash: "sha256:...",
  prsLogicVersion: "v1",
  prsLogicHash: "sha256:...",
  snapshotTimestamp: "2026-01-23T10:00:00Z",
  domain: "CQC"
}
```

### Provider Endpoints

- `GET /v1/providers` - List all providers
- `GET /v1/providers/:id/overview` - Provider overview with stats

### Topic Endpoints

- `GET /v1/providers/:id/topics` - List topics
- `GET /v1/providers/:id/topics/:topicId` - Topic detail

### Mock Session Endpoints

- `GET /v1/providers/:id/mock-sessions` - List sessions
- `GET /v1/providers/:id/mock-sessions/:sessionId` - Session detail

### Finding Endpoints

- `GET /v1/providers/:id/findings` - List findings
- `GET /v1/providers/:id/findings/:findingId` - Finding detail

### Evidence & Audit

- `GET /v1/providers/:id/evidence` - List evidence records
- `GET /v1/providers/:id/audit-trail` - Audit log

### Exports

- `POST /v1/providers/:id/exports` - Generate CSV/PDF export

## Features

- CORS enabled for local development
- Constitutional metadata on all responses
- Type-safe with TypeScript
- Mock data for development
