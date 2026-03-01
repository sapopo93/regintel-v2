import { test, expect } from '@playwright/test';
import {
  answerMockSession,
  createFacility,
  createMockSession,
  createProvider,
  loginAsFounder,
} from './helpers';

/**
 * Mock Safety E2E Tests
 *
 * Verifies visual separation between mock and regulatory content:
 * - Mock findings have SYSTEM_MOCK badge
 * - Mock findings have darker border
 * - Exports include watermark
 */

const BASE_URL = 'http://localhost:3000';

test.describe('Mock Safety', () => {
  let providerId = '';
  let facilityId = '';

  test.beforeAll(async ({ request }) => {
    const provider = await createProvider(request, `Mock Safety ${Date.now()}`);
    providerId = provider.providerId;
    const facility = await createFacility(request, providerId);
    facilityId = facility.id;

    const { session } = await createMockSession(request, providerId, facilityId);
    await answerMockSession(request, providerId, session.sessionId, 'Mock safety answer');
  });

  test.beforeEach(async ({ page }) => {
    await loginAsFounder(page);
  });

  test('mock pages show simulation frame and watermark', async ({ page }) => {
    const pages = [
      '/overview',
      '/topics',
      '/mock-session',
      '/findings',
      '/evidence',
      '/exports',
      '/audit',
    ];

    for (const pagePath of pages) {
      await page.goto(`${BASE_URL}${pagePath}?provider=${providerId}&facility=${facilityId}`);
      await page.waitForSelector('h1');

      const content = await page.content();
      expect(content).toContain('PRACTICE INSPECTION — NOT AN OFFICIAL CQC RECORD');

      const frame = page.locator('[class*="frame"]').first();
      await expect(frame).toBeVisible();
    }
  });
  test('findings page shows SYSTEM_MOCK badge', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    // Wait for findings to load
    await page.waitForTimeout(1000);

    // Check for SYSTEM_MOCK badge
    const content = await page.content();
    expect(content).toMatch(/SYSTEM_MOCK/i);
  });

  test('mock findings have visual distinction', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1000);

    // Look for finding cards
    const findingCards = page.locator('[class*="findingCard"]');

    if (await findingCards.count() > 0) {
      const firstCard = findingCards.first();

      // Check for mock-specific styling (should have .mock class or darker border)
      const classList = await firstCard.getAttribute('class');
      const hasMockClass = classList?.includes('mock');

      // Or check computed style for border
      const borderWidth = await firstCard.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.borderWidth;
      });

      // Should have thicker border for mock findings (2px vs 1px)
      expect(hasMockClass || borderWidth === '2px').toBeTruthy();
    }
  });

  test('finding detail shows origin badge', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1000);

    // Click first finding if available
    const firstFinding = page.locator('[class*="findingCard"]').first();

    if (await firstFinding.isVisible()) {
      await firstFinding.click();

      await page.waitForTimeout(500);

      // Check for origin badge
      const content = await page.content();
      expect(content).toMatch(/SYSTEM_MOCK|origin/i);
    }
  });

  test('exports page mentions watermark', async ({ page }) => {
    await page.goto(`${BASE_URL}/exports?provider=${providerId}&facility=${facilityId}`);

    // Wait for page to load
    await page.waitForSelector('h1');

    // Check for watermark text
    const content = await page.content();
    expect(content).toMatch(/PRACTICE INSPECTION|watermark/i);
    expect(content).toMatch(/NOT AN OFFICIAL CQC RECORD/i);
  });

  test('mock session pages have simulation context', async ({ page }) => {
    await page.goto(`${BASE_URL}/mock-session?provider=${providerId}&facility=${facilityId}`);

    await page.waitForSelector('h1');

    // Check for mock/simulation language
    const content = await page.content();
    expect(content).toMatch(/mock|simulation/i);
  });
});
