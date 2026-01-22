/**
 * Regulation Entity (Phase 1: The Spine)
 *
 * Represents versioned, section-level regulatory text.
 * IMMUTABLE: Once created, regulations cannot be modified. Updates create new versions.
 */

import { createHash } from 'node:crypto';
import {
  Domain,
  type TenantId,
  type RegulationId,
  type ISOTimestamp,
  type ContentHash,
  type VersionNumber,
} from './types.js';

export interface RegulationSection {
  sectionId: string; // e.g., "8.1.2"
  title: string;
  content: string;
  normative: boolean; // true if section contains requirements (must/shall)
}

export interface Regulation {
  // Identity
  id: RegulationId;
  tenantId: TenantId;
  domain: Domain;

  // Versioning
  version: VersionNumber;
  effectiveDate: ISOTimestamp;
  supersedes: RegulationId | null; // Previous version ID

  // Content
  title: string;
  sections: RegulationSection[];

  // Integrity
  contentHash: ContentHash; // SHA-256 of canonical representation

  // Metadata
  createdAt: ISOTimestamp;
  createdBy: string;
}

/**
 * Computes a deterministic content hash for a regulation.
 * Used for integrity verification and change detection.
 */
export function computeRegulationContentHash(reg: {
  title: string;
  sections: RegulationSection[];
  effectiveDate: ISOTimestamp;
}): ContentHash {
  // Canonical representation: sorted sections, deterministic JSON
  const canonical = {
    title: reg.title,
    effectiveDate: reg.effectiveDate,
    sections: reg.sections.map((s) => ({
      sectionId: s.sectionId,
      title: s.title,
      content: s.content,
      normative: s.normative,
    })).sort((a, b) => a.sectionId.localeCompare(b.sectionId)),
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new regulation instance.
 * Automatically computes content hash.
 */
export function createRegulation(input: {
  id: RegulationId;
  tenantId: TenantId;
  domain: Domain;
  version: VersionNumber;
  effectiveDate: ISOTimestamp;
  supersedes: RegulationId | null;
  title: string;
  sections: RegulationSection[];
  createdBy: string;
}): Regulation {
  const contentHash = computeRegulationContentHash({
    title: input.title,
    sections: input.sections,
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
    sections: input.sections,
    contentHash,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

/**
 * Verifies that a regulation's content hash matches its content.
 */
export function verifyRegulationIntegrity(reg: Regulation): boolean {
  const expectedHash = computeRegulationContentHash({
    title: reg.title,
    sections: reg.sections,
    effectiveDate: reg.effectiveDate,
  });

  return reg.contentHash === expectedHash;
}

/**
 * Creates a new version of a regulation.
 * The original regulation is immutable and remains unchanged.
 */
export function createRegulationVersion(
  original: Regulation,
  updates: {
    version: VersionNumber;
    effectiveDate: ISOTimestamp;
    title?: string;
    sections?: RegulationSection[];
    createdBy: string;
  }
): Regulation {
  return createRegulation({
    id: `${original.id}_v${updates.version}`, // New ID for new version
    tenantId: original.tenantId,
    domain: original.domain,
    version: updates.version,
    effectiveDate: updates.effectiveDate,
    supersedes: original.id,
    title: updates.title ?? original.title,
    sections: updates.sections ?? original.sections,
    createdBy: updates.createdBy,
  });
}
