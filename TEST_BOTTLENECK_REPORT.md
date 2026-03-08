# RegIntel E2E Test Bottleneck Report

**Date:** 2026-03-01
**Environment:** macOS Darwin 25.3.0 / local dev
**Playwright Version:** 1.58.1
**Report Author:** Automated analysis (Claude Sonnet 4.6)

---

## Executive Summary

All 10 E2E test suites **fail to execute** due to one root cause: the PostgreSQL database `provereg_test` does not exist on `localhost:5432`. The API server crashes on startup when it cannot hydrate `PrismaStore` from the database. Playwright waits up to 60,000ms for `http://localhost:3001/health` before running any test, so every suite times out before a single test case runs.

**Top 5 blockers:**

1. **CRITICAL** — Database `provereg_test` does not exist. API exits with `PrismaClientInitializationError` on every launch. Zero tests run.
2. **CRITICAL** — No fallback when DB is unavailable. Env default selects `PrismaStore` in dev/test with no graceful degradation to `InMemoryStore`.
3. **HIGH** — Playwright `webServer` timeout is 60,000ms. When API crashes immediately, Playwright wastes the full 60s before surfacing the error.
4. **HIGH** — `CQC_API_KEY` is not set. Even with the DB fixed, `facility-cqc-pdf.spec.ts` and `pipeline-end-to-end.spec.ts` will fail with 401 errors.
5. **MEDIUM** — `FOUNDER_TOKEN`/`PROVIDER_TOKEN` mismatch: Playwright injects `test-founder-token` but API `.env` has `demo-founder-token-12345`. When `reuseExistingServer` picks up a manually-started API, all auth calls return 401.

---

## Environment Check Results

### Servers at Test Time

| Service | Port | Status | Notes |
|---------|------|--------|-------|
| Web (Next.js) | 3000 | UP | Responds 307 redirect to /providers; page loads correctly |
| API (Express) | 3001 | DOWN | Crashes on startup — DB not found |
| PostgreSQL | 5432 | DOWN | `provereg_test` does not exist |

### Environment Variables (non-sensitive)

| Variable | Value | Status |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/provereg_test` | DB missing |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | Correct |
| `FOUNDER_TOKEN` (API .env) | `demo-founder-token-12345` | Mismatches Playwright default |
| `PROVIDER_TOKEN` (API .env) | `demo-provider-token-12345` | Mismatches Playwright default |
| `CQC_API_KEY` | Not set | Will cause 401 on CQC lookups |
| `REDIS_URL` | `redis://localhost:6379` | Falls back to in-memory queue |
| `BLOB_STORAGE_PATH` | `/tmp/provereg-evidence-blobs` | Ephemeral — OK for tests |
| `E2E_TEST_MODE` | `true` (injected by Playwright config) | Clerk bypassed |

### Playwright Config (`apps/web/playwright.config.ts`)

- `testDir`: `./e2e`
- `fullyParallel`: true
- `retries`: 0 (local), 2 (CI)
- `webServer[0]` (Web): `pnpm dev` on port 3000, `reuseExistingServer: !CI`
- `webServer[1]` (API): `pnpm dev` in `../api` targeting port 3001/health, `reuseExistingServer: !CI`
- No explicit `webServer.timeout` set — defaults to 60,000ms

---

## Results by Test Suite

### 1. founder_full_journey.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/founder_full_journey.spec.ts` (184 lines)
**Tests:** 1 large end-to-end journey
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts (DB missing). ~60 seconds wasted per run.
**Covers:** Provider creation, facility onboarding, evidence upload, mock session, Blue Ocean export download, audit trail.

---

### 2. constitutional-requirements.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/constitutional-requirements.spec.ts` (108 lines)
**Tests:** 14 tests (version rendering + hash rendering for 7 sidebar pages)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts.
**Covers:** All 7 pages must include `topicCatalogVersion`, `prsLogicVersion`, SHA-256 hashes, timestamp, domain in every API response.

---

### 3. api-integration.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/api-integration.spec.ts` (303 lines)
**Tests:** 8 tests (API to UI data flow, constitutional metadata propagation, no client-side risk/severity calculations)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts.
**Secondary issue (code smell):** Multiple `await page.waitForTimeout(1500)` calls — a fragile timing-based anti-pattern that will be flaky under load.

---

### 4. mock-safety.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/mock-safety.spec.ts` (138 lines)
**Tests:** 4 tests (simulation frame, PRACTICE INSPECTION watermark, SYSTEM_MOCK badge, darker border)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts.

---

### 5. progressive-disclosure.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/progressive-disclosure.spec.ts` (191 lines)
**Tests:** 4 tests (Summary visible on load, Evidence hidden initially, Trace hidden initially, sequential unlock)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts.
**Secondary issue:** Uses `if (await firstFinding.isVisible())` guards — if no findings exist, test body is skipped and test passes vacuously, masking regressions.

---

### 6. no_dead_buttons.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/no_dead_buttons.spec.ts` (173 lines)
**Tests:** 2 tests (sidebar links hit real endpoints, primary buttons trigger real API calls)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts.

---

### 7. menu-navigation.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/menu-navigation.spec.ts` (204 lines)
**Tests:** 6 tests (sidebar navigation correctness, endpoint verification, constitutional metadata display)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts.

---

### 8. facility-cqc-pdf.spec.ts — FAIL (pre-test timeout + secondary failure)

**File:** `apps/web/e2e/facility-cqc-pdf.spec.ts` (72 lines)
**Tests:** 1 test (facility creation + CQC PDF upload + evidence record)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.` (primary)
**Secondary failure (would occur after DB fix):** CQC location lookup for `1-1881302287` will return 401 — `CQC_API_KEY` is not set.
**Note:** The PDF fixture (`apps/web/e2e/fixtures/St Joseph Nursing Home.pdf`) DOES exist on disk.

---

### 9. pipeline-end-to-end.spec.ts — FAIL (pre-test timeout + secondary failure)

**File:** `apps/web/e2e/pipeline-end-to-end.spec.ts` (157 lines)
**Tests:** 1 large pipeline test (facility + CQC PDF + mock session + export)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.` (primary)
**Secondary failure (would occur after DB fix):** Same `CQC_API_KEY` issue — `cqcLocationId: 1-1881302287` lookup will fail 401.

---

### 10. tenant-isolation.spec.ts — FAIL (pre-test infrastructure timeout)

**File:** `apps/web/e2e/tenant-isolation.spec.ts` (182 lines)
**Tests:** 6 security tests (tenant-alpha cannot read tenant-beta resources, cross-tenant 403/404 enforcement)
**Actual error:** `Error: Timed out waiting 60000ms from config.webServer.`
**Root cause:** API server never starts.
**Note:** This suite uses only `APIRequestContext` (no browser). It is an excellent candidate to decouple from Playwright and run as a standalone API integration test.

---

## Bottlenecks Found

### Bottleneck 1: Missing PostgreSQL Database — Impact: CRITICAL

**Error:**

```
PrismaClientInitializationError:
Invalid `any).provider.findMany()` invocation in
apps/api/src/db-store.ts:50:58
Database `provereg_test` does not exist on the database server at `localhost:5432`.
  clientVersion: 5.22.0
```

**Evidence:**
- `apps/api/src/db-store.ts:50` — `PrismaStore.hydrate()` calls `prisma.provider.findMany()` on startup
- `apps/api/src/server.ts:63` — `start()` calls `store.waitForReady()` and `process.exit(1)` on failure
- The API health endpoint at `:3001/health` never becomes available
- Error repeats on every Playwright polling attempt within the 60s window

**Root cause:** The database `provereg_test` has not been created on this machine. Prisma migrations exist (`apps/api/prisma/migrations/20260129_init`, `20260228_add_providers_facilities`) but have never been applied to this local Postgres instance.

**Fix Priority:** P0 — Blocks 100% of all tests.

**Fix:**

```bash
brew services start postgresql@16
createdb -U postgres provereg_test
cd /Users/user/regintel-v2/apps/api && pnpm db:migrate
curl http://localhost:3001/health
```

---

### Bottleneck 2: Auth Token Mismatch Between Playwright Config and API Env — Impact: HIGH

**Error/Slowdown:** Once the DB is fixed, tests that directly call the API via `APIRequestContext` will receive 401 Unauthorized if the API was started manually with a different token.

**Evidence:**
- `apps/web/playwright.config.ts` injects `FOUNDER_TOKEN: process.env.FOUNDER_TOKEN || 'test-founder-token'` into the webServer env
- `apps/web/e2e/helpers.ts`: `const FOUNDER_TOKEN = process.env.FOUNDER_TOKEN || 'test-founder-token'`
- `apps/api/.env`: `FOUNDER_TOKEN=demo-founder-token-12345` — a different value
- When `reuseExistingServer: true` reuses a manually-started API, tokens mismatch causing 401s

**Root cause:** Two separate `.env` files with different token values and no enforcement that they match.

**Fix Priority:** P1 — Will silently cause 401s after the DB fix.

**Fix:** Set `FOUNDER_TOKEN=test-founder-token` and `PROVIDER_TOKEN=test-provider-token` in `apps/api/.env` for local dev, matching the Playwright defaults.

---

### Bottleneck 3: Missing CQC_API_KEY for Two Test Suites — Impact: HIGH

**Error/Slowdown:** `facility-cqc-pdf.spec.ts` and `pipeline-end-to-end.spec.ts` create facilities with real CQC location IDs expecting enrichment from the CQC registry. Without the key, CQC lookups return 401/403.

**Evidence:**
- API startup log: `CQC_API_KEY is not set — CQC location lookups may fail (401 errors).`
- Both test files use `cqcLocationId: '1-1881302287'`
- No mock/stub exists for the CQC HTTP call in test mode

**Root cause:** `CQC_API_KEY` not provisioned locally.

**Fix Priority:** P1 — Blocks 2 of 10 test suites even after DB fix.

**Fix:** Obtain a CQC API key from https://api.cqc.org.uk OR add `USE_MOCK_CQC=true` env that returns synthetic CQC enrichment data without making the external call.

---

### Bottleneck 4: No Database Isolation Between Test Runs — Impact: HIGH

**Error/Slowdown:** All test suites share the `provereg_test` database. Data accumulates across runs. Tenant-isolation tests create resources under uniquely-named tenants each run but never clean them up.

**Evidence:**
- No `globalSetup.ts` or `globalTeardown.ts` in `apps/web/e2e/`
- No `afterAll` DB reset in any spec file
- Every call to `createProvider()` creates real DB rows that persist indefinitely

**Root cause:** No test database lifecycle management was implemented.

**Fix Priority:** P2 — Will cause intermittent failures after many test runs.

**Fix:**

```typescript
// apps/web/e2e/global-setup.ts
import { PrismaClient } from '@prisma/client';
export default async function globalSetup() {
  const prisma = new PrismaClient();
  await prisma.`TRUNCATE TABLE Provider, Facility CASCADE`;
  await prisma.();
}
```

---

### Bottleneck 5: `waitForTimeout` Polling Anti-Pattern — Impact: MEDIUM

**Error/Slowdown:** Arbitrary sleep calls make tests slow and fragile.

**Occurrences:**
- `apps/web/e2e/api-integration.spec.ts:43` — `await page.waitForTimeout(1500)`
- `apps/web/e2e/api-integration.spec.ts:67` — `await page.waitForTimeout(1500)`
- `apps/web/e2e/progressive-disclosure.spec.ts:50` — `await page.waitForTimeout(1000)`
- `apps/web/e2e/progressive-disclosure.spec.ts:65` — `await page.waitForTimeout(500)`
- `apps/web/e2e/progressive-disclosure.spec.ts:80` — `await page.waitForTimeout(500)`

**Root cause:** Developer convenience. `waitForResponse` is more verbose but deterministic.

**Fix Priority:** P2 — Causes slow tests and intermittent CI flakiness under load.

**Fix:** Replace `waitForTimeout(N)` with `await page.waitForResponse(r => r.url().includes('/v1/'))` for any test awaiting API data.

---

### Bottleneck 6: Conditional Test Assertions (Silent Passes) — Impact: MEDIUM

**Error/Slowdown:** Several tests pass vacuously when expected data is absent, hiding real regressions.

**Occurrences:**
- `apps/web/e2e/progressive-disclosure.spec.ts:51`: `if (await firstFinding.isVisible()) { /* all assertions */ }`
- `apps/web/e2e/api-integration.spec.ts:195`: `if (apiResponseData && apiResponseData.findings && apiResponseData.findings.length > 0)`

**Root cause:** Defensive coding to avoid failures on empty state. These guards mask regressions instead of exposing them.

**Fix Priority:** P2.

**Fix:** Ensure `beforeAll` fixtures always create the necessary findings/sessions. Then use unconditional assertions: `await expect(firstFinding).toBeVisible()`.

---

### Bottleneck 7: Playwright webServer Timeout Too Long — Impact: MEDIUM

**Error/Slowdown:** Each failed run wastes 60 seconds. The API crashes within ~2 seconds of starting (DB error), but Playwright keeps polling for the full 60,000ms.

**Evidence:** `Error: Timed out waiting 60000ms from config.webServer.` — observed in every actual test run during this session.

**Root cause:** `apps/web/playwright.config.ts` does not set `webServer.timeout` for the API entry.

**Fix Priority:** P3 — Quality of life improvement.

**Fix:**

```typescript
// In playwright.config.ts, API webServer entry:
{
  command: 'pnpm dev',
  url: 'http://localhost:3001/health',
  reuseExistingServer: !process.env.CI,
  cwd: '../api',
  timeout: 15000,  // Fail fast — API crashes in <2s if DB missing
  env: { ... },
}
```

---

## Test Coverage Gaps

| User Journey | Covered | Notes |
|---|---|---|
| Provider creation | Yes | founder_full_journey, menu-navigation |
| Facility onboarding | Yes | founder_full_journey, facility-cqc-pdf |
| CQC PDF upload | Yes | facility-cqc-pdf, pipeline-end-to-end |
| Mock inspection session | Yes | founder_full_journey, mock-safety |
| Findings review | Yes (weak) | progressive-disclosure uses conditional asserts |
| Export generation | Yes | founder_full_journey |
| Audit trail | Yes | founder_full_journey |
| Tenant isolation | Yes | tenant-isolation.spec.ts |
| Constitutional metadata | Yes | constitutional-requirements, api-integration |
| Clerk auth (real login) | No | E2E_TEST_MODE bypasses Clerk; no test for real login |
| Provider switching | No | Not covered |
| Bulk facility onboarding | No | /v1/facilities/onboard-bulk untested |
| Blue Ocean export format | Partial | Content checked but not full structural validation |
| API error states in UI | No | No 4xx/5xx UI rendering tests |
| Mobile/responsive UI | No | Only Desktop Chrome configured |

---

## Infrastructure Issues Summary

| Issue | Severity | Action Required |
|---|---|---|
| PostgreSQL database `provereg_test` missing | CRITICAL | Start Postgres, create DB, run `pnpm db:migrate` |
| CQC_API_KEY not provisioned | HIGH | Obtain key or implement CQC mock |
| Token mismatch (Playwright vs API .env) | HIGH | Standardise tokens to `test-founder-token` |
| Redis not running | LOW | In-memory fallback sufficient for tests |
| Ephemeral blob storage (/tmp) | LOW | Acceptable for local E2E runs |

---

## Recommendations (Priority Order)

**P0 — Unblock all tests (resolve DB):**

```bash
brew services start postgresql@16
createdb -U postgres provereg_test
cd /Users/user/regintel-v2/apps/api && pnpm db:migrate
curl http://localhost:3001/health  # verify API starts
cd /Users/user/regintel-v2/apps/web && pnpm test:e2e
```

**P1 — Fix token mismatch:** Set `FOUNDER_TOKEN=test-founder-token` and `PROVIDER_TOKEN=test-provider-token` in `apps/api/.env` to match the Playwright defaults.

**P1 — Mock the CQC API for tests:** Add `USE_MOCK_CQC=true` env + synthetic response handler in `apps/api/src/cqc.ts` so CQC-dependent tests do not require an external API key.

**P2 — Replace `waitForTimeout` with `waitForResponse`:** In `apps/web/e2e/api-integration.spec.ts` and `apps/web/e2e/progressive-disclosure.spec.ts`.

**P2 — Add database teardown:** Add `apps/web/e2e/global-setup.ts` that truncates test tables before each Playwright run. Reference it in `playwright.config.ts` via `globalSetup: './e2e/global-setup.ts'`.

**P2 — Remove conditional assertions:** Ensure `beforeAll` creates all required data; replace `if (visible)` guards with unconditional `expect().toBeVisible()`.

**P3 — Reduce webServer timeout:** Set `timeout: 15000` in the API webServer config so failures surface in 15s instead of 60s.

**P3 — Decouple tenant-isolation tests:** Move `tenant-isolation.spec.ts` to `apps/api` integration tests since it uses no browser, removing the Playwright webServer dependency for pure API security tests.

---

## Raw Error Log (from Playwright run)

```
Error: Timed out waiting 60000ms from config.webServer.

[WebServer] [STARTUP] Configuration warnings:
  E2E_TEST_MODE=true — Clerk authentication is BYPASSED. Disable in production.
  CLERK_TEST_TOKEN is set — demo auth tokens are active. Remove in production.
  REDIS_URL points to localhost — background jobs will use in-memory queue (lost on restart).
  BLOB_STORAGE_PATH is under /tmp — uploaded evidence will be lost on server restart.

[WebServer] [PrismaStore] Hydration failed: PrismaClientInitializationError:
Invalid `any).provider.findMany()` invocation in
/Users/user/regintel-v2/apps/api/src/db-store.ts:50:58
Database `provereg_test` does not exist on the database server at `localhost:5432`.
  clientVersion: 5.22.0
  errorCode: undefined

[WebServer] [STARTUP] Fatal error during startup: PrismaClientInitializationError
[API process exits with code 1 repeatedly during 60s polling window]
```

**Playwright exit code:** 1
**Test suites:** 10 of 10 FAIL
**Individual test cases run:** 0 of approximately 60
**Individual test cases blocked:** approximately 60

---

*Report generated 2026-03-01 by automated Playwright bottleneck analysis.*
*All findings are based on actual test execution output and static analysis of the test source files.*
*Next step: resolve the PostgreSQL database issue (P0) and re-run this analysis to discover secondary failures.*
