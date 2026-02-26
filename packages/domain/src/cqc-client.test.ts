/**
 * CQC API Client Tests (Phase 10: Facility Onboarding)
 */

import { describe, it, expect } from 'vitest';
import { isValidCqcLocationId, fetchCqcLocation, type CqcLocationData } from './cqc-client.js';

describe('CQC Client', () => {
  describe('isValidCqcLocationId', () => {
    it('should accept valid 9-digit CQC Location IDs', () => {
      expect(isValidCqcLocationId('1-123456789')).toBe(true);
      expect(isValidCqcLocationId('1-987654321')).toBe(true);
    });

    it('should accept valid 10-digit CQC Location IDs', () => {
      expect(isValidCqcLocationId('1-1234567890')).toBe(true);
      expect(isValidCqcLocationId('1-9876543210')).toBe(true);
    });

    it('should accept valid 11-digit CQC Location IDs', () => {
      expect(isValidCqcLocationId('1-12345678901')).toBe(true);
      expect(isValidCqcLocationId('1-10000302982')).toBe(true); // Real Henley House CQC ID
    });

    it('should accept IDs with leading/trailing whitespace', () => {
      expect(isValidCqcLocationId('  1-123456789  ')).toBe(true);
      expect(isValidCqcLocationId('\t1-1234567890\n')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidCqcLocationId('123456789')).toBe(false); // Missing prefix
      expect(isValidCqcLocationId('2-123456789')).toBe(false); // Wrong prefix
      expect(isValidCqcLocationId('1-123456')).toBe(false); // Too short (6 digits)
      expect(isValidCqcLocationId('1-12345678901234')).toBe(false); // Too long (14 digits)
      expect(isValidCqcLocationId('1-ABCDEFGHI')).toBe(false); // Non-numeric
      expect(isValidCqcLocationId('1_123456789')).toBe(false); // Wrong separator
      expect(isValidCqcLocationId('')).toBe(false); // Empty
    });
  });

  describe('fetchCqcLocation', () => {
    it('should return error for invalid CQC Location ID format', async () => {
      const result = await fetchCqcLocation('invalid-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FORMAT');
        expect(result.error.message).toContain('Invalid CQC Location ID format');
      }
    });

    it('should successfully fetch location data from mock API', async () => {
      const mockData: CqcLocationData = {
        locationId: '1-123456789',
        name: 'Sunnydale Care Home',
        postalCode: 'SW1A 1AA',
        postalAddressLine1: '123 High Street',
        postalAddressTownCity: 'London',
        registrationStatus: 'Registered',
        type: 'Care home service with nursing',
        numberOfBeds: 50,
        currentRatings: {
          overall: {
            rating: 'Good',
            reportDate: '2024-12-01',
          },
        },
      };

      const mockFetch = async (url: string) => {
        expect(url).toContain('/public/v1/locations/1-123456789');
        return {
          ok: true,
          status: 200,
          json: async () => mockData,
        } as Response;
      };

      const result = await fetchCqcLocation('1-123456789', {
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.locationId).toBe('1-123456789');
        expect(result.data.name).toBe('Sunnydale Care Home');
        expect(result.data.numberOfBeds).toBe(50);
        expect(result.data.currentRatings?.overall?.rating).toBe('Good');
      }
    });

    it('should handle 404 not found errors', async () => {
      const mockFetch = async () => {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response;
      };

      const result = await fetchCqcLocation('1-999999999', {
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.statusCode).toBe(404);
        expect(result.error.message).toContain('not found');
      }
    });

    it('should handle 429 rate limit errors', async () => {
      const mockFetch = async () => {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        } as Response;
      };

      const result = await fetchCqcLocation('1-123456789', {
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RATE_LIMITED');
        expect(result.error.statusCode).toBe(429);
        expect(result.error.message).toContain('rate limit');
      }
    });

    it('should handle timeout errors', async () => {
      const mockFetch = async (_url: string, options?: RequestInit) => {
        // Simulate timeout by aborting
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (options?.signal?.aborted) {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          throw error;
        }
        return { ok: true, json: async () => ({}) } as Response;
      };

      const result = await fetchCqcLocation('1-123456789', {
        timeoutMs: 50, // Very short timeout to trigger abort
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.message).toContain('timed out');
      }
    });

    it('should handle other HTTP errors', async () => {
      const mockFetch = async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response;
      };

      const result = await fetchCqcLocation('1-123456789', {
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.statusCode).toBe(500);
        expect(result.error.message).toContain('500');
      }
    });

    it('should handle network errors', async () => {
      const mockFetch = async () => {
        throw new Error('Network error: Failed to fetch');
      };

      const result = await fetchCqcLocation('1-123456789', {
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.message).toContain('Network error');
      }
    });

    it('should use custom baseUrl when provided', async () => {
      let capturedUrl = '';
      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => ({ locationId: '1-123456789', name: 'Test' }),
        } as Response;
      };

      await fetchCqcLocation('1-123456789', {
        baseUrl: 'https://test-api.example.com',
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(capturedUrl).toBe('https://test-api.example.com/public/v1/locations/1-123456789');
    });

    it('should normalize CQC Location ID (trim and pass through)', async () => {
      let capturedUrl = '';
      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => ({ locationId: '1-123456789', name: 'Test' }),
        } as Response;
      };

      await fetchCqcLocation('  1-123456789  ', {
        fetch: mockFetch as typeof globalThis.fetch,
      });

      expect(capturedUrl).toContain('/1-123456789'); // Trimmed
    });
  });
});
