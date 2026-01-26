import type { APIRequestContext, Page } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const FOUNDER_TOKEN = process.env.FOUNDER_TOKEN || 'test-founder-token';

export async function loginAsFounder(page: Page): Promise<void> {
  await page.addInitScript(({ token }) => {
    window.localStorage.setItem('regintel.auth.token', token);
    window.localStorage.setItem('regintel.auth.role', 'FOUNDER');
  }, { token: FOUNDER_TOKEN });
}

export async function createProvider(request: APIRequestContext, name: string) {
  const response = await request.post(`${API_BASE_URL}/v1/providers`, {
    headers: { Authorization: `Bearer ${FOUNDER_TOKEN}` },
    data: { providerName: name },
  });
  const body = await response.json();
  return body.provider;
}

export async function createFacility(
  request: APIRequestContext,
  providerId: string,
  overrides?: Partial<Record<string, unknown>>
) {
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

  const response = await request.post(`${API_BASE_URL}/v1/providers/${providerId}/facilities`, {
    headers: { Authorization: `Bearer ${FOUNDER_TOKEN}` },
    data: payload,
  });
  const body = await response.json();
  return body.facility;
}

export async function uploadCqcReport(
  request: APIRequestContext,
  facilityId: string,
  fileName = 'cqc-report.pdf'
) {
  const contentBase64 = Buffer.from('%PDF-1.4\n%mock\n').toString('base64');
  const blobResponse = await request.post(`${API_BASE_URL}/v1/evidence/blobs`, {
    headers: { Authorization: `Bearer ${FOUNDER_TOKEN}` },
    data: { contentBase64, mimeType: 'application/pdf' },
  });
  const blobBody = await blobResponse.json();

  await request.post(`${API_BASE_URL}/v1/facilities/${facilityId}/evidence`, {
    headers: { Authorization: `Bearer ${FOUNDER_TOKEN}` },
    data: {
      blobHash: blobBody.blobHash,
      evidenceType: 'CQC_REPORT',
      fileName,
    },
  });
}

export async function createMockSession(
  request: APIRequestContext,
  providerId: string,
  facilityId: string
) {
  const topicsResponse = await request.get(
    `${API_BASE_URL}/v1/providers/${providerId}/topics?facility=${facilityId}`,
    { headers: { Authorization: `Bearer ${FOUNDER_TOKEN}` } }
  );
  const topicsBody = await topicsResponse.json();
  const topicId = topicsBody.topics?.[0]?.id || 'safe-care-treatment';

  const sessionResponse = await request.post(
    `${API_BASE_URL}/v1/providers/${providerId}/mock-sessions`,
    {
      headers: { Authorization: `Bearer ${FOUNDER_TOKEN}` },
      data: { topicId, facilityId },
    }
  );
  const sessionBody = await sessionResponse.json();
  return { session: sessionBody, topicId };
}

export async function answerMockSession(
  request: APIRequestContext,
  providerId: string,
  sessionId: string,
  answer = 'We have evidence on file.'
) {
  const response = await request.post(
    `${API_BASE_URL}/v1/providers/${providerId}/mock-sessions/${sessionId}/answer`,
    {
      headers: { Authorization: `Bearer ${FOUNDER_TOKEN}` },
      data: { answer },
    }
  );
  return response.json();
}
