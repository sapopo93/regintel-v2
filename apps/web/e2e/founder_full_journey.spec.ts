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
    response.url().includes(`/v1/providers/${providerId}/facilities`) &&
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
  expect(findingsBody.findings.length).toBeGreaterThan(0);
  for (const finding of findingsBody.findings) {
    expect(finding.origin).toBe('SYSTEM_MOCK');
    expect(finding.reportingDomain).toBe('MOCK_SIMULATION');
  }

  await page.click('[data-testid="sidebar-link-exports"]');
  await page.waitForSelector('h1');

  const exportButton = page.getByTestId('primary-generate-export');
  await expect(exportButton).toBeEnabled();
  const exportPdfResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/exports`) &&
    response.request().method() === 'POST'
  );
  await exportButton.click();
  await exportPdfResponsePromise;

  await expect(page.getByRole('link', { name: /Download PDF/i })).toBeVisible();
  const pdfDownloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download PDF/i }).click();
  const pdfDownload = await pdfDownloadPromise;
  const pdfPath = await pdfDownload.path();
  expect(pdfPath).toBeTruthy();
  const pdfContent = await readFile(pdfPath as string, 'utf-8');
  expect(pdfContent).toContain('READINESS (MOCK) — NOT REGULATORY HISTORY');
  expect(pdfContent).toContain('topicCatalogVersion');
  expect(pdfContent).toContain('topicCatalogSha256');
  expect(pdfContent).toContain('prsLogicProfilesVersion');
  expect(pdfContent).toContain('prsLogicProfilesSha256');

  await page.getByLabel('CSV (Spreadsheet)').check();
  const exportCsvResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/v1/providers/${providerId}/exports`) &&
    response.request().method() === 'POST'
  );
  await exportButton.click();
  await exportCsvResponsePromise;

  await expect(page.getByRole('link', { name: /Download CSV/i })).toBeVisible();
  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download CSV/i }).click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  expect(csvPath).toBeTruthy();
  const csvContent = await readFile(csvPath as string, 'utf-8');
  expect(csvContent).toContain('READINESS (MOCK) — NOT REGULATORY HISTORY');
  expect(csvContent).toContain('topicCatalogVersion');
  expect(csvContent).toContain('topicCatalogSha256');
  expect(csvContent).toContain('prsLogicProfilesVersion');
  expect(csvContent).toContain('prsLogicProfilesSha256');

  await page.click('[data-testid="sidebar-link-audit"]');
  await page.waitForURL(/\/audit\?provider=/);
  await expect(page.getByRole('heading', { name: 'Audit Trail' })).toBeVisible();
  // Audit events are in the Evidence disclosure layer
  await page.getByRole('button', { name: 'Show Evidence →' }).click({ force: true });
  await expect(page.getByRole('button', { name: 'Show Trace →' })).toBeVisible();
  await expect(page.getByText('PROVIDER_CREATED')).toBeVisible();
  await expect(page.getByText('FACILITY_CREATED')).toBeVisible();
  await expect(page.getByText('EVIDENCE_RECORDED')).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_STARTED')).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_ANSWERED')).toBeVisible();
  await expect(page.getByText('MOCK_SESSION_COMPLETED')).toBeVisible();
  await expect(page.getByText('EXPORT_GENERATED').first()).toBeVisible();
});
