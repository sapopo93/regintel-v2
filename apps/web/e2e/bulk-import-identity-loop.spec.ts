import { test, expect } from '@playwright/test';
import { loginAsFounder } from './helpers';

test('bulk-import Identity Loop: Import → Auto-Sync → Evidence Verification', async ({ page, baseURL }) => {
    // 1. Login
    await loginAsFounder(page);
    await page.goto(`${baseURL}/providers`);
    console.log(`Current URL: ${page.url()}`);

    // 2. Create a fresh provider for isolation
    const providerName = `Bulk Identity Provider ${Date.now()}`;
    console.log(`Creating provider: ${providerName}`);

    try {
        await expect(page.getByTestId('provider-name-input')).toBeVisible({ timeout: 10000 });
    } catch (e) {
        await page.screenshot({ path: 'failure-screenshot.png' });
        console.log('Failed to find provider-name-input. Screenshot saved.');
        throw e;
    }
    await page.fill('[data-testid="provider-name-input"]', providerName);
    const providerResponsePromise = page.waitForResponse(response =>
        response.url().includes('/v1/providers') && response.request().method() === 'POST'
    );
    await page.click('[data-testid="primary-create-provider"]');
    const providerResponse = await providerResponsePromise;
    const { provider } = await providerResponse.json();
    const providerId = provider.providerId;

    // 3. Navigate to Bulk Import
    await page.waitForURL(/\/facilities\?provider=/);
    await page.click('[data-testid="bulk-import-button"]');
    await page.waitForURL(/\/facilities\/bulk-import\?provider=/);

    // 4. Input a real CQC location ID and enable auto-sync
    // - 1-1881302287: St Joseph's Nursing Home
    const locationIds = '1-1881302287';
    await page.fill('[data-testid="cqc-location-ids-input"]', locationIds);
    await page.check('[data-testid="auto-sync-checkbox"]');

    // Submit and wait for synchronous onboarding part to finish
    const bulkResponsePromise = page.waitForResponse(response =>
        response.url().includes('/v1/facilities/onboard-bulk') && response.request().method() === 'POST'
    );
    await page.click('[data-testid="primary-bulk-import"]');
    const bulkResponse = await bulkResponsePromise;
    const bulkData = await bulkResponse.json();

    // Verify onboarding succeeded
    expect(bulkData.summary.succeeded).toBe(1);
    await expect(page.getByText(/Import Complete: 1 of 1 facilit/)).toBeVisible();

    // 5. Verify API-derived Identity in the Facilities List
    await page.click('[data-testid="view-facilities-button"]');
    await page.waitForURL(/\/facilities\?provider=/);

    // CQC API should have provided the real name even if we didn't input it
    await expect(page.getByText("St Joseph's Nursing Home")).toBeVisible({ timeout: 15000 });

    // 6. Verify facility detail page shows CQC-sourced identity
    await page.click("text=St Joseph's Nursing Home");

    // The card click navigates to /overview — verify the facility name is visible
    await expect(page.getByText("St Joseph's Nursing Home")).toBeVisible({ timeout: 10000 });
});
