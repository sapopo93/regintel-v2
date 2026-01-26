# RegIntel v2 Rendering Manifest

This document defines which routes use static vs dynamic rendering in the Next.js 14 application.

## Route Groups

### `(app)` - Authenticated Routes (Dynamic Rendering)

**Rendering Config:**
- `export const dynamic = 'force-dynamic'`
- `export const revalidate = 0`
- `export const fetchCache = 'force-no-store'`

**Why Dynamic:**
- Require authentication (token in query params or headers)
- Use `useSearchParams()` for provider/facility context
- Display user-specific data
- Cannot be prerendered at build time

**Routes:**
- `/facilities` - Facility list (requires provider context)
- `/overview` - Provider overview dashboard
- `/exports` - Export generation interface
- `/mock-session` - Mock inspection session list
- `/mock-session/[sessionId]` - Mock inspection session detail
- `/topics` - Topic catalog viewer
- `/topics/[topicId]` - Topic detail with evidence
- `/audit` - Audit trail viewer
- `/evidence` - Evidence management
- `/findings` - Findings list
- `/findings/[findingId]` - Finding detail
- `/login` - Login page (uses `useSearchParams()` for redirect, requires dynamic rendering)

### Static Routes

**Routes:**
- `/` - Root page (redirects to `/login` or authenticated route)
- `/providers` - Provider selection page (static)
- `/api/*` - API routes (not affected by route groups)

## Route Group Benefits

1. **Architectural Clarity**: File structure reflects rendering intent
2. **Zero Build Warnings**: No more prerender errors
3. **Performance**: Public pages cached, authenticated pages always fresh
4. **Maintainability**: New pages automatically inherit rendering mode
5. **Explicit Contracts**: Layout enforces rendering rules

## Testing Checklist

After implementing route groups:

- [ ] Run `pnpm build` - verify 0 prerender warnings
- [ ] Check build output for route rendering modes:
  - `○` (Static) for `/login`
  - `ƒ` (Dynamic) for all `/(app)/*` routes
- [ ] Start dev server: `pnpm web:dev`
- [ ] Test all authenticated routes with query params:
  - `/facilities?provider=demo-provider&facility=demo-facility`
  - `/overview?provider=demo-provider&facility=demo-facility`
  - `/exports?provider=demo-provider&facility=demo-facility`
  - etc.
- [ ] Test authentication flow: `/` → `/login` → `/facilities`
- [ ] Test exports still generate correctly (CSV, PDF, Blue Ocean)
- [ ] Run all tests: `pnpm test`
- [ ] Run E2E tests: `cd apps/web && pnpm test:e2e`

## Rollback Plan

If issues occur:

1. Keep route group structure
2. Re-add `export const dynamic = "force-dynamic"` to individual pages
3. Route groups don't break anything - they're just folders with parentheses
4. Next.js ignores `(group)` names in URLs - routing unchanged

## Implementation Details

This refactor was completed to address Next.js 14 prerender warnings for authenticated pages using `useSearchParams()`. The route group architecture enforces rendering modes at the layout level rather than per-page, providing cleaner separation and zero build warnings.

**Files Changed:**
- NEW: `apps/web/src/app/(app)/layout.tsx` - Authenticated routes layout with dynamic rendering
- MOVED: 24 files (12 pages + 12 CSS modules) from `app/` to `app/(app)/` including login page
- MODIFIED: Removed redundant `export const dynamic = "force-dynamic"` from 12 pages
- MODIFIED: Updated `scripts/feature-map.test.ts` to normalize route groups in path comparison

**Verification:**
- Build output shows `○` (Static) for `/` and `/providers`
- Build output shows `ƒ` (Dynamic) for all `/(app)/*` routes including `/login`
- No prerender warnings or errors
- All 309 tests passing
