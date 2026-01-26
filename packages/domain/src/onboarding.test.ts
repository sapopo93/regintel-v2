/**
 * Facility Onboarding Logic Tests (Phase 10: Facility Onboarding)
 */

import { describe, it, expect } from 'vitest';
import { onboardFacility } from './onboarding.js';
import type { CqcLocationData } from './cqc-client.js';

describe('Facility Onboarding', () => {
  const validCqcId = '1-123456789';
  const mockProviderId = 'tenant-1:provider-123';

  describe('CQC API Success Flow', () => {
    it('should merge CQC data with user input when CQC API succeeds', async () => {
      const mockCqcData: CqcLocationData = {
        locationId: validCqcId,
        name: 'CQC Official Name',
        postalCode: 'SW1A 1AA',
        postalAddressLine1: '10 Downing Street',
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

      const mockFetch = async () => {
        return {
          ok: true,
          json: async () => mockCqcData,
        } as Response;
      };

      const result = await onboardFacility(
        {
          providerId: mockProviderId,
          cqcLocationId: validCqcId,
          facilityName: 'User Override Name', // User input should win
          addressLine1: '123 User Street', // User input should win
          townCity: 'User City',
          postcode: 'USER 123',
        },
        { fetch: mockFetch as typeof globalThis.fetch }
      );

      expect(result.cqcData).toBeTruthy();
      expect(result.cqcData?.locationId).toBe(validCqcId);

      // User input wins for facility name
      expect(result.facilityData.facilityName).toBe('User Override Name');

      // User input wins for address
      expect(result.facilityData.addressLine1).toBe('123 User Street');
      expect(result.facilityData.townCity).toBe('User City');
      expect(result.facilityData.postcode).toBe('USER 123');

      // CQC wins for service type (normalized)
      expect(result.facilityData.serviceType).toBe('nursing'); // Normalized from "Care home service with nursing"

      // CQC wins for capacity
      expect(result.facilityData.capacity).toBe(50);

      // Metadata
      expect(result.facilityData.dataSource).toBe('CQC_API');
      expect(result.facilityData.cqcSyncedAt).toBeTruthy();
      expect(result.facilityData.latestRating).toBe('Good');
      expect(result.facilityData.latestRatingDate).toBe('2024-12-01');
    });

    it('should use CQC name when user does not provide facilityName', async () => {
      const mockCqcData: CqcLocationData = {
        locationId: validCqcId,
        name: 'Sunnydale Care Home',
        registrationStatus: 'Registered',
        type: 'Care home service without nursing',
      };

      const mockFetch = async () => {
        return {
          ok: true,
          json: async () => mockCqcData,
        } as Response;
      };

      const result = await onboardFacility(
        {
          providerId: mockProviderId,
          cqcLocationId: validCqcId,
          addressLine1: '123 Street',
          townCity: 'City',
          postcode: 'POST123',
        },
        { fetch: mockFetch as typeof globalThis.fetch }
      );

      expect(result.facilityData.facilityName).toBe('Sunnydale Care Home');
      expect(result.facilityData.serviceType).toBe('residential'); // Normalized from "Care home service without nursing"
    });

    it('should use CQC address when user does not provide address fields', async () => {
      const mockCqcData: CqcLocationData = {
        locationId: validCqcId,
        name: 'Test Home',
        postalAddressLine1: 'CQC Street',
        postalAddressTownCity: 'CQC Town',
        postalCode: 'CQC123',
        registrationStatus: 'Registered',
        type: 'Residential care home',
      };

      const mockFetch = async () => {
        return {
          ok: true,
          json: async () => mockCqcData,
        } as Response;
      };

      const result = await onboardFacility(
        {
          providerId: mockProviderId,
          cqcLocationId: validCqcId,
        },
        { fetch: mockFetch as typeof globalThis.fetch }
      );

      expect(result.facilityData.addressLine1).toBe('CQC Street');
      expect(result.facilityData.townCity).toBe('CQC Town');
      expect(result.facilityData.postcode).toBe('CQC123');
    });

    it('should normalize various CQC service types correctly', async () => {
      const testCases = [
        { cqcType: 'Care home service with nursing', expected: 'nursing' },
        { cqcType: 'Care home service without nursing', expected: 'residential' },
        { cqcType: 'Residential care home', expected: 'residential' },
        { cqcType: 'Domiciliary care service', expected: 'domiciliary' },
        { cqcType: 'Home care agency', expected: 'domiciliary' },
        { cqcType: 'Supported living service', expected: 'supported_living' },
        { cqcType: 'Hospice services', expected: 'hospice' },
        { cqcType: 'Unknown service type', expected: 'residential' }, // Default
      ];

      for (const { cqcType, expected } of testCases) {
        const mockCqcData: CqcLocationData = {
          locationId: validCqcId,
          name: 'Test',
          registrationStatus: 'Registered',
          type: cqcType,
        };

        const mockFetch = async () => {
          return {
            ok: true,
            json: async () => mockCqcData,
          } as Response;
        };

        const result = await onboardFacility(
          {
            providerId: mockProviderId,
            cqcLocationId: validCqcId,
            addressLine1: 'Street',
            townCity: 'City',
            postcode: 'POST',
          },
          { fetch: mockFetch as typeof globalThis.fetch }
        );

        expect(result.facilityData.serviceType).toBe(expected);
      }
    });

    it('should handle CQC data with missing optional fields', async () => {
      const mockCqcData: CqcLocationData = {
        locationId: validCqcId,
        name: 'Minimal Care Home',
        registrationStatus: 'Registered',
        type: 'Care home',
        // No numberOfBeds, no currentRatings
      };

      const mockFetch = async () => {
        return {
          ok: true,
          json: async () => mockCqcData,
        } as Response;
      };

      const result = await onboardFacility(
        {
          providerId: mockProviderId,
          cqcLocationId: validCqcId,
          addressLine1: 'Street',
          townCity: 'City',
          postcode: 'POST',
          capacity: 30, // User provides capacity when CQC doesn't have it
        },
        { fetch: mockFetch as typeof globalThis.fetch }
      );

      expect(result.facilityData.capacity).toBe(30); // User input used since CQC has none
      expect(result.facilityData.latestRating).toBeUndefined();
      expect(result.facilityData.latestRatingDate).toBeUndefined();
    });
  });

  describe('CQC API Failure Flow', () => {
    it('should use manual input when CQC API fails and all required fields provided', async () => {
      const mockFetch = async () => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      const result = await onboardFacility(
        {
          providerId: mockProviderId,
          cqcLocationId: validCqcId,
          facilityName: 'Manual Entry Home',
          addressLine1: '456 Manual Street',
          townCity: 'Manual City',
          postcode: 'MAN123',
          serviceType: 'nursing',
          capacity: 40,
        },
        { fetch: mockFetch as typeof globalThis.fetch }
      );

      expect(result.cqcData).toBeNull(); // No CQC data
      expect(result.facilityData.dataSource).toBe('MANUAL');
      expect(result.facilityData.cqcSyncedAt).toBeNull();
      expect(result.facilityData.facilityName).toBe('Manual Entry Home');
      expect(result.facilityData.addressLine1).toBe('456 Manual Street');
      expect(result.facilityData.serviceType).toBe('nursing');
      expect(result.facilityData.capacity).toBe(40);
    });

    it('should throw error when CQC API fails and required manual fields are missing', async () => {
      const mockFetch = async () => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      await expect(
        onboardFacility(
          {
            providerId: mockProviderId,
            cqcLocationId: validCqcId,
            // Missing all manual fields
          },
          { fetch: mockFetch as typeof globalThis.fetch }
        )
      ).rejects.toThrow('facilityName, addressLine1, townCity, postcode, and serviceType are required');
    });

    it('should throw error when missing facilityName in manual mode', async () => {
      const mockFetch = async () => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      await expect(
        onboardFacility(
          {
            providerId: mockProviderId,
            cqcLocationId: validCqcId,
            // facilityName missing
            addressLine1: 'Street',
            townCity: 'City',
            postcode: 'POST',
            serviceType: 'residential',
          },
          { fetch: mockFetch as typeof globalThis.fetch }
        )
      ).rejects.toThrow('required');
    });
  });

  describe('Invalid Format Handling', () => {
    it('should handle invalid CQC Location ID format gracefully', async () => {
      const result = await onboardFacility({
        providerId: mockProviderId,
        cqcLocationId: 'invalid-format',
        facilityName: 'Test',
        addressLine1: 'Street',
        townCity: 'City',
        postcode: 'POST',
        serviceType: 'residential',
      });

      // Even with invalid format, if all manual fields are provided, it should work
      expect(result.cqcData).toBeNull();
      expect(result.facilityData.dataSource).toBe('MANUAL');
    });
  });

  describe('Idempotency & Re-onboarding', () => {
    it('should return consistent data for re-onboarding attempts', async () => {
      const mockCqcData: CqcLocationData = {
        locationId: validCqcId,
        name: 'Stable Care Home',
        registrationStatus: 'Registered',
        type: 'Nursing home',
        numberOfBeds: 60,
      };

      const mockFetch = async () => {
        return {
          ok: true,
          json: async () => mockCqcData,
        } as Response;
      };

      const result1 = await onboardFacility(
        {
          providerId: mockProviderId,
          cqcLocationId: validCqcId,
          addressLine1: 'Street',
          townCity: 'City',
          postcode: 'POST',
        },
        { fetch: mockFetch as typeof globalThis.fetch }
      );

      const result2 = await onboardFacility(
        {
          providerId: mockProviderId,
          cqcLocationId: validCqcId,
          addressLine1: 'Street',
          townCity: 'City',
          postcode: 'POST',
        },
        { fetch: mockFetch as typeof globalThis.fetch }
      );

      expect(result1.facilityData.facilityName).toBe(result2.facilityData.facilityName);
      expect(result1.facilityData.capacity).toBe(result2.facilityData.capacity);
      expect(result1.facilityData.serviceType).toBe(result2.facilityData.serviceType);
    });
  });
});
