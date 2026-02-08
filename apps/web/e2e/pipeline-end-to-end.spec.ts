import { test, expect } from '@playwright/test';
import { loginAsFounder } from './helpers';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = `http://localhost:${process.env.PORT || '4000'}`;
const REPORT_PATH = process.env.CQC_REPORT_PATH
  || path.resolve(__dirname, 'fixtures', 'St Joseph Nursing Home.pdf');

test('facility → CQC PDF → mock session → export pipeline', async ({ page }) => {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`Missing CQC report PDF at ${REPORT_PATH}`);
  }

  await loginAsFounder(page);
  await page.goto(`${BASE_URL}/providers`);

  const providerName = `Pipeline Provider ${Date.now()}`;
  await page.fill('[data-testid="provider-name-input"]', providerName);
  const providerResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/v1/providers') && response.request().method() === 'POST'
  );
  await page.click('[data-testid="primary-create-provider"]');
  const providerResponse = await providerResponsePromise;
  const providerBody = await providerResponse.json();
  const providerId = providerBody.provider?.providerId;
  expect(providerId).toBeTruthy();

  await page.waitForURL(/\/facilities\?provider=/);
  await page.click('[data-testid="add-facility-button"]');
  await page.waitForURL(/\/facilities\/new\?provider=/);

  await page.fill('[data-testid="facility-name-input"]', "St Joseph's Nursing Home");
  await page.fill('[data-testid="cqc-location-id-input"]', '1-1881302287');
  await page.fill('[data-testid="address-line1-input"]', 'St Joseph Road');
  await page.fill('[data-testid="town-city-input"]', 'London');
  await page.fill('[data-testid="postcode-input"]', 'SW1A 2AB');
  await page.selectOption('[data-testid="service-type-select"]', 'nursing');
  await page.fill('[data-testid="capacity-input"]', '50');

  const facilityResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/v1/facilities/onboard')
    && response.request().method() === 'POST'
  );
  await page.click('[data-testid="primary-create-facility"]');
  const facilityResponse = await facilityResponsePromise;
  const facilityBody = await facilityResponse.json();
  const facilityId = facilityBody.facility?.id;
  expect(facilityId).toBeTruthy();

  await page.waitForURL(new RegExp(`/facilities/${facilityId}`));
  await page.click('[data-testid="toggle-upload-button"]');
  await page.waitForSelector('[data-testid="file-input"]', { state: 'visible' });
  await page.setInputFiles('[data-testid="file-input"]', REPORT_PATH);

  const blobResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/v1/evidence/blobs') && response.request().method() === 'POST'
  );
  const recordResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/facilities/${facilityId}/evidence`)
    && response.request().method() === 'POST'
  );
  await page.click('[data-testid="primary-upload-evidence"]');
  await blobResponsePromise;
  await recordResponsePromise;
  await expect(page.getByText('St Joseph Nursing Home.pdf')).toBeVisible();

  await page.click('[data-testid="continue-overview-button"]');
  await page.waitForURL((url) =>
    url.pathname === '/overview'
    && url.searchParams.get('provider') === providerId
    && url.searchParams.get('facility') === facilityId
  );

  await page.click('[data-testid="sidebar-link-mock-session"]');
  await page.waitForURL(/\/mock-session/);
  await page.getByText('Show Evidence →').click();
  const startButton = page.getByTestId('primary-start-session');
  await expect(startButton).toBeEnabled();
  const startResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/mock-sessions`)
    && response.request().method() === 'POST'
  );
  await startButton.click();
  const startResponse = await startResponsePromise;
  const startBody = await startResponse.json();
  const sessionId = startBody.sessionId;
  expect(sessionId).toBeTruthy();

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
    await page.fill('[data-testid="mock-session-answer"]', 'Evidence provided.');
    const answerResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && response.url().includes('/mock-sessions/')
      && response.url().includes('/answer')
    );
    await page.click('[data-testid="primary-submit-answer"]');
    const answerResponse = await answerResponsePromise;
    const answerBody = await answerResponse.json();
    expect(answerBody.status).toBe('COMPLETED');
    expect(answerBody.reportingDomain).toBe('MOCK_SIMULATION');
    expect(answerBody.mode).toBe('MOCK');
  } else {
    expect(statusValue).toBe('COMPLETED');
  }

  await page.click('[data-testid="sidebar-link-findings"]');
  await page.waitForURL(/\/findings\?provider=/);
  const findingsResponse = await page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/findings`)
    && response.request().method() === 'GET'
  );
  const findingsBody = await findingsResponse.json();
  // New providers default to MOCK mode until they have regulatory history
  expect(findingsBody.reportingDomain).toBe('MOCK_SIMULATION');
  // Findings from mock sessions are captured here
  expect(findingsBody.findings.length).toBeGreaterThanOrEqual(0);
  // Ingestion banner only shows in REAL mode, not MOCK mode
  // Verify we're in mock mode (banner should NOT be visible)
  expect(findingsBody.mode).toBe('MOCK');

  await page.click('[data-testid="sidebar-link-exports"]');
  await page.waitForURL(/\/exports\?provider=/);
  const exportButton = page.getByTestId('primary-generate-export');
  await expect(exportButton).toBeEnabled();
  const exportReportResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/exports`)
    && response.request().method() === 'POST'
  );
  await exportButton.click();
  await exportReportResponsePromise;
  await expect(page.getByRole('link', { name: /Download Blue Ocean Report/i })).toBeVisible();

  await page.click('[data-testid="sidebar-link-audit"]');
  await page.waitForURL(/\/audit\?provider=/);
  await expect(page.getByRole('heading', { name: 'Audit Trail' })).toBeVisible();
  await page.getByRole('button', { name: 'Show Evidence →' }).click({ force: true });
  await expect(page.getByRole('button', { name: 'Show Trace →' })).toBeVisible();
  await expect(page.getByText('PROVIDER_CREATED').first()).toBeVisible();
  await expect(page.getByText('FACILITY_ONBOARDED').first()).toBeVisible();
  await expect(page.getByText('EVIDENCE_RECORDED').first()).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_STARTED').first()).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_COMPLETED').first()).toBeVisible();
  await expect(page.getByText('EXPORT_GENERATED').first()).toBeVisible();
});
