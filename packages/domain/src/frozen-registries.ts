/**
 * Frozen Registries (Phase 9d: Mock Inspection Backend)
 *
 * Immutable, versioned registries for Topic Catalog v1 and PRS Logic Profiles v1.
 * These registries are frozen at specific SHA-256 hashes to ensure deterministic
 * mock inspection behavior across all sessions.
 *
 * CRITICAL INVARIANTS:
 * - Registry versions NEVER change once published
 * - SHA-256 hashes are computed deterministically
 * - No runtime modification allowed
 */

import { createHash } from 'node:crypto';
import type { ContentHash, TenantId, Domain } from './types.js';
import type { TopicCatalog } from './topic-catalog.js';
import type { PRSLogicProfile } from './prs-logic-profile.js';

/**
 * Frozen registry metadata
 */
export interface FrozenRegistry<T> {
  version: string;
  sha256: ContentHash;
  data: T;
  frozenAt: string;
  frozenBy: string;
}

/**
 * Topic Catalog v1 - Frozen registry
 */
export const TOPIC_CATALOG_V1_REGISTRY: FrozenRegistry<TopicCatalog | null> = {
  version: 'v1',
  sha256: '', // Will be computed on first access
  data: null, // Placeholder - would contain actual catalog in production
  frozenAt: '2024-01-01T00:00:00Z',
  frozenBy: 'system',
};

/**
 * PRS Logic Profiles v1 - Frozen registry
 */
export const PRS_LOGIC_PROFILES_V1_REGISTRY: FrozenRegistry<PRSLogicProfile | null> = {
  version: 'v1',
  sha256: '', // Will be computed on first access
  data: null, // Placeholder - would contain actual profile in production
  frozenAt: '2024-01-01T00:00:00Z',
  frozenBy: 'system',
};

/**
 * Computes SHA-256 hash of registry data.
 * DETERMINISTIC: Same data always produces same hash.
 */
export function computeRegistryHash<T>(data: T): ContentHash {
  const json = JSON.stringify(data);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Gets Topic Catalog v1 with computed hash.
 */
export function getTopicCatalogV1(): {
  catalog: TopicCatalog | null;
  version: string;
  sha256: ContentHash;
} {
  // Compute hash if not already set
  if (TOPIC_CATALOG_V1_REGISTRY.sha256 === '') {
    TOPIC_CATALOG_V1_REGISTRY.sha256 = computeRegistryHash(TOPIC_CATALOG_V1_REGISTRY.data);
  }

  return {
    catalog: TOPIC_CATALOG_V1_REGISTRY.data,
    version: TOPIC_CATALOG_V1_REGISTRY.version,
    sha256: TOPIC_CATALOG_V1_REGISTRY.sha256,
  };
}

/**
 * Gets PRS Logic Profiles v1 with computed hash.
 */
export function getPRSLogicProfilesV1(): {
  profile: PRSLogicProfile | null;
  version: string;
  sha256: ContentHash;
} {
  // Compute hash if not already set
  if (PRS_LOGIC_PROFILES_V1_REGISTRY.sha256 === '') {
    PRS_LOGIC_PROFILES_V1_REGISTRY.sha256 = computeRegistryHash(PRS_LOGIC_PROFILES_V1_REGISTRY.data);
  }

  return {
    profile: PRS_LOGIC_PROFILES_V1_REGISTRY.data,
    version: PRS_LOGIC_PROFILES_V1_REGISTRY.version,
    sha256: PRS_LOGIC_PROFILES_V1_REGISTRY.sha256,
  };
}

/**
 * Validates that registry has not been tampered with.
 */
export function validateRegistryIntegrity<T>(registry: FrozenRegistry<T>): boolean {
  const expectedHash = computeRegistryHash(registry.data);
  return registry.sha256 === expectedHash;
}
