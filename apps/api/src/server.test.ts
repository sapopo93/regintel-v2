import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

const TEST_TOKEN = 'test-founder-token';
const AUTH_HEADER = { Authorization: `Bearer ${TEST_TOKEN}` };

beforeAll(() => {
  process.env.CLERK_TEST_TOKEN = TEST_TOKEN;
  process.env.CLERK_TEST_TENANT_ID = 'test-tenant';
  process.env.CLERK_TEST_ROLE = 'FOUNDER';
  process.env.CLERK_TEST_USER_ID = 'test-user';
  process.env.E2E_TEST_MODE = 'true';
});

const app = createApp();

async function createProvider(providerName = 'Acme Care') {
  const response = await request(app)
    .post('/v1/providers')
    .set(AUTH_HEADER)
    .send({ providerName });
  return response.body.provider;
}

async function createFacility(providerId: string, overrides?: Partial<Record<string, unknown>>) {
  const payload = {
    facilityName: 'Acme Care Home',
    addressLine1: '123 High Street',
    townCity: 'London',
    postcode: 'SW1A 1AA',
    cqcLocationId: '1-123456789',
    serviceType: 'residential',
    capacity: 20,
    ...overrides,
  };

  const response = await request(app)
    .post(`/v1/providers/${providerId}/facilities`)
    .set(AUTH_HEADER)
    .send(payload);
  return response;
}

async function createBlob() {
  const contentBase64 = Buffer.from('PDF').toString('base64');
  return request(app)
    .post('/v1/evidence/blobs')
    .set(AUTH_HEADER)
    .send({ contentBase64, mimeType: 'application/pdf' });
}

function expectMetadata(payload: Record<string, unknown>) {
  expect(payload.topicCatalogVersion).toBeDefined();
  expect(payload.topicCatalogHash).toBeDefined();
  expect(payload.prsLogicVersion).toBeDefined();
  expect(payload.prsLogicHash).toBeDefined();
  expect(payload.snapshotTimestamp).toBeDefined();
  expect(payload.domain).toBeDefined();
  expect(payload.reportingDomain).toBeDefined();
  expect(payload.mode).toBeDefined();
  expect(payload.snapshotId).toBeDefined();
  expect(payload.ingestionStatus).toBeDefined();
  expect((payload as any).reportSource).toBeDefined();
}

describe('API contract tests', () => {
  it('enforces facility uniqueness per provider + CQC location', async () => {
    const provider = await createProvider('Unique Care');

    const first = await createFacility(provider.providerId);
    expect(first.status).toBe(200);

    const second = await createFacility(provider.providerId);
    expect(second.status).toBe(409);
  });

  it('validates CQC location ID format', async () => {
    const provider = await createProvider('Validation Care');

    const response = await createFacility(provider.providerId, {
      cqcLocationId: 'INVALID',
    });

    expect(response.status).toBe(400);
  });

  it('associates evidence with the correct facility', async () => {
    const provider = await createProvider('Evidence Care');
    const facilityA = (await createFacility(provider.providerId)).body.facility;
    const facilityB = (
      await createFacility(provider.providerId, { cqcLocationId: '1-987654321' })
    ).body.facility;

    const blobResponse = await createBlob();
    const blobHash = blobResponse.body.blobHash;

    await request(app)
      .post(`/v1/facilities/${facilityA.id}/evidence`)
      .set(AUTH_HEADER)
      .send({
        blobHash,
        evidenceType: 'CQC_REPORT',
        fileName: 'report.pdf',
      });

    const facilityAEvidence = await request(app)
      .get(`/v1/facilities/${facilityA.id}/evidence`)
      .set(AUTH_HEADER);
    const facilityBEvidence = await request(app)
      .get(`/v1/facilities/${facilityB.id}/evidence`)
      .set(AUTH_HEADER);

    expect(facilityAEvidence.body.evidence.length).toBe(1);
    expect(facilityBEvidence.body.evidence.length).toBe(0);
  });

  it('avoids mock fallback for CQC evidence exports', async () => {
    const provider = await createProvider('Regulatory Care');
    const facility = (await createFacility(provider.providerId)).body.facility;

    const blobResponse = await createBlob();
    const blobHash = blobResponse.body.blobHash;

    const evidenceResponse = await request(app)
      .post(`/v1/facilities/${facility.id}/evidence`)
      .set(AUTH_HEADER)
      .send({
        blobHash,
        evidenceType: 'CQC_REPORT',
        fileName: 'report.pdf',
      });
    expectMetadata(evidenceResponse.body);

    const exportStatus = await request(app)
      .get(`/v1/providers/${provider.providerId}/exports`)
      .query({ facility: facility.id })
      .set(AUTH_HEADER);

    expect(exportStatus.body.reportingDomain).toBe('REGULATORY_HISTORY');
    expect(exportStatus.body.mode).toBe('REAL');
    expect(exportStatus.body.ingestionStatus).toBe('INGESTION_INCOMPLETE');
    expect(exportStatus.body.reportSource?.type).toBe('cqc_upload');

    const exportResponse = await request(app)
      .post(`/v1/providers/${provider.providerId}/exports`)
      .set(AUTH_HEADER)
      .send({ facilityId: facility.id, format: 'BLUE_OCEAN_BOARD' });

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.reportingDomain).toBe('REGULATORY_HISTORY');

    const exportId = exportResponse.body.exportId;
    const exportDownload = await request(app)
      .get(`/v1/exports/${encodeURIComponent(exportId)}.md`)
      .set(AUTH_HEADER);

    expect(exportDownload.text).toContain('BLUE OCEAN — REGULATORY HISTORY');
    expect(exportDownload.text).not.toContain('BLUE OCEAN (MOCK)');
    expect(exportDownload.text).not.toContain('Mock finding generated');
    expect(exportDownload.text).toContain('report.pdf');
  });

  it('preserves mock exports for explicit mock sessions', async () => {
    const provider = await createProvider('Mock Export Care');
    const facility = (await createFacility(provider.providerId)).body.facility;

    const sessionResponse = await request(app)
      .post(`/v1/providers/${provider.providerId}/mock-sessions`)
      .set(AUTH_HEADER)
      .send({ topicId: 'safe-care-treatment', facilityId: facility.id });
    expectMetadata(sessionResponse.body);

    const answerResponse = await request(app)
      .post(`/v1/providers/${provider.providerId}/mock-sessions/${sessionResponse.body.sessionId}/answer`)
      .set(AUTH_HEADER)
      .send({ answer: 'Mock answer' });
    expectMetadata(answerResponse.body);

    const exportResponse = await request(app)
      .post(`/v1/providers/${provider.providerId}/exports`)
      .set(AUTH_HEADER)
      .send({ facilityId: facility.id, format: 'BLUE_OCEAN_BOARD' });

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.reportingDomain).toBe('MOCK_SIMULATION');

    const exportId = exportResponse.body.exportId;
    const exportDownload = await request(app)
      .get(`/v1/exports/${encodeURIComponent(exportId)}.md`)
      .set(AUTH_HEADER);

    expect(exportDownload.text).toContain('BLUE OCEAN (MOCK)');
  });

  it('includes constitutional metadata on every JSON endpoint', async () => {
    const providerResponse = await request(app)
      .post('/v1/providers')
      .set(AUTH_HEADER)
      .send({ providerName: 'Metadata Care' });
    expectMetadata(providerResponse.body);
    const provider = providerResponse.body.provider;

    const facilityResponse = await request(app)
      .post(`/v1/providers/${provider.providerId}/facilities`)
      .set(AUTH_HEADER)
      .send({
        facilityName: 'Metadata Facility',
        addressLine1: '12 Station Road',
        townCity: 'Leeds',
        postcode: 'LS1 1AA',
        cqcLocationId: '1-123456789',
        serviceType: 'residential',
        capacity: 5,
      });
    expectMetadata(facilityResponse.body);
    const facility = facilityResponse.body.facility;

    const blobResponse = await createBlob();
    expectMetadata(blobResponse.body);

    const evidenceResponse = await request(app)
      .post(`/v1/facilities/${facility.id}/evidence`)
      .set(AUTH_HEADER)
      .send({
        blobHash: blobResponse.body.blobHash,
        evidenceType: 'CQC_REPORT',
        fileName: 'report.pdf',
      });
    expectMetadata(evidenceResponse.body);

    const sessionResponse = await request(app)
      .post(`/v1/providers/${provider.providerId}/mock-sessions`)
      .set(AUTH_HEADER)
      .send({ topicId: 'safe-care-treatment', facilityId: facility.id });
    expectMetadata(sessionResponse.body);
    const session = sessionResponse.body;

    const answerResponse = await request(app)
      .post(`/v1/providers/${provider.providerId}/mock-sessions/${session.sessionId}/answer`)
      .set(AUTH_HEADER)
      .send({ answer: 'Mock answer' });
    expectMetadata(answerResponse.body);

    const findingsResponse = await request(app)
      .get(`/v1/providers/${provider.providerId}/findings`)
      .query({ facility: facility.id })
      .set(AUTH_HEADER);
    expectMetadata(findingsResponse.body);
    const findingId = findingsResponse.body.findings?.[0]?.id;

    const endpoints = [
      request(app).get('/v1/providers'),
      request(app).get(`/v1/providers/${provider.providerId}/overview`).query({ facility: facility.id }),
      request(app).get(`/v1/providers/${provider.providerId}/topics`).query({ facility: facility.id }),
      request(app).get(`/v1/providers/${provider.providerId}/topics/safe-care-treatment`),
      request(app).get(`/v1/providers/${provider.providerId}/mock-sessions`).query({ facility: facility.id }),
      request(app).get(`/v1/providers/${provider.providerId}/mock-sessions/${session.sessionId}`),
      request(app).get(`/v1/providers/${provider.providerId}/evidence`).query({ facility: facility.id }),
      request(app).get(`/v1/providers/${provider.providerId}/audit-trail`),
      request(app).get(`/v1/providers/${provider.providerId}/facilities`),
      request(app).get(`/v1/facilities/${facility.id}`),
      request(app).get(`/v1/facilities/${facility.id}/evidence`),
      request(app).get(`/v1/providers/${provider.providerId}/exports`).query({ facility: facility.id }),
      request(app).post(`/v1/providers/${provider.providerId}/exports`).send({ facilityId: facility.id, format: 'PDF' }),
    ];

    if (findingId) {
      endpoints.push(request(app).get(`/v1/providers/${provider.providerId}/findings/${findingId}`));
    }

    for (const call of endpoints) {
      const response = await call.set(AUTH_HEADER);
      expectMetadata(response.body);
    }
  });
});
