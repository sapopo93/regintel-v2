import { test, expect } from '@playwright/test';
import {
  answerMockSession,
  createFacility,
  createMockSession,
  createProvider,
  loginAsFounder,
} from './helpers';

const BASE_URL = `http://localhost:${process.env.PORT || '4000'}`;

test.describe('No dead buttons', () => {
  let providerId = '';
  let facilityId = '';

  test.beforeAll(async ({ request }) => {
    const provider = await createProvider(request, `No Dead Buttons ${Date.now()}`);
    providerId = provider.providerId;
    const facility = await createFacility(request, providerId);
    facilityId = facility.id;

    const { session } = await createMockSession(request, providerId, facilityId);
    await answerMockSession(request, providerId, session.sessionId, 'Seed completed session');
  });

  test.beforeEach(async ({ page }) => {
    await loginAsFounder(page);
  });

  test('sidebar items and primary buttons hit real endpoints', async ({ page }) => {
    const waitForApiResponse = () =>
      page.waitForResponse((response) => {
        if (!response.url().includes('/v1/')) {
          return false;
        }
        const method = response.request().method();
        return method !== 'OPTIONS';
      });

    await page.goto(`${BASE_URL}/overview?provider=${providerId}&facility=${facilityId}`);

    const sidebarIds = [
      'overview',
      'topics',
      'mock-session',
      'findings',
      'facilities',
      'evidence',
      'exports',
      'audit',
      'providers',
    ];

    for (let i = 0; i < sidebarIds.length; i++) {
      const id = sidebarIds[i];
      const responsePromise = waitForApiResponse();
      await page.click(`[data-testid="sidebar-link-${id}"]`);
      const response = await responsePromise;
      const body = await response.text();
      expect(body.toLowerCase()).not.toContain('not implemented');
      // Wait for the page to fully render before clicking next sidebar link
      if (i < sidebarIds.length - 1) {
        await page.waitForSelector(`[data-testid="sidebar-link-${sidebarIds[i + 1]}"]`, { timeout: 10000 });
      }
    }

    await page.goto(`${BASE_URL}/providers`);
    await page.fill('[data-testid="provider-name-input"]', `Provider ${Date.now()}`);
    let responsePromise = page.waitForResponse((response) =>
      response.url().includes('/v1/providers') && response.request().method() === 'POST'
    );
    await page.click('[data-testid="primary-create-provider"]');
    let response = await responsePromise;
    let body = await response.text();
    expect(body.toLowerCase()).not.toContain('not implemented');
    await page.waitForURL(/\/facilities\?provider=/);

    await page.goto(`${BASE_URL}/facilities/new?provider=${providerId}`);
    const cqcLocationId = `1-${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    await page.fill('[data-testid="facility-name-input"]', 'No Dead Facility');
    await page.fill('[data-testid="cqc-location-id-input"]', cqcLocationId);
    await page.fill('[data-testid="address-line1-input"]', '456 Street');
    await page.fill('[data-testid="town-city-input"]', 'Leeds');
    await page.fill('[data-testid="postcode-input"]', 'LS1 1AA');
    await page.selectOption('[data-testid="service-type-select"]', 'residential');
    await page.fill('[data-testid="capacity-input"]', '10');
    responsePromise = page.waitForResponse((response) =>
      response.url().includes('/v1/facilities/onboard') &&
      response.request().method() === 'POST'
    );
    await page.click('[data-testid="primary-create-facility"]');
    response = await responsePromise;
    const facilityBody = await response.json();
    const createdFacilityId = facilityBody.facility?.id;
    expect(createdFacilityId).toBeTruthy();
    body = JSON.stringify(facilityBody);
    expect(body.toLowerCase()).not.toContain('not implemented');

    await page.waitForURL(new RegExp(`/facilities/${createdFacilityId}`));
    await page.click('[data-testid="toggle-upload-button"]');
    await page.waitForSelector('[data-testid="file-input"]', { state: 'visible' });
    await page.setInputFiles('[data-testid="file-input"]', {
      name: 'no-dead.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%mock\n'),
    });
    // Wait for the submit button to be enabled (file selected)
    await expect(page.getByTestId('primary-upload-evidence')).toBeEnabled();
    responsePromise = page.waitForResponse((response) =>
      response.url().includes(`/v1/facilities/${createdFacilityId}/evidence`) &&
      response.request().method() === 'POST'
    );
    await page.click('[data-testid="primary-upload-evidence"]');
    response = await responsePromise;
    body = await response.text();
    expect(body.toLowerCase()).not.toContain('not implemented');

    await page.goto(`${BASE_URL}/mock-session?provider=${providerId}&facility=${facilityId}`);
    // Expand disclosure panel to show the evidence layer with the start button
    await page.getByText('Show Evidence →').click();
    const startButton = page.getByTestId('primary-start-session');
    await expect(startButton).toBeEnabled();
    responsePromise = page.waitForResponse((response) =>
      response.url().includes(`/v1/providers/${providerId}/mock-sessions`) &&
      response.request().method() === 'POST'
    );
    await startButton.click();
    response = await responsePromise;
    const sessionBody = await response.json();
    const sessionId = sessionBody.sessionId;
    expect(sessionId).toBeTruthy();
    body = JSON.stringify(sessionBody);
    expect(body.toLowerCase()).not.toContain('not implemented');

    await page.getByRole('button', { name: 'Summary' }).click();
    const sessionLink = page.getByRole('link', { name: new RegExp(String(sessionId)) });
    await expect(sessionLink).toBeVisible();
    await sessionLink.click();
    await page.waitForURL(new RegExp(`/mock-session/${sessionId}`));
    const statusValue = (await page
      .locator('dd')
      .filter({ hasText: /IN_PROGRESS|COMPLETED|ABANDONED/ })
      .first()
      .textContent())?.trim();

    if (statusValue === 'IN_PROGRESS') {
      await page.fill('[data-testid="mock-session-answer"]', 'Answer to close session');
      responsePromise = page.waitForResponse((response) =>
        response.request().method() === 'POST'
        && response.url().includes('/mock-sessions/')
        && response.url().includes('/answer')
      );
      await page.click('[data-testid="primary-submit-answer"]');
      response = await responsePromise;
      body = await response.text();
      expect(body.toLowerCase()).not.toContain('not implemented');
    } else {
      expect(statusValue).toBe('COMPLETED');
    }

    await page.goto(`${BASE_URL}/exports?provider=${providerId}&facility=${facilityId}`);
    const exportButton = page.getByTestId('primary-generate-export');
    await expect(exportButton).toBeEnabled();
    responsePromise = page.waitForResponse((response) =>
      response.url().includes(`/v1/providers/${providerId}/exports`) &&
      response.request().method() === 'POST'
    );
    await exportButton.click();
    response = await responsePromise;
    body = await response.text();
    expect(body.toLowerCase()).not.toContain('not implemented');
  });
});
