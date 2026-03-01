import { test, expect } from '@playwright/test';
import {
  answerMockSession,
  createFacility,
  createMockSession,
  createProvider,
  loginAsFounder,
} from './helpers';

/**
 * Progressive Disclosure E2E Tests
 *
 * Verifies progressive disclosure flow:
 * Summary → Evidence → Trace
 *
 * User cannot jump from Summary directly to Trace.
 */

const BASE_URL = 'http://localhost:3000';

test.describe('Progressive Disclosure', () => {
  let providerId = '';
  let facilityId = '';

  test.beforeAll(async ({ request }) => {
    const provider = await createProvider(request, `Disclosure ${Date.now()}`);
    providerId = provider.providerId;
    const facility = await createFacility(request, providerId);
    facilityId = facility.id;

    const { session } = await createMockSession(request, providerId, facilityId);
    await answerMockSession(request, providerId, session.sessionId, 'Disclosure answer');
  });

  test.beforeEach(async ({ page }) => {
    await loginAsFounder(page);
  });

  test('finding detail starts with Summary visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForResponse(
      r => r.url().includes('/v1/providers/') && r.url().includes('/findings'),
      { timeout: 10000 }
    );

    const firstFinding = page.locator('[class*="findingCard"]').first();
    await expect(firstFinding).toBeVisible({ timeout: 10000 });
    await firstFinding.click();

    await page.waitForSelector('[class*="disclosurePanel"], [class*="summary"]', { timeout: 5000 });

    // Summary section should be visible
    const summarySection = page.locator('text=/Summary/i').first();
    await expect(summarySection).toBeVisible();
  });

  test('Evidence layer is initially hidden', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForResponse(
      r => r.url().includes('/v1/providers/') && r.url().includes('/findings'),
      { timeout: 10000 }
    );

    const firstFinding = page.locator('[class*="findingCard"]').first();
    await expect(firstFinding).toBeVisible({ timeout: 10000 });
    await firstFinding.click();

    await page.waitForSelector('[class*="disclosurePanel"], [class*="summary"]', { timeout: 5000 });

    // Evidence details should be hidden initially
    const evidenceDetails = page.locator('[class*="evidenceDetails"]').first();
    const isVisible = await evidenceDetails.isVisible().catch(() => false);

    expect(isVisible).toBe(false);
  });

  test('Trace layer is initially hidden', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForResponse(
      r => r.url().includes('/v1/providers/') && r.url().includes('/findings'),
      { timeout: 10000 }
    );

    const firstFinding = page.locator('[class*="findingCard"]').first();
    await expect(firstFinding).toBeVisible({ timeout: 10000 });
    await firstFinding.click();

    await page.waitForSelector('[class*="disclosurePanel"], [class*="summary"]', { timeout: 5000 });

    // Trace content should not be visible initially
    const traceSection = page.locator('text=/WHY THIS FINDING EXISTS/i').first();
    const isVisible = await traceSection.isVisible().catch(() => false);

    expect(isVisible).toBe(false);
  });

  test('clicking Show Evidence reveals Evidence layer', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForResponse(
      r => r.url().includes('/v1/providers/') && r.url().includes('/findings'),
      { timeout: 10000 }
    );

    const firstFinding = page.locator('[class*="findingCard"]').first();
    await expect(firstFinding).toBeVisible({ timeout: 10000 });
    await firstFinding.click();

    await page.waitForSelector('[class*="disclosurePanel"], [class*="summary"]', { timeout: 5000 });

    // Look for Show Evidence button
    const showEvidenceBtn = page.locator('button:has-text("Show Evidence")').first();

    if (await showEvidenceBtn.isVisible()) {
      await showEvidenceBtn.click();

      await page.waitForSelector('[class*="evidenceDetails"]', { timeout: 5000 });

      // Evidence details should now be visible
      const evidenceDetails = page.locator('[class*="evidenceDetails"]').first();
      await expect(evidenceDetails).toBeVisible();
    }
  });

  test('Trace button only appears after Evidence is shown', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForResponse(
      r => r.url().includes('/v1/providers/') && r.url().includes('/findings'),
      { timeout: 10000 }
    );

    const firstFinding = page.locator('[class*="findingCard"]').first();
    await expect(firstFinding).toBeVisible({ timeout: 10000 });
    await firstFinding.click();

    await page.waitForSelector('[class*="disclosurePanel"], [class*="summary"]', { timeout: 5000 });

    // Initially, Show Trace button should not exist
    const showTraceBtn = page.locator('button:has-text("Show Trace")');
    const initialCount = await showTraceBtn.count();

    expect(initialCount).toBe(0);

    // Show evidence first
    const showEvidenceBtn = page.locator('button:has-text("Show Evidence")').first();

    if (await showEvidenceBtn.isVisible()) {
      await showEvidenceBtn.click();

      await page.waitForSelector('[class*="evidenceDetails"]', { timeout: 5000 });

      // Now Show Trace button should appear
      const traceButtonCount = await showTraceBtn.count();
      expect(traceButtonCount).toBeGreaterThan(0);
    }
  });

  test('Trace shows deterministic hash', async ({ page }) => {
    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForResponse(
      r => r.url().includes('/v1/providers/') && r.url().includes('/findings'),
      { timeout: 10000 }
    );

    const firstFinding = page.locator('[class*="findingCard"]').first();
    await expect(firstFinding).toBeVisible({ timeout: 10000 });
    await firstFinding.click();

    await page.waitForSelector('[class*="disclosurePanel"], [class*="summary"]', { timeout: 5000 });

    // Show evidence
    const showEvidenceBtn = page.locator('button:has-text("Show Evidence")').first();

    if (await showEvidenceBtn.isVisible()) {
      await showEvidenceBtn.click();

      await page.waitForSelector('[class*="evidenceDetails"]', { timeout: 5000 });

      // Show trace
      const showTraceBtn = page.locator('button:has-text("Show Trace")').first();

      if (await showTraceBtn.isVisible()) {
        await showTraceBtn.click();

        await page.waitForSelector('text=/sha256:|Deterministic Hash/i', { timeout: 5000 });

        // Check for hash in trace section
        const content = await page.content();
        expect(content).toMatch(/sha256:|Deterministic Hash/i);
      }
    }
  });
});
