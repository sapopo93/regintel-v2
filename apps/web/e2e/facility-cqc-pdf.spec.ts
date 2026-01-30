import { test, expect } from '@playwright/test';
import { loginAsFounder } from './helpers';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';
const REPORT_PATH = process.env.CQC_REPORT_PATH
  || path.resolve(__dirname, 'fixtures', 'St Joseph Nursing Home.pdf');

test('create facility with CQC ID and upload CQC report PDF', async ({ page }) => {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`Missing CQC report PDF at ${REPORT_PATH}`);
  }

  await loginAsFounder(page);

  await page.goto(`${BASE_URL}/providers`);

  const providerName = `St Joseph Provider ${Date.now()}`;
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
});
