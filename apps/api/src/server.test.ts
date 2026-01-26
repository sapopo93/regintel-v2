import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

const TEST_TOKEN = 'test-founder-token';
const AUTH_HEADER = { Authorization: `Bearer ${TEST_TOKEN}` };

beforeAll(() => {
  process.env.FOUNDER_TOKEN = TEST_TOKEN;
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
