import { test, expect } from '@playwright/test';
import { createFacility, createProvider, loginAsFounder } from './helpers';

/**
 * API Integration E2E Tests
 *
 * Verifies that UI correctly integrates with API:
 * - Data flows from API to UI
 * - Constitutional metadata is preserved
 * - No client-side business logic
 */

const BASE_URL = `http://localhost:${process.env.PORT || '4000'}`;
const API_BASE_URL = `http://localhost:${process.env.API_PORT || '4001'}`;

let providerId = '';
let facilityId = '';

test.beforeAll(async ({ request }) => {
  const provider = await createProvider(request, `API Integration ${Date.now()}`);
  providerId = provider.providerId;
  const facility = await createFacility(request, providerId);
  facilityId = facility.id;
});

test.beforeEach(async ({ page }) => {
  await loginAsFounder(page);
});

test.describe('API Integration', () => {
  test('overview page displays data from API', async ({ page }) => {
    // Intercept API call
    let apiCalled = false;
    let responseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/providers/') && response.url().includes('/overview')) {
        apiCalled = true;
        responseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/overview?provider=${providerId}&facility=${facilityId}`);

    // Wait for API call
    await page.waitForTimeout(1500);

    expect(apiCalled).toBe(true);
    expect(responseData).toBeTruthy();

    // Verify constitutional metadata
    expect(responseData.topicCatalogVersion).toBe('v1');
    expect(responseData.prsLogicVersion).toBe('v1');
    expect(responseData.topicCatalogHash).toMatch(/^sha256:/);
    expect(responseData.prsLogicHash).toMatch(/^sha256:/);

    // Verify provider data is displayed
    await expect(page.locator('h1')).toContainText('Inspection Readiness Record');

    // Check for stats cards
    const content = await page.content();
    expect(content).toMatch(/Evidence Coverage|Topics Completed/i);
    expect(content).toContain(responseData.provider.providerName);
    expect(content).toContain(responseData.provider.prsState);
  });

  test('topics page displays data from API', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/providers/') && response.url().includes('/topics') && !response.url().includes('topics/')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/topics?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    expect(apiResponseData).toBeTruthy();
    expect(apiResponseData.topics).toBeDefined();
    expect(Array.isArray(apiResponseData.topics)).toBe(true);

    // UI should render topics
    if (apiResponseData.topics.length > 0) {
      const content = await page.content();
      const firstTopic = apiResponseData.topics[0];
      expect(content).toContain(firstTopic.title || firstTopic.id);
    }
  });

  test('findings page displays data from API', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/providers/') && response.url().includes('/findings') && !response.url().includes('findings/')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    expect(apiResponseData).toBeTruthy();
    expect(apiResponseData.findings).toBeDefined();
    expect(apiResponseData.totalCount).toBeDefined();

    // Check findings are rendered
    if (apiResponseData.findings.length > 0) {
      const content = await page.content();
      const firstFinding = apiResponseData.findings[0];

      // Should show SYSTEM_MOCK for mock findings
      if (firstFinding.origin === 'SYSTEM_MOCK') {
        expect(content).toContain('SYSTEM_MOCK');
      }
    }
  });

  test('evidence page displays data from API', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/providers/') && response.url().includes('/evidence')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/evidence?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    expect(apiResponseData).toBeTruthy();
    expect(apiResponseData.evidence).toBeDefined();
    expect(apiResponseData.totalCount).toBeDefined();

    // Check evidence is rendered
    await expect(page.locator('h1')).toContainText('Evidence');

    if (apiResponseData.evidence.length > 0) {
      const firstEvidence = apiResponseData.evidence[0];
      const content = await page.content();
      expect(content).toContain(firstEvidence.fileName);
    }
  });

  test('audit page displays data from API', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/providers/') && response.url().includes('/audit-trail')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/audit?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    expect(apiResponseData).toBeTruthy();
    expect(apiResponseData.events).toBeDefined();
    expect(apiResponseData.totalCount).toBeDefined();

    // Check audit trail is rendered
    await expect(page.locator('h1')).toContainText('Audit');

    if (apiResponseData.events.length > 0) {
      const firstEvent = apiResponseData.events[0];
      // Event types are in the Evidence disclosure layer - reveal it first
      await page.click('button:has-text("Show Evidence")');
      await page.waitForTimeout(500);
      const content = await page.content();
      expect(content).toContain(firstEvent.eventType);
    }
  });

  test('mock sessions page displays data from API', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/providers/') && response.url().includes('/mock-sessions')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/mock-session?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    expect(apiResponseData).toBeTruthy();
    expect(apiResponseData.sessions).toBeDefined();
    expect(Array.isArray(apiResponseData.sessions)).toBe(true);

    if (apiResponseData.sessions.length > 0) {
      const content = await page.content();
      expect(content).toContain(apiResponseData.sessions[0].sessionId);
    }
  });

  test('exports page displays data from API', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/providers/') && response.url().includes('/exports')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/exports?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    expect(apiResponseData).toBeTruthy();
    expect(apiResponseData.watermark).toBeDefined();

    const content = await page.content();
    expect(content).toContain(apiResponseData.watermark);
  });

  test('API responses include constitutional metadata', async ({ page }) => {
    const endpoints = [
      '/overview',
      '/topics',
      '/findings',
      '/evidence',
      '/audit',
    ];

    for (const endpoint of endpoints) {
      const responsePromise = page.waitForResponse((response) =>
        response.url().includes(`/v1/providers/${providerId}`) &&
        response.url().includes(endpoint)
      );

      await page.goto(`${BASE_URL}${endpoint}?provider=${providerId}&facility=${facilityId}`);

      const responseData = await (await responsePromise).json();

      expect(responseData.topicCatalogVersion).toBeDefined();
      expect(responseData.topicCatalogHash).toBeDefined();
      expect(responseData.prsLogicVersion).toBeDefined();
      expect(responseData.prsLogicHash).toBeDefined();
      expect(responseData.snapshotTimestamp).toBeDefined();
      expect(responseData.domain).toBeDefined();
    }
  });

  test('no client-side calculations for risk scores', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/') && response.url().includes('/findings')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    if (apiResponseData && apiResponseData.findings && apiResponseData.findings.length > 0) {
      const finding = apiResponseData.findings[0];

      // compositeRiskScore comes from API, not calculated in UI
      expect(finding.compositeRiskScore).toBeDefined();
      expect(typeof finding.compositeRiskScore).toBe('number');

      // UI should display this value, not calculate it
      const content = await page.content();
      const scoreString = finding.compositeRiskScore.toString();

      // Check if the exact score appears in UI
      expect(content).toContain(scoreString);
    }
  });

  test('no client-side severity calculations', async ({ page }) => {
    let apiResponseData: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/v1/') && response.url().includes('/findings')) {
        apiResponseData = await response.json();
      }
    });

    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);

    await page.waitForTimeout(1500);

    if (apiResponseData && apiResponseData.findings && apiResponseData.findings.length > 0) {
      const finding = apiResponseData.findings[0];

      // Severity comes from API
      expect(finding.severity).toBeDefined();
      expect(typeof finding.severity).toBe('string');

      // UI displays severity as-is, doesn't compute it
      const content = await page.content();
      expect(content).toContain(finding.severity);
    }
  });
});
