/**
 * Policy Entity (Phase 1: The Spine)
 *
 * Represents provider policies, versioned at clause level.
 * IMMUTABLE: Once created, policies cannot be modified. Updates create new versions.
 */

import { createHash } from 'node:crypto';
import {
  Domain,
  type TenantId,
  type PolicyId,
  type ISOTimestamp,
  type ContentHash,
  type VersionNumber,
} from './types.js';

export interface PolicyClause {
  clauseId: string; // e.g., "1.2.3"
  title: string;
  content: string;
  mandatory: boolean; // true if clause is required by regulation
}

export interface Policy {
  // Identity
  id: PolicyId;
  tenantId: TenantId;
  domain: Domain;

  // Versioning
  version: VersionNumber;
  effectiveDate: ISOTimestamp;
  supersedes: PolicyId | null; // Previous version ID

  // Content
  title: string;
  clauses: PolicyClause[];

  // Integrity
  contentHash: ContentHash; // SHA-256 of canonical representation

  // Metadata
  createdAt: ISOTimestamp;
  createdBy: string;
  approvedBy?: string; // Policy approver (e.g., Registered Manager)
  approvedAt?: ISOTimestamp;
}

/**
 * Computes a deterministic content hash for a policy.
 * Used for integrity verification and change detection.
 */
export function computePolicyContentHash(policy: {
  title: string;
  clauses: PolicyClause[];
  effectiveDate: ISOTimestamp;
}): ContentHash {
  // Canonical representation: sorted clauses, deterministic JSON
  const canonical = {
    title: policy.title,
    effectiveDate: policy.effectiveDate,
    clauses: policy.clauses.map((c) => ({
      clauseId: c.clauseId,
      title: c.title,
      content: c.content,
      mandatory: c.mandatory,
    })).sort((a, b) => a.clauseId.localeCompare(b.clauseId)),
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new policy instance.
 * Automatically computes content hash.
 */
export function createPolicy(input: {
  id: PolicyId;
  tenantId: TenantId;
  domain: Domain;
  version: VersionNumber;
  effectiveDate: ISOTimestamp;
  supersedes: PolicyId | null;
  title: string;
  clauses: PolicyClause[];
  createdBy: string;
  approvedBy?: string;
  approvedAt?: ISOTimestamp;
}): Policy {
  const contentHash = computePolicyContentHash({
    title: input.title,
    clauses: input.clauses,
    effectiveDate: input.effectiveDate,
  });

  return {
    id: input.id,
    tenantId: input.tenantId,
    domain: input.domain,
    version: input.version,
    effectiveDate: input.effectiveDate,
    supersedes: input.supersedes,
    title: input.title,
    clauses: input.clauses,
    contentHash,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
  };
}

/**
 * Verifies that a policy's content hash matches its content.
 */
export function verifyPolicyIntegrity(policy: Policy): boolean {
  const expectedHash = computePolicyContentHash({
    title: policy.title,
    clauses: policy.clauses,
    effectiveDate: policy.effectiveDate,
  });

  return policy.contentHash === expectedHash;
}

/**
 * Creates a new version of a policy.
 * The original policy is immutable and remains unchanged.
 */
export function createPolicyVersion(
  original: Policy,
  updates: {
    version: VersionNumber;
    effectiveDate: ISOTimestamp;
    title?: string;
    clauses?: PolicyClause[];
    createdBy: string;
    approvedBy?: string;
    approvedAt?: ISOTimestamp;
  }
): Policy {
  return createPolicy({
    id: `${original.id}_v${updates.version}`, // New ID for new version
    tenantId: original.tenantId,
    domain: original.domain,
    version: updates.version,
    effectiveDate: updates.effectiveDate,
    supersedes: original.id,
    title: updates.title ?? original.title,
    clauses: updates.clauses ?? original.clauses,
    createdBy: updates.createdBy,
    approvedBy: updates.approvedBy,
    approvedAt: updates.approvedAt,
  });
}
