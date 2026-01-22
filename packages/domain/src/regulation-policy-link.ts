/**
 * RegulationPolicyLink Entity (Phase 1: The Spine)
 *
 * Represents edge-hashed, non-destructive mappings between regulations and policies.
 * IMMUTABLE: Once created, links cannot be modified. They can only be deprecated.
 * When regulations change, old links are marked as stale, not deleted.
 */

import { createHash } from 'node:crypto';
import {
  Domain,
  type TenantId,
  type LinkId,
  type RegulationId,
  type PolicyId,
  type ISOTimestamp,
  type ContentHash,
} from './types.js';

export enum LinkStatus {
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED', // Regulation changed, link may be stale
  SUPERSEDED = 'SUPERSEDED', // Replaced by newer link
}

export interface RegulationPolicyLink {
  // Identity
  id: LinkId;
  tenantId: TenantId;
  domain: Domain;

  // Link endpoints
  regulationId: RegulationId;
  regulationSectionId: string; // Specific section being mapped
  policyId: PolicyId;
  policyClauseId: string; // Specific clause being mapped

  // Link metadata
  status: LinkStatus;
  rationale?: string; // Why this mapping exists
  supersededBy?: LinkId; // If SUPERSEDED, points to replacement link

  // Integrity
  edgeHash: ContentHash; // Deterministic hash of the link itself

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string;
  deprecatedAt?: ISOTimestamp;
  deprecatedReason?: string;
}

/**
 * Computes a deterministic edge hash for a regulation-policy link.
 * Used to detect if the exact same link already exists.
 */
export function computeEdgeHash(link: {
  regulationId: RegulationId;
  regulationSectionId: string;
  policyId: PolicyId;
  policyClauseId: string;
  domain: Domain;
}): ContentHash {
  const canonical = {
    domain: link.domain,
    regulationId: link.regulationId,
    regulationSectionId: link.regulationSectionId,
    policyId: link.policyId,
    policyClauseId: link.policyClauseId,
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new regulation-policy link.
 * Automatically computes edge hash.
 */
export function createRegulationPolicyLink(input: {
  id: LinkId;
  tenantId: TenantId;
  domain: Domain;
  regulationId: RegulationId;
  regulationSectionId: string;
  policyId: PolicyId;
  policyClauseId: string;
  rationale?: string;
  createdBy: string;
}): RegulationPolicyLink {
  const edgeHash = computeEdgeHash({
    regulationId: input.regulationId,
    regulationSectionId: input.regulationSectionId,
    policyId: input.policyId,
    policyClauseId: input.policyClauseId,
    domain: input.domain,
  });

  return {
    id: input.id,
    tenantId: input.tenantId,
    domain: input.domain,
    regulationId: input.regulationId,
    regulationSectionId: input.regulationSectionId,
    policyId: input.policyId,
    policyClauseId: input.policyClauseId,
    status: LinkStatus.ACTIVE,
    rationale: input.rationale,
    edgeHash,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

/**
 * Verifies that a link's edge hash matches its endpoints.
 */
export function verifyLinkIntegrity(link: RegulationPolicyLink): boolean {
  const expectedHash = computeEdgeHash({
    regulationId: link.regulationId,
    regulationSectionId: link.regulationSectionId,
    policyId: link.policyId,
    policyClauseId: link.policyClauseId,
    domain: link.domain,
  });

  return link.edgeHash === expectedHash;
}

/**
 * Deprecates a link (non-destructive).
 * The original link remains in the database for audit purposes.
 */
export function deprecateLink(
  link: RegulationPolicyLink,
  reason: string
): RegulationPolicyLink {
  if (link.status === LinkStatus.DEPRECATED || link.status === LinkStatus.SUPERSEDED) {
    throw new Error(`Link ${link.id} is already deprecated/superseded`);
  }

  return {
    ...link,
    status: LinkStatus.DEPRECATED,
    deprecatedAt: new Date().toISOString(),
    deprecatedReason: reason,
  };
}

/**
 * Supersedes a link with a new one (non-destructive).
 * The original link is marked SUPERSEDED, the new link becomes ACTIVE.
 */
export function supersedeLink(
  oldLink: RegulationPolicyLink,
  newLink: RegulationPolicyLink
): RegulationPolicyLink {
  if (oldLink.status === LinkStatus.SUPERSEDED) {
    throw new Error(`Link ${oldLink.id} is already superseded`);
  }

  return {
    ...oldLink,
    status: LinkStatus.SUPERSEDED,
    supersededBy: newLink.id,
    deprecatedAt: new Date().toISOString(),
    deprecatedReason: `Superseded by ${newLink.id}`,
  };
}
