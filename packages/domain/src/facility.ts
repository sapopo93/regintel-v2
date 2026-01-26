/**
 * Facility Entity (Phase 10: Facility-First Onboarding)
 *
 * Represents a physical care facility (CQC location) within a provider organization.
 * IMMUTABLE: Facilities cannot be modified after creation (use versioning for changes).
 * Facilities are tenant-scoped and hash-verified for integrity.
 */

import { createHash } from 'node:crypto';
import {
  type TenantId,
  type ProviderId,
  type FacilityId,
  type ISOTimestamp,
  type ContentHash,
} from './types.js';

export interface Facility {
  // Identity
  id: FacilityId; // tenant-scoped: tenantId:facilityId
  tenantId: TenantId;
  providerId: ProviderId; // tenant-scoped: tenantId:providerId

  // Facility details
  facilityName: string;
  address: string;
  cqcLocationId: string; // CQC Location ID (required for regulatory tracking)
  serviceType: string; // e.g., "residential", "nursing", "domiciliary"
  capacity?: number; // Number of beds/service users (optional)

  // Integrity
  facilityHash: ContentHash; // SHA-256 of canonical representation

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string;
}

/**
 * Computes a deterministic facility hash.
 * Used for integrity verification and detecting duplicates.
 */
export function computeFacilityHash(facility: {
  facilityName: string;
  address: string;
  cqcLocationId: string;
  serviceType: string;
  capacity?: number;
}): ContentHash {
  const canonical = {
    facilityName: facility.facilityName.trim(),
    address: facility.address.trim(),
    cqcLocationId: facility.cqcLocationId.trim(),
    serviceType: facility.serviceType.trim(),
    capacity: facility.capacity,
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new facility.
 * Automatically computes facility hash and enforces tenant scoping.
 */
export function createFacility(input: {
  id: string; // Unscoped ID (will be scoped with tenantId)
  tenantId: TenantId;
  providerId: ProviderId; // Must be tenant-scoped: tenantId:providerId
  facilityName: string;
  address: string;
  cqcLocationId: string;
  serviceType: string;
  capacity?: number;
  createdBy: string;
}): Facility {
  // Validate providerId is tenant-scoped
  if (!input.providerId.startsWith(`${input.tenantId}:`)) {
    throw new Error(
      `ProviderId must be tenant-scoped. Expected format: ${input.tenantId}:providerId, got: ${input.providerId}`
    );
  }

  const facilityHash = computeFacilityHash({
    facilityName: input.facilityName,
    address: input.address,
    cqcLocationId: input.cqcLocationId,
    serviceType: input.serviceType,
    capacity: input.capacity,
  });

  // Scope the facility ID with tenant
  const scopedId: FacilityId = `${input.tenantId}:${input.id}`;

  return {
    id: scopedId,
    tenantId: input.tenantId,
    providerId: input.providerId,
    facilityName: input.facilityName,
    address: input.address,
    cqcLocationId: input.cqcLocationId,
    serviceType: input.serviceType,
    capacity: input.capacity,
    facilityHash,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

/**
 * Verifies that a facility's hash matches its content.
 */
export function verifyFacilityIntegrity(facility: Facility): boolean {
  const expectedHash = computeFacilityHash({
    facilityName: facility.facilityName,
    address: facility.address,
    cqcLocationId: facility.cqcLocationId,
    serviceType: facility.serviceType,
    capacity: facility.capacity,
  });

  return facility.facilityHash === expectedHash;
}
