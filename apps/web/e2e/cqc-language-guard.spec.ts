import { test, expect, type Locator } from '@playwright/test';
import { createFacility, createProvider, loginAsFounder } from './helpers';

/**
 * CQC Language Guard E2E Tests
 *
 * Verifies that customer-visible content uses plain CQC/SAF34 language
 * and no raw internal developer strings (enum values, sha256 hashes, etc.)
 * are shown to Registered Managers.
 *
 * INTENTIONAL EXCEPTIONS (not in denylist):
 * - findings page: SYSTEM_MOCK badge is a constitutional requirement
 * - audit page: sha256 chain hashes are tamper-evident integrity proof
 * - evidence page: truncated blobHash starts with sha256: — in disclosure tab
 */

const BASE_URL = 'http://localhost:3000';

/**
 * CustomerLanguageGuard utility — reusable across E2E specs.
 * Asserts that the given locator's visible text does not contain
 * any raw technical strings that should not be shown to customers.
 *
 * @param locator - The locator to check (e.g., page.locator('main'))
 * @param skipTerms - Terms to skip (for pages with constitutional exceptions)
 */
export async function assertNoTechStrings(
  locator: Locator,
  { skipTerms = [] }: { skipTerms?: string[] } = {}
) {
  const text = await locator.innerText();
  const denied = [
    'NO_SOURCE',
    'INGESTION_INCOMPLETE',
    'uninitialized',
    'sha256:',
    'snapshot:mock',
    'NEW_PROVIDER',
    'SPECIAL_MEASURES',
    'ENFORCEMENT_ACTION',
    'RATING_INADEQUATE',
    'RATING_REQUIRES_IMPROVEMENT',
    'evidence_first',
    'narrative_first',
    'contradiction_hunt',
    'STATUS UNAVAILABLE',
    'Compliance Record (Locked)',
    'Mock fallback disabled',
    'PRS Logic',
  ];
  for (const term of denied.filter((t) => !skipTerms.includes(t))) {
    expect(text, `customer view must not contain "${term}"`).not.toContain(term);
  }
}

test.describe('CQC Language Guard — Facility Page', () => {
  let providerId = '';
  let facilityId = '';

  test.beforeAll(async ({ request }) => {
    const provider = await createProvider(request, `LangGuard ${Date.now()}`);
    providerId = provider.providerId;
    const facility = await createFacility(request, providerId);
    facilityId = facility.id;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsFounder(page);
  });

  test('no tech strings in customer view', async ({ page }) => {
    await page.goto(
      `${BASE_URL}/facilities/${encodeURIComponent(facilityId)}?provider=${encodeURIComponent(providerId)}`
    );
    await page.waitForSelector('[data-testid="customer-view"]');
    await assertNoTechStrings(page.locator('[data-testid="customer-view"]'));
  });

  test('CQC labels visible in customer view', async ({ page }) => {
    await page.goto(
      `${BASE_URL}/facilities/${encodeURIComponent(facilityId)}?provider=${encodeURIComponent(providerId)}`
    );
    await page.waitForSelector('[data-testid="customer-view"]');
    const customerView = page.locator('[data-testid="customer-view"]');
    const text = await customerView.innerText();

    // CQC ingestion status label
    expect(text).toContain('Awaiting CQC report link');
    // Renamed sync button
    expect(text).toContain('Retrieve latest published CQC inspection');
  });

  test('AdvancedPanel is hidden by default', async ({ page }) => {
    await page.goto(
      `${BASE_URL}/facilities/${encodeURIComponent(facilityId)}?provider=${encodeURIComponent(providerId)}`
    );
    await page.waitForSelector('[data-testid="advanced-panel"]');

    // Content div should be in DOM but not visible (details element is closed)
    const advancedContent = page.locator('[data-testid="advanced-content"]');
    await expect(advancedContent).not.toBeVisible();
  });

  test('AdvancedPanel shows technical content after expand', async ({ page }) => {
    await page.goto(
      `${BASE_URL}/facilities/${encodeURIComponent(facilityId)}?provider=${encodeURIComponent(providerId)}`
    );
    await page.waitForSelector('[data-testid="advanced-panel"]');

    // Click the summary to open the accordion
    await page.locator('[data-testid="advanced-panel"] summary').click();

    // Content should now be visible
    const advancedContent = page.locator('[data-testid="advanced-content"]');
    await expect(advancedContent).toBeVisible();

    // Should contain sha256 hashes (constitutional metadata is present)
    const text = await advancedContent.innerText();
    expect(text).toMatch(/sha256/i);
  });

  test('AdvancedPanel summary is keyboard accessible', async ({ page }) => {
    await page.goto(
      `${BASE_URL}/facilities/${encodeURIComponent(facilityId)}?provider=${encodeURIComponent(providerId)}`
    );
    await page.waitForSelector('[data-testid="advanced-panel"] summary');

    const summary = page.locator('[data-testid="advanced-panel"] summary');

    // Tab to the summary and verify it is focusable
    await summary.focus();
    await expect(summary).toBeFocused();

    // Press Enter to toggle
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="advanced-content"]')).toBeVisible();
  });
});

test.describe('CQC Language Guard — Global Smoke', () => {
  let providerId = '';
  let facilityId = '';

  test.beforeAll(async ({ request }) => {
    const provider = await createProvider(request, `Smoke ${Date.now()}`);
    providerId = provider.providerId;
    const facility = await createFacility(request, providerId);
    facilityId = facility.id;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsFounder(page);
  });

  /**
   * Smoke guard: assert no tech strings in the main content region of each page.
   *
   * skipTerms per page:
   * - /findings: 'SYSTEM_MOCK' badge is a constitutional requirement (mock-safety tests assert it)
   * - /evidence: truncated blobHash still starts with 'sha256:' — in disclosure tab
   * - /audit: sha256 chain hashes are tamper-evident proof and must remain
   */
  const smokePages: Array<{ path: string; skipTerms: string[] }> = [
    { path: '/overview', skipTerms: [] },
    { path: '/topics', skipTerms: [] },
    { path: '/mock-session', skipTerms: [] },
    { path: '/evidence', skipTerms: ['sha256:'] },
    { path: '/exports', skipTerms: [] },
    { path: '/audit', skipTerms: ['sha256:'] },
  ];

  for (const { path, skipTerms } of smokePages) {
    test(`no tech strings on ${path}`, async ({ page }) => {
      await page.goto(
        `${BASE_URL}${path}?provider=${encodeURIComponent(providerId)}&facility=${encodeURIComponent(facilityId)}`
      );
      await page.waitForLoadState('networkidle');
      // Use main element; findings page has its own test that allows SYSTEM_MOCK
      const main = page.locator('main').first();
      await assertNoTechStrings(main, { skipTerms });
    });
  }

  // Findings page separately — must allow SYSTEM_MOCK (constitutional requirement)
  test('no tech strings on /findings (except SYSTEM_MOCK badge)', async ({ page }) => {
    await page.goto(
      `${BASE_URL}/findings?provider=${encodeURIComponent(providerId)}&facility=${encodeURIComponent(facilityId)}`
    );
    await page.waitForLoadState('networkidle');
    const main = page.locator('main').first();
    // Skip 'MOCK' substring check because SYSTEM_MOCK is constitutional
    await assertNoTechStrings(main, {
      skipTerms: ['sha256:', 'MOCK'],
    });
  });
});
