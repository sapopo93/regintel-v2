/**
 * Facility Entity Tests (Phase 10: Facility-First Onboarding)
 */

import { describe, it, expect } from 'vitest';
import { createFacility, computeFacilityHash, verifyFacilityIntegrity } from './facility.js';

describe('Facility Entity', () => {
  const mockTenantId = 'tenant-123';
  const mockProviderId = `${mockTenantId}:provider-456`;
  const mockUserId = 'user-789';

  describe('createFacility', () => {
    it('should create a facility with tenant-scoped ID', () => {
      const facility = createFacility({
        id: 'facility-001',
        tenantId: mockTenantId,
        providerId: mockProviderId,
        facilityName: 'Sunshine Care Home',
        address: '123 High Street, London, SW1A 1AA',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'residential',
        capacity: 30,
        createdBy: mockUserId,
      });

      expect(facility.id).toBe(`${mockTenantId}:facility-001`);
      expect(facility.tenantId).toBe(mockTenantId);
      expect(facility.providerId).toBe(mockProviderId);
      expect(facility.facilityName).toBe('Sunshine Care Home');
      expect(facility.address).toBe('123 High Street, London, SW1A 1AA');
      expect(facility.cqcLocationId).toBe('CQC-LOC-12345');
      expect(facility.serviceType).toBe('residential');
      expect(facility.capacity).toBe(30);
      expect(facility.facilityHash).toBeTruthy();
      expect(facility.createdAt).toBeTruthy();
      expect(facility.createdBy).toBe(mockUserId);
    });

    it('should throw error if providerId is not tenant-scoped', () => {
      expect(() => {
        createFacility({
          id: 'facility-001',
          tenantId: mockTenantId,
          providerId: 'provider-456', // Not scoped!
          facilityName: 'Sunshine Care Home',
          address: '123 High Street, London, SW1A 1AA',
          cqcLocationId: 'CQC-LOC-12345',
          serviceType: 'residential',
          createdBy: mockUserId,
        });
      }).toThrow('ProviderId must be tenant-scoped');
    });

    it('should allow optional capacity', () => {
      const facility = createFacility({
        id: 'facility-001',
        tenantId: mockTenantId,
        providerId: mockProviderId,
        facilityName: 'Sunshine Care Home',
        address: '123 High Street, London, SW1A 1AA',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'domiciliary', // Domiciliary care may not have capacity
        createdBy: mockUserId,
      });

      expect(facility.capacity).toBeUndefined();
      expect(facility.facilityHash).toBeTruthy();
    });
  });

  describe('computeFacilityHash', () => {
    it('should produce deterministic hash for same inputs', () => {
      const input = {
        facilityName: 'Sunshine Care Home',
        address: '123 High Street, London, SW1A 1AA',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'residential',
        capacity: 30,
      };

      const hash1 = computeFacilityHash(input);
      const hash2 = computeFacilityHash(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should produce different hash for different inputs', () => {
      const input1 = {
        facilityName: 'Sunshine Care Home',
        address: '123 High Street, London, SW1A 1AA',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'residential',
        capacity: 30,
      };

      const input2 = {
        ...input1,
        capacity: 40, // Different capacity
      };

      const hash1 = computeFacilityHash(input1);
      const hash2 = computeFacilityHash(input2);

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize whitespace in facility name and address', () => {
      const input1 = {
        facilityName: '  Sunshine Care Home  ',
        address: '  123 High Street, London, SW1A 1AA  ',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'residential',
      };

      const input2 = {
        facilityName: 'Sunshine Care Home',
        address: '123 High Street, London, SW1A 1AA',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'residential',
      };

      const hash1 = computeFacilityHash(input1);
      const hash2 = computeFacilityHash(input2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('verifyFacilityIntegrity', () => {
    it('should verify integrity of valid facility', () => {
      const facility = createFacility({
        id: 'facility-001',
        tenantId: mockTenantId,
        providerId: mockProviderId,
        facilityName: 'Sunshine Care Home',
        address: '123 High Street, London, SW1A 1AA',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'residential',
        capacity: 30,
        createdBy: mockUserId,
      });

      expect(verifyFacilityIntegrity(facility)).toBe(true);
    });

    it('should detect tampered facility data', () => {
      const facility = createFacility({
        id: 'facility-001',
        tenantId: mockTenantId,
        providerId: mockProviderId,
        facilityName: 'Sunshine Care Home',
        address: '123 High Street, London, SW1A 1AA',
        cqcLocationId: 'CQC-LOC-12345',
        serviceType: 'residential',
        capacity: 30,
        createdBy: mockUserId,
      });

      // Tamper with the facility
      const tamperedFacility = {
        ...facility,
        capacity: 50, // Changed capacity without updating hash
      };

      expect(verifyFacilityIntegrity(tamperedFacility)).toBe(false);
    });
  });
});
