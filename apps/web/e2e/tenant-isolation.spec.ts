import { test, expect } from '@playwright/test';

/**
 * Tenant Isolation Security Tests
 *
 * Verifies that one tenant cannot see or access another tenant's data.
 *
 * Uses the FOUNDER token with x-tenant-id header override to simulate
 * two independent tenants (tenant-alpha and tenant-beta) in a single test run.
 *
 * Gate: none of these tests should ever be skipped in CI.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const FOUNDER_TOKEN = process.env.FOUNDER_TOKEN || 'test-founder-token';

// Two isolated tenants for this test suite
const TENANT_ALPHA = `security-test-alpha-${Date.now()}`;
const TENANT_BETA = `security-test-beta-${Date.now()}`;

function headersFor(tenant: string) {
  return {
    Authorization: `Bearer ${FOUNDER_TOKEN}`,
    'x-tenant-id': tenant,
    'Content-Type': 'application/json',
  };
}

let alphaProviderId: string;
let alphaFacilityId: string;
let betaProviderId: string;

test.describe('Tenant Isolation', () => {
  test.beforeAll(async ({ request }) => {
    // Create a provider + facility under tenant-alpha
    const alphaProviderRes = await request.post(`${API_BASE_URL}/v1/providers`, {
      headers: headersFor(TENANT_ALPHA),
      data: { providerName: 'Alpha Care Ltd' },
    });
    expect(alphaProviderRes.status()).toBe(201);
    const alphaProviderBody = await alphaProviderRes.json();
    alphaProviderId = alphaProviderBody.provider.providerId;

    const alphaFacilityRes = await request.post(
      `${API_BASE_URL}/v1/facilities/onboard`,
      {
        headers: headersFor(TENANT_ALPHA),
        data: {
          providerId: alphaProviderId,
          cqcLocationId: '1-900000001',
          facilityName: 'Alpha House',
          addressLine1: '1 Alpha Street',
          townCity: 'London',
          postcode: 'E1 1AA',
          serviceType: 'residential',
        },
      }
    );
    expect(alphaFacilityRes.status()).toBe(201);
    const alphaFacilityBody = await alphaFacilityRes.json();
    alphaFacilityId = alphaFacilityBody.facility.id;

    // Create a separate provider under tenant-beta
    const betaProviderRes = await request.post(`${API_BASE_URL}/v1/providers`, {
      headers: headersFor(TENANT_BETA),
      data: { providerName: 'Beta Care Ltd' },
    });
    expect(betaProviderRes.status()).toBe(201);
    const betaProviderBody = await betaProviderRes.json();
    betaProviderId = betaProviderBody.provider.providerId;
  });

  // --- Provider isolation ---

  test('tenant-beta cannot list tenant-alpha providers', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/v1/providers`, {
      headers: headersFor(TENANT_BETA),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.providers.map((p: { providerId: string }) => p.providerId);
    expect(ids).not.toContain(alphaProviderId);
    expect(ids).toContain(betaProviderId);
  });

  test('tenant-beta cannot fetch tenant-alpha provider overview', async ({ request }) => {
    const res = await request.get(
      `${API_BASE_URL}/v1/providers/${encodeURIComponent(alphaProviderId)}/overview?facility=${encodeURIComponent(alphaFacilityId)}`,
      { headers: headersFor(TENANT_BETA) }
    );
    // Must be 404 — alpha's provider ID is not visible in beta's tenant
    expect(res.status()).toBe(404);
  });

  // --- Facility isolation ---

  test('tenant-beta cannot list facilities under tenant-alpha provider', async ({ request }) => {
    const res = await request.get(
      `${API_BASE_URL}/v1/providers/${encodeURIComponent(alphaProviderId)}/facilities`,
      { headers: headersFor(TENANT_BETA) }
    );
    expect(res.status()).toBe(404);
  });

  test('tenant-beta cannot fetch tenant-alpha facility by ID', async ({ request }) => {
    const res = await request.get(
      `${API_BASE_URL}/v1/facilities/${encodeURIComponent(alphaFacilityId)}`,
      { headers: headersFor(TENANT_BETA) }
    );
    expect(res.status()).toBe(404);
  });

  test('tenant-beta cannot upload evidence to tenant-alpha facility', async ({ request }) => {
    const contentBase64 = Buffer.from('%PDF-1.4\n%test\n').toString('base64');
    const blobRes = await request.post(`${API_BASE_URL}/v1/evidence/blobs`, {
      headers: headersFor(TENANT_BETA),
      data: { contentBase64, mimeType: 'application/pdf' },
    });
    expect(blobRes.status()).toBe(201);
    const { blobHash } = await blobRes.json();

    const evidenceRes = await request.post(
      `${API_BASE_URL}/v1/facilities/${encodeURIComponent(alphaFacilityId)}/evidence`,
      {
        headers: headersFor(TENANT_BETA),
        data: { blobHash, evidenceType: 'POLICY', fileName: 'cross-tenant-attempt.pdf' },
      }
    );
    // Must not succeed — facility belongs to alpha
    expect(evidenceRes.status()).toBe(404);
  });

  test('tenant-beta cannot start a mock session against tenant-alpha provider', async ({
    request,
  }) => {
    const res = await request.post(
      `${API_BASE_URL}/v1/providers/${encodeURIComponent(alphaProviderId)}/mock-sessions`,
      {
        headers: headersFor(TENANT_BETA),
        data: { topicId: 'safe-care-treatment', facilityId: alphaFacilityId },
      }
    );
    expect(res.status()).toBe(404);
  });

  // --- Audit isolation ---

  test('tenant-beta cannot read tenant-alpha audit trail', async ({ request }) => {
    const res = await request.get(
      `${API_BASE_URL}/v1/providers/${encodeURIComponent(alphaProviderId)}/audit-trail`,
      { headers: headersFor(TENANT_BETA) }
    );
    expect(res.status()).toBe(404);
  });

  // --- Positive case: tenant-alpha can still read its own data ---

  test('tenant-alpha can still read its own provider after cross-tenant attempts', async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE_URL}/v1/providers`, {
      headers: headersFor(TENANT_ALPHA),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.providers.map((p: { providerId: string }) => p.providerId);
    expect(ids).toContain(alphaProviderId);
    expect(ids).not.toContain(betaProviderId);
  });

  test('tenant-alpha can still read its own facility after cross-tenant attempts', async ({
    request,
  }) => {
    const res = await request.get(
      `${API_BASE_URL}/v1/facilities/${encodeURIComponent(alphaFacilityId)}`,
      { headers: headersFor(TENANT_ALPHA) }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.facility.id).toBe(alphaFacilityId);
  });
});
