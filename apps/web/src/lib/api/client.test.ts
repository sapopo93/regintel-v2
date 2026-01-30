/**
 * API Client Tests
 *
 * Tests for the type-safe API client including constitutional validation.
 */

import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import { ApiClient, ApiError, createApiClient } from './client';
import { ConstitutionalViolationError } from '../validators';

// Mock localStorage for Node.js test environment
const localStorageMock = {
  getItem: vi.fn(() => 'test-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

describe('API Client', () => {
  beforeAll(() => {
    // Set up window.localStorage mock
    Object.defineProperty(global, 'window', {
      value: { localStorage: localStorageMock },
      writable: true,
    });
  });

  afterAll(() => {
    // Clean up
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // Reset fetch mock before each test
    vi.restoreAllMocks();
    localStorageMock.getItem.mockReturnValue('test-token');
  });

  describe('Constitutional Validation', () => {
    it('should validate constitutional metadata on responses', async () => {
      const mockResponse = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'sha256:abc123',
        prsLogicVersion: 'v1',
        prsLogicHash: 'sha256:def456',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
        reportingDomain: 'MOCK_SIMULATION',
        mode: 'MOCK',
        snapshotId: 'snapshot:mock:system',
        ingestionStatus: 'NO_SOURCE',
        reportSource: {
          type: 'mock',
          id: 'system',
          asOf: '2026-01-23T10:00:00Z',
        },
        providers: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      const result = await client.getProviders();

      expect(result).toHaveProperty('topicCatalogVersion');
      expect(result).toHaveProperty('topicCatalogHash');
      expect(result).toHaveProperty('prsLogicVersion');
      expect(result).toHaveProperty('prsLogicHash');
      expect(result).toHaveProperty('snapshotTimestamp');
      expect(result).toHaveProperty('domain');
    });

    it('should throw ConstitutionalViolationError for missing metadata', async () => {
      const invalidResponse = {
        // Missing constitutional metadata
        providers: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(invalidResponse),
        } as Response)
      );

      const client = createApiClient({ baseUrl: 'http://localhost:3001' });

      await expect(client.getProviders()).rejects.toThrow(ConstitutionalViolationError);
    });

    it('should throw for empty hash', async () => {
      const invalidResponse = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: '', // Empty hash
        prsLogicVersion: 'v1',
        prsLogicHash: 'sha256:def456',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
        reportingDomain: 'MOCK_SIMULATION',
        mode: 'MOCK',
        snapshotId: 'snapshot:mock:system',
        ingestionStatus: 'NO_SOURCE',
        reportSource: {
          type: 'mock',
          id: 'system',
          asOf: '2026-01-23T10:00:00Z',
        },
        providers: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(invalidResponse),
        } as Response)
      );

      const client = createApiClient({ baseUrl: 'http://localhost:3001' });

      await expect(client.getProviders()).rejects.toThrow(ConstitutionalViolationError);
    });
  });

  describe('Error Handling', () => {
    it('should throw ApiError for HTTP errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: () => Promise.resolve({ error: 'Not found' }),
        } as Response)
      );

      const client = createApiClient({ baseUrl: 'http://localhost:3001' });

      await expect(client.getProviders()).rejects.toThrow(ApiError);
    });

    it('should include error details in ApiError', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({ error: 'Server error' }),
        } as Response)
      );

      const client = createApiClient({ baseUrl: 'http://localhost:3001' });

      try {
        await client.getProviders();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
      }
    });
  });

  describe('Endpoint Methods', () => {
    beforeEach(() => {
      const validResponse = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'sha256:abc123',
        prsLogicVersion: 'v1',
        prsLogicHash: 'sha256:def456',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
        reportingDomain: 'MOCK_SIMULATION',
        mode: 'MOCK',
        snapshotId: 'snapshot:mock:system',
        ingestionStatus: 'NO_SOURCE',
        reportSource: {
          type: 'mock',
          id: 'system',
          asOf: '2026-01-23T10:00:00Z',
        },
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(validResponse),
        } as Response)
      );
    });

    it('should call getProviders endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getProviders();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should call getProviderOverview endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getProviderOverview('sunrise-care', 'facility-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers/sunrise-care/overview?facility=facility-1',
        expect.any(Object)
      );
    });

    it('should call getTopics endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getTopics('sunrise-care', 'facility-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers/sunrise-care/topics?facility=facility-1',
        expect.any(Object)
      );
    });

    it('should call getMockSessions endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getMockSessions('sunrise-care', 'facility-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers/sunrise-care/mock-sessions?facility=facility-1',
        expect.any(Object)
      );
    });

    it('should call getFindings endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getFindings('sunrise-care', 'facility-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers/sunrise-care/findings?facility=facility-1',
        expect.any(Object)
      );
    });

    it('should call getEvidence endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getEvidence('sunrise-care');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers/sunrise-care/evidence',
        expect.any(Object)
      );
    });

    it('should call getAuditTrail endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getAuditTrail('sunrise-care');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers/sunrise-care/audit-trail',
        expect.any(Object)
      );
    });

    it('should call getExportStatus endpoint', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getExportStatus('sunrise-care', 'facility-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/v1/providers/sunrise-care/exports?facility=facility-1',
        expect.any(Object)
      );
    });
  });

  describe('Tenant Header', () => {
    it('should include tenant header when tenantId is provided', async () => {
      const validResponse = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'sha256:abc123',
        prsLogicVersion: 'v1',
        prsLogicHash: 'sha256:def456',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
        reportingDomain: 'MOCK_SIMULATION',
        mode: 'MOCK',
        snapshotId: 'snapshot:mock:system',
        ingestionStatus: 'NO_SOURCE',
        reportSource: {
          type: 'mock',
          id: 'system',
          asOf: '2026-01-23T10:00:00Z',
        },
        providers: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(validResponse),
        } as Response)
      );

      const client = createApiClient({
        baseUrl: 'http://localhost:3001',
        tenantId: 'tenant-123',
      });

      await client.getProviders();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Tenant-Id': 'tenant-123',
          }),
        })
      );
    });

    it('should not include tenant header when tenantId is not provided', async () => {
      const validResponse = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'sha256:abc123',
        prsLogicVersion: 'v1',
        prsLogicHash: 'sha256:def456',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
        reportingDomain: 'MOCK_SIMULATION',
        mode: 'MOCK',
        snapshotId: 'snapshot:mock:system',
        ingestionStatus: 'NO_SOURCE',
        reportSource: {
          type: 'mock',
          id: 'system',
          asOf: '2026-01-23T10:00:00Z',
        },
        providers: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(validResponse),
        } as Response)
      );

      const client = createApiClient({ baseUrl: 'http://localhost:3001' });
      await client.getProviders();

      const fetchCall = (global.fetch as any).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['X-Tenant-Id']).toBeUndefined();
    });
  });

  describe('createApiClient factory', () => {
    it('should create API client with default config', () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3001' });

      expect(client).toBeInstanceOf(ApiClient);
    });

    it('should create API client with tenant config', () => {
      const client = createApiClient({
        baseUrl: 'http://localhost:3001',
        tenantId: 'tenant-123',
      });

      expect(client).toBeInstanceOf(ApiClient);
    });
  });
});
