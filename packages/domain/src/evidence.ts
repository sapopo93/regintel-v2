/**
 * Evidence Entity (Phase 1: The Spine)
 *
 * Two-layer model for evidence management:
 * - EvidenceBlob: Content-addressed storage (immutable, deduplicated)
 * - EvidenceRecord: Metadata and provenance (references blob by hash)
 *
 * IMMUTABLE: Both blobs and records cannot be modified after creation.
 * Deletion is access revocation only - hash + metadata retained for audit.
 */

import { createHash } from 'node:crypto';
import type {
  TenantId,
  EvidenceId,
  ISOTimestamp,
  ContentHash,
  FindingId,
  PolicyId,
} from './types.js';

/**
 * EvidenceBlob - Content-addressed storage layer
 * Immutable, deduplicated by SHA-256 hash
 */
export interface EvidenceBlob {
  // Content addressing
  contentHash: ContentHash; // SHA-256 of file content (primary key)

  // Blob metadata
  sizeBytes: number;
  mimeType: string;

  // Storage reference
  storageUrl: string; // e.g., s3://bucket/hash

  // Security
  scanned: boolean;
  quarantined: boolean;
  scanResult?: string;

  // Lifecycle
  uploadedAt: ISOTimestamp;
}

/**
 * EvidenceRecord - Metadata and provenance layer
 * References one or more blobs, provides business context
 */
export interface EvidenceRecord {
  // Identity
  id: EvidenceId;
  tenantId: TenantId;

  // Content reference
  blobHashes: ContentHash[]; // One or more blobs (e.g., PDF + signature)
  primaryBlobHash: ContentHash; // Main content blob

  // Business context
  title: string;
  description?: string;
  evidenceType: string; // e.g., "policy_document", "training_certificate", "photo"

  // References (what this evidence supports)
  supportsFindingIds: FindingId[]; // Findings this evidence addresses
  supportsPolicyIds: PolicyId[]; // Policies this evidence demonstrates

  // Provenance
  collectedAt: ISOTimestamp; // When was this evidence created/captured
  collectedBy: string;

  // Access control
  accessRevoked: boolean;
  revokedAt?: ISOTimestamp;
  revokedBy?: string;
  revokedReason?: string;

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string;
}

/**
 * Computes content hash for a blob (SHA-256).
 */
export function computeBlobHash(content: Buffer | Uint8Array): ContentHash {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Creates a new evidence blob.
 */
export function createEvidenceBlob(input: {
  content: Buffer | Uint8Array;
  mimeType: string;
  storageUrl: string;
  scanned?: boolean;
  quarantined?: boolean;
  scanResult?: string;
}): EvidenceBlob {
  const contentHash = computeBlobHash(input.content);

  return {
    contentHash,
    sizeBytes: input.content.byteLength,
    mimeType: input.mimeType,
    storageUrl: input.storageUrl,
    scanned: input.scanned ?? false,
    quarantined: input.quarantined ?? false,
    scanResult: input.scanResult,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Creates a new evidence record.
 */
export function createEvidenceRecord(input: {
  id: EvidenceId;
  tenantId: TenantId;
  blobHashes: ContentHash[];
  primaryBlobHash: ContentHash;
  title: string;
  description?: string;
  evidenceType: string;
  supportsFindingIds?: FindingId[];
  supportsPolicyIds?: PolicyId[];
  collectedAt: ISOTimestamp;
  collectedBy: string;
  createdBy: string;
}): EvidenceRecord {
  if (!input.blobHashes.includes(input.primaryBlobHash)) {
    throw new Error('Primary blob hash must be in blobHashes array');
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    blobHashes: input.blobHashes,
    primaryBlobHash: input.primaryBlobHash,
    title: input.title,
    description: input.description,
    evidenceType: input.evidenceType,
    supportsFindingIds: input.supportsFindingIds ?? [],
    supportsPolicyIds: input.supportsPolicyIds ?? [],
    collectedAt: input.collectedAt,
    collectedBy: input.collectedBy,
    accessRevoked: false,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

/**
 * Revokes access to evidence (non-destructive).
 * Blob and record remain for audit, but access is denied.
 */
export function revokeEvidenceAccess(
  record: EvidenceRecord,
  revokedBy: string,
  reason: string
): EvidenceRecord {
  if (record.accessRevoked) {
    throw new Error(`Evidence ${record.id} access is already revoked`);
  }

  return {
    ...record,
    accessRevoked: true,
    revokedAt: new Date().toISOString(),
    revokedBy,
    revokedReason: reason,
  };
}

/**
 * Checks if evidence can be referenced (not quarantined).
 */
export function canReferenceEvidence(blob: EvidenceBlob): boolean {
  return !blob.quarantined;
}

/**
 * Validates that all blobs referenced by a record are not quarantined.
 */
export function validateEvidenceReferences(
  record: EvidenceRecord,
  blobs: Map<ContentHash, EvidenceBlob>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const hash of record.blobHashes) {
    const blob = blobs.get(hash);

    if (!blob) {
      errors.push(`Blob ${hash} not found`);
      continue;
    }

    if (blob.quarantined) {
      errors.push(`Blob ${hash} is quarantined and cannot be referenced`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
