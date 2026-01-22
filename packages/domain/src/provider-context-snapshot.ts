/**
 * ProviderContextSnapshot Entity (Phase 1: The Spine)
 *
 * Represents a time-frozen snapshot of provider state at a specific moment.
 * IMMUTABLE: Snapshots cannot be modified after creation (temporal safety).
 * All evaluations reference a snapshot to prevent retroactive judgment.
 */

import { createHash } from 'node:crypto';
import {
  ProviderRegulatoryState,
  Domain,
  type TenantId,
  type SnapshotId,
  type ISOTimestamp,
  type ContentHash,
} from './types.js';

export interface ProviderMetadata {
  providerName: string;
  cqcLocationId?: string; // CQC location ID (if applicable)
  serviceTypes: string[]; // e.g., ["residential", "nursing"]
  registeredManager?: string;
  registrationDate?: ISOTimestamp;
}

export interface ProviderContextSnapshot {
  // Identity
  id: SnapshotId;
  tenantId: TenantId;

  // Temporal context
  asOf: ISOTimestamp; // Point-in-time this snapshot represents
  regulatoryState: ProviderRegulatoryState;

  // Provider information (frozen at asOf)
  metadata: ProviderMetadata;

  // Enabled domains at this point in time
  enabledDomains: Domain[];

  // Active regulation versions at asOf
  activeRegulationIds: string[]; // Regulation IDs that were in effect

  // Active policy versions at asOf
  activePolicyIds: string[]; // Policy IDs that were in effect

  // Integrity
  snapshotHash: ContentHash; // SHA-256 of canonical representation

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string;
}

/**
 * Computes a deterministic snapshot hash.
 * Used to detect if an identical snapshot already exists.
 */
export function computeSnapshotHash(snapshot: {
  asOf: ISOTimestamp;
  regulatoryState: ProviderRegulatoryState;
  metadata: ProviderMetadata;
  enabledDomains: Domain[];
  activeRegulationIds: string[];
  activePolicyIds: string[];
}): ContentHash {
  const canonical = {
    asOf: snapshot.asOf,
    regulatoryState: snapshot.regulatoryState,
    metadata: {
      providerName: snapshot.metadata.providerName,
      cqcLocationId: snapshot.metadata.cqcLocationId,
      serviceTypes: [...snapshot.metadata.serviceTypes].sort(),
      registeredManager: snapshot.metadata.registeredManager,
      registrationDate: snapshot.metadata.registrationDate,
    },
    enabledDomains: [...snapshot.enabledDomains].sort(),
    activeRegulationIds: [...snapshot.activeRegulationIds].sort(),
    activePolicyIds: [...snapshot.activePolicyIds].sort(),
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new provider context snapshot.
 * Automatically computes snapshot hash.
 */
export function createProviderContextSnapshot(input: {
  id: SnapshotId;
  tenantId: TenantId;
  asOf: ISOTimestamp;
  regulatoryState: ProviderRegulatoryState;
  metadata: ProviderMetadata;
  enabledDomains: Domain[];
  activeRegulationIds: string[];
  activePolicyIds: string[];
  createdBy: string;
}): ProviderContextSnapshot {
  const snapshotHash = computeSnapshotHash({
    asOf: input.asOf,
    regulatoryState: input.regulatoryState,
    metadata: input.metadata,
    enabledDomains: input.enabledDomains,
    activeRegulationIds: input.activeRegulationIds,
    activePolicyIds: input.activePolicyIds,
  });

  return {
    id: input.id,
    tenantId: input.tenantId,
    asOf: input.asOf,
    regulatoryState: input.regulatoryState,
    metadata: input.metadata,
    enabledDomains: input.enabledDomains,
    activeRegulationIds: input.activeRegulationIds,
    activePolicyIds: input.activePolicyIds,
    snapshotHash,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

/**
 * Verifies that a snapshot's hash matches its content.
 */
export function verifySnapshotIntegrity(snapshot: ProviderContextSnapshot): boolean {
  const expectedHash = computeSnapshotHash({
    asOf: snapshot.asOf,
    regulatoryState: snapshot.regulatoryState,
    metadata: snapshot.metadata,
    enabledDomains: snapshot.enabledDomains,
    activeRegulationIds: snapshot.activeRegulationIds,
    activePolicyIds: snapshot.activePolicyIds,
  });

  return snapshot.snapshotHash === expectedHash;
}
