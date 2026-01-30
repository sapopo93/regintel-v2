import { test, expect } from '@playwright/test';
import { loginAsFounder } from './helpers';
import { readFile } from 'node:fs/promises';

const BASE_URL = 'http://localhost:3000';

test('founder full journey from onboarding to export', async ({ page }) => {
  await loginAsFounder(page);

  await page.goto(`${BASE_URL}/providers`);

  const providerName = `Founder Journey ${Date.now()}`;
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

  const cqcLocationId = `1-${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  await page.fill('[data-testid="facility-name-input"]', 'Acme Care Home');
  await page.fill('[data-testid="cqc-location-id-input"]', cqcLocationId);
  await page.fill('[data-testid="address-line1-input"]', '123 High Street');
  await page.fill('[data-testid="town-city-input"]', 'London');
  await page.fill('[data-testid="postcode-input"]', 'SW1A 1AA');
  await page.selectOption('[data-testid="service-type-select"]', 'residential');
  await page.fill('[data-testid="capacity-input"]', '20');

  const facilityResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/v1/facilities/onboard') &&
    response.request().method() === 'POST'
  );
  await page.click('[data-testid="primary-create-facility"]');
  const facilityResponse = await facilityResponsePromise;
  const facilityBody = await facilityResponse.json();
  const facilityId = facilityBody.facility?.id;
  expect(facilityId).toBeTruthy();

  await page.waitForURL(new RegExp(`/facilities/${facilityId}`));

  await expect(page.getByText('Provider ID:')).toBeVisible();
  await expect(page.getByText(String(providerId))).toBeVisible();
  await expect(page.getByText('Facility ID:')).toBeVisible();
  await expect(page.getByText(String(facilityId))).toBeVisible();
  await expect(page.getByText(cqcLocationId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('As Of:')).toBeVisible();
  await expect(page.getByRole('main').getByText('Topic Catalog')).toBeVisible();

  await page.click('[data-testid="toggle-upload-button"]');
  await page.waitForSelector('[data-testid="file-input"]', { state: 'visible' });
  await page.setInputFiles('[data-testid="file-input"]', {
    name: 'cqc-report.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%mock\n'),
  });
  // Select CQC_REPORT as the evidence type
  await page.selectOption('[data-testid="evidence-type-select"]', 'CQC_REPORT');
  // Wait for the submit button to be enabled (file selected)
  await expect(page.getByTestId('primary-upload-evidence')).toBeEnabled();

  const blobResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/v1/evidence/blobs') && response.request().method() === 'POST'
  );
  const recordResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/facilities/${facilityId}/evidence`) &&
    response.request().method() === 'POST'
  );
  await page.click('[data-testid="primary-upload-evidence"]');
  await blobResponsePromise;
  const recordResponse = await recordResponsePromise;
  const recordBody = await recordResponse.json();
  expect(recordBody.record?.evidenceType).toBe('CQC_REPORT');
  await expect(page.getByText('cqc-report.pdf')).toBeVisible();

  await page.click('[data-testid="continue-overview-button"]');
  await page.waitForURL((url) =>
    url.pathname === '/overview' &&
    url.searchParams.get('provider') === providerId &&
    url.searchParams.get('facility') === facilityId
  );

  await page.click('[data-testid="sidebar-link-mock-session"]');
  await page.waitForURL(/\/mock-session/);

  // Expand disclosure panel to show the evidence layer with the start button
  await page.getByText('Show Evidence →').click();
  const startButton = page.getByTestId('primary-start-session');
  await expect(startButton).toBeEnabled();
  const startResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/mock-sessions`) &&
    response.request().method() === 'POST'
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
    await page.fill('[data-testid="mock-session-answer"]', 'We have evidence on file.');
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

  const findingsResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/findings`) &&
    response.request().method() === 'GET'
  );
  await page.click('[data-testid="sidebar-link-findings"]');
  const findingsResponse = await findingsResponsePromise;
  const findingsBody = await findingsResponse.json();
  expect(findingsBody.reportingDomain).toBe('REGULATORY_HISTORY');
  expect(findingsBody.findings.length).toBe(0);
  await expect(page.getByTestId('ingestion-status-banner')).toBeVisible();

  await page.click('[data-testid="sidebar-link-exports"]');
  await page.waitForSelector('h1');

  const exportButton = page.getByTestId('primary-generate-export');
  await expect(exportButton).toBeEnabled();
  const exportReportResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/exports`) &&
    response.request().method() === 'POST'
  );
  await exportButton.click();
  await exportReportResponsePromise;

  await expect(page.getByRole('link', { name: /Download Blue Ocean Report/i })).toBeVisible();
  const reportDownloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download Blue Ocean Report/i }).click();
  const reportDownload = await reportDownloadPromise;
  const reportPath = await reportDownload.path();
  expect(reportPath).toBeTruthy();
  const reportContent = await readFile(reportPath as string, 'utf-8');
  expect(reportContent).toContain('BLUE OCEAN — REGULATORY HISTORY');
  // Board Pack format doesn't include evidence filenames when there are no findings
  // The evidence is verified by the EVIDENCE_RECORDED audit event instead

  await page.click('[data-testid="sidebar-link-audit"]');
  await page.waitForURL(/\/audit\?provider=/);
  await expect(page.getByRole('heading', { name: 'Audit Trail' })).toBeVisible();
  // Audit events are in the Evidence disclosure layer
  await page.getByRole('button', { name: 'Show Evidence →' }).click({ force: true });
  await expect(page.getByRole('button', { name: 'Show Trace →' })).toBeVisible();
  await expect(page.getByText('PROVIDER_CREATED')).toBeVisible();
  await expect(page.getByText('FACILITY_ONBOARDED')).toBeVisible();
  await expect(page.getByText('EVIDENCE_RECORDED')).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_STARTED')).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_ANSWERED')).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_COMPLETED')).toBeVisible();
  await expect(page.getByText('EXPORT_GENERATED').first()).toBeVisible();
});
