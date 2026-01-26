# RegIntel Phase 10 UI - Testing Guide

## Test Coverage

### 1. Unit Tests (Vitest)

**Location:** `apps/web/ui.test.ts`, `apps/web/src/lib/api/client.test.ts`

**Coverage:**
- ✅ Constitutional requirements (ui:constitutional)
- ✅ Mock safety (ui:mock-safety)
- ✅ Projection purity (ui:projection-purity)
- ✅ Progressive disclosure (ui:disclosure)
- ✅ No interpretation (ui:no-interpretation)
- ✅ API client methods
- ✅ Constitutional metadata validation
- ✅ Error handling

**Run:**
```bash
cd apps/web
pnpm test
```

### 2. API Server Tests (Vitest + Supertest)

**Location:** `apps/api/src/server.test.ts`

**Coverage:**
- ✅ All REST endpoints
- ✅ Constitutional metadata on responses
- ✅ Response structure validation
- ✅ CORS headers
- ✅ Error responses
- ✅ Data types and formats

**Run:**
```bash
cd apps/api
pnpm install  # Install supertest
pnpm test
```

### 3. E2E Tests (Playwright)

**Location:** `apps/web/e2e/*.spec.ts`

**Test Suites:**

#### a. Menu Navigation (`menu-navigation.spec.ts`)
- ✅ All menu items navigate to correct pages
- ✅ All pages call respective API endpoints
- ✅ All pages display constitutional metadata

#### b. Constitutional Requirements (`constitutional-requirements.spec.ts`)
- ✅ Every page renders version
- ✅ Every page renders hash
- ✅ Every page renders timestamp
- ✅ Every page renders domain
- ✅ Sidebar shows provider info
- ✅ Snapshot date displayed

#### c. Mock Safety (`mock-safety.spec.ts`)
- ✅ Findings show SYSTEM_MOCK badge
- ✅ Mock findings have visual distinction
- ✅ Origin badge displayed on detail page
- ✅ Exports mention watermark
- ✅ Mock sessions have simulation context

#### d. Progressive Disclosure (`progressive-disclosure.spec.ts`)
- ✅ Summary layer visible by default
- ✅ Evidence layer initially hidden
- ✅ Trace layer initially hidden
- ✅ Show Evidence button reveals Evidence layer
- ✅ Show Trace button only appears after Evidence shown
- ✅ Trace displays deterministic hash

#### e. API Integration (`api-integration.spec.ts`)
- ✅ Overview page displays API data
- ✅ Topics page displays API data
- ✅ Findings page displays API data
- ✅ Evidence page displays API data
- ✅ Audit page displays API data
- ✅ Constitutional metadata preserved from API to UI
- ✅ No client-side risk calculations
- ✅ No client-side severity calculations

**Run:**
```bash
cd apps/web
npx playwright install  # First time only
pnpm test:e2e
```

## Running Tests

### Prerequisites

1. **Install dependencies:**
```bash
# Root
pnpm install

# API
cd apps/api
pnpm install

# Web
cd apps/web
pnpm install
```

2. **Install Playwright browsers (for E2E):**
```bash
cd apps/web
npx playwright install
```

### Running All Tests

**Unit Tests:**
```bash
# From root
pnpm test

# Or from specific app
cd apps/web && pnpm test
cd apps/api && pnpm test
```

**E2E Tests (requires running servers):**
```bash
# Terminal 1: Start API server
cd apps/api
pnpm dev

# Terminal 2: Start web server
cd apps/web
pnpm dev

# Terminal 3: Run E2E tests
cd apps/web
pnpm test:e2e
```

### Running Specific Test Suites

**Single E2E test file:**
```bash
cd apps/web
npx playwright test e2e/menu-navigation.spec.ts
npx playwright test e2e/constitutional-requirements.spec.ts
npx playwright test e2e/mock-safety.spec.ts
npx playwright test e2e/progressive-disclosure.spec.ts
npx playwright test e2e/api-integration.spec.ts
```

**Single unit test file:**
```bash
cd apps/web
pnpm vitest run ui.test.ts
pnpm vitest run src/lib/api/client.test.ts
```

### Watch Mode

**Unit tests:**
```bash
cd apps/web
pnpm test:watch
```

**E2E tests with UI:**
```bash
cd apps/web
npx playwright test --ui
```

## Phase Gate Tests

Phase 10 requires all these tests to pass:

```bash
# ui:constitutional
cd apps/web && pnpm vitest run -t "ui:constitutional"

# ui:mock-safety
cd apps/web && pnpm vitest run -t "ui:mock-safety"

# ui:projection-purity
cd apps/web && pnpm vitest run -t "ui:projection-purity"

# ui:disclosure
cd apps/web && pnpm vitest run -t "ui:disclosure"

# ui:no-interpretation
cd apps/web && pnpm vitest run -t "ui:no-interpretation"

# ui:menu_all_live
cd apps/web && pnpm test:e2e
```

## CI Pipeline

The CI pipeline runs:

1. **Version immutability check:**
   ```bash
   pnpm validate:versions
   ```

2. **Unit tests:**
   ```bash
   pnpm test
   ```

3. **Phase gates:**
   ```bash
   pnpm gate --strict
   ```

4. **E2E tests (if servers running):**
   ```bash
   cd apps/web && pnpm test:e2e
   ```

## Test Results

### Current Status

- **Unit Tests:** All passing
- **API Tests:** All passing (after `pnpm install`)
- **E2E Tests:** All passing (when servers running)
- **Phase Gates:** All Phase 0-10 gates passing

### Coverage Goals

- ✅ All REST endpoints tested
- ✅ All UI pages tested
- ✅ Constitutional requirements enforced
- ✅ Mock safety verified
- ✅ Progressive disclosure enforced
- ✅ Projection purity verified
- ✅ No interpretation rules verified

## Debugging Tests

### View E2E test results:
```bash
cd apps/web
npx playwright show-report
```

### Debug specific test:
```bash
cd apps/web
npx playwright test --debug e2e/menu-navigation.spec.ts
```

### Generate trace:
```bash
cd apps/web
npx playwright test --trace on
```

## Test Data

All tests use mock data from API server:
- Provider: `sunrise-care`
- Provider Name: Sunrise Care Home
- PRS State: RATING_GOOD
- Registered Beds: 24

## Common Issues

### 1. E2E tests fail with "page not found"

**Solution:** Ensure both API and web servers are running:
```bash
# Terminal 1
cd apps/api && pnpm dev

# Terminal 2
cd apps/web && pnpm dev
```

### 2. API tests fail with missing dependencies

**Solution:** Install supertest:
```bash
cd apps/api
pnpm install
```

### 3. E2E tests timeout

**Solution:** Increase timeout in playwright.config.ts or wait for API server to fully start.

### 4. Constitutional metadata validation fails

**Solution:** Ensure API server returns all required fields:
- topicCatalogVersion
- topicCatalogHash
- prsLogicVersion
- prsLogicHash
- snapshotTimestamp
- domain

## Adding New Tests

### Unit Test Template:
```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = processInput(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

### E2E Test Template:
```typescript
import { test, expect } from '@playwright/test';

test('should do something', async ({ page }) => {
  await page.goto('http://localhost:3000/page');

  await page.waitForSelector('h1');

  await expect(page.locator('h1')).toContainText('Expected');
});
```

## Test Maintenance

- Update tests when API contracts change
- Keep E2E tests focused on user flows
- Use unit tests for edge cases
- Maintain test data fixtures in separate files
- Document new test requirements in phase gates YAML
