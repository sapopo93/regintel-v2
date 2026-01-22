/**
 * ImpactAssessment Entity (Phase 3: Policy Intelligence)
 *
 * Manages stale Regulation-Policy links when regulations change.
 * Provides non-destructive migration recommendations.
 * IMMUTABLE: Once created, assessments cannot be modified.
 */

import { createHash } from 'node:crypto';
import type {
  TenantId,
  RegulationId,
  PolicyId,
  LinkId,
  ISOTimestamp,
  ContentHash,
  Domain,
} from './types.js';
import type { RegulatoryChangeEvent } from './regulatory-change-event.js';
import type { RegulationPolicyLink } from './regulation-policy-link.js';

/**
 * Migration recommendation for a stale link
 */
export enum MigrationRecommendation {
  KEEP = 'KEEP', // Link still valid, no action needed
  UPDATE = 'UPDATE', // Link needs minor update to point to new section
  SPLIT = 'SPLIT', // Regulation section split, need multiple new links
  MERGE = 'MERGE', // Multiple sections merged, consolidate links
  REMOVE = 'REMOVE', // Regulation section removed, link no longer valid
  REVIEW = 'REVIEW', // Manual review required, unclear mapping
}

/**
 * Assessment of a single link's status after regulatory change
 */
export interface ImpactAssessmentItem {
  // Link being assessed
  linkId: LinkId;
  oldRegulationId: RegulationId;
  oldRegulationSectionId: string;
  newRegulationId: RegulationId;
  policyId: PolicyId;
  policyClauseId: string;

  // Assessment
  recommendation: MigrationRecommendation;
  reasoning: string;
  confidence: number; // 0.0 (low) to 1.0 (high)

  // Suggested new links (for UPDATE/SPLIT)
  suggestedNewLinks?: Array<{
    regulationSectionId: string;
    rationale: string;
  }>;

  // Affected by which section changes
  affectedBySectionIds: string[];
}

/**
 * Overall impact assessment for all links after a regulatory change
 */
export interface ImpactAssessment {
  // Identity
  id: string;
  tenantId: TenantId;
  domain: Domain;

  // Regulatory change being assessed
  changeEventId: string;
  oldRegulationId: RegulationId;
  newRegulationId: RegulationId;

  // Assessment items (one per affected link)
  items: ImpactAssessmentItem[];

  // Summary statistics
  totalLinksAssessed: number;
  keepCount: number;
  updateCount: number;
  splitCount: number;
  mergeCount: number;
  removeCount: number;
  reviewCount: number;

  // Integrity
  assessmentHash: ContentHash; // Deterministic hash for reproducibility

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string; // "SYSTEM" for automated assessments
}

/**
 * Determines migration recommendation for a link based on section changes.
 */
export function determineMigrationRecommendation(params: {
  link: RegulationPolicyLink;
  changeEvent: RegulatoryChangeEvent;
}): Omit<ImpactAssessmentItem, 'linkId' | 'oldRegulationId' | 'newRegulationId' | 'policyId' | 'policyClauseId'> {
  const { link, changeEvent } = params;

  // Find changes affecting this link's section
  const affectingSectionChanges = changeEvent.sectionChanges.filter(
    (sc) => sc.sectionId === link.regulationSectionId
  );

  // No changes to this section
  if (affectingSectionChanges.length === 0) {
    return {
      recommendation: MigrationRecommendation.KEEP,
      reasoning: 'Regulation section unchanged',
      confidence: 1.0,
      affectedBySectionIds: [],
    };
  }

  const change = affectingSectionChanges[0];

  // Section removed
  if (change.changeType === 'REMOVED') {
    return {
      recommendation: MigrationRecommendation.REMOVE,
      reasoning: 'Regulation section removed in new version',
      confidence: 1.0,
      affectedBySectionIds: [change.sectionId],
    };
  }

  // Section added (shouldn't happen for existing links, but handle it)
  if (change.changeType === 'ADDED') {
    return {
      recommendation: MigrationRecommendation.REVIEW,
      reasoning: 'Link references newly added section (unexpected)',
      confidence: 0.5,
      affectedBySectionIds: [change.sectionId],
    };
  }

  // Section modified - assess impact
  if (change.changeType === 'MODIFIED') {
    // Cosmetic changes - keep link
    if (change.classification === 'COSMETIC') {
      return {
        recommendation: MigrationRecommendation.KEEP,
        reasoning: 'Only cosmetic changes (typos, formatting)',
        confidence: 1.0,
        affectedBySectionIds: [change.sectionId],
      };
    }

    // Minor changes - keep link but flag for review
    if (change.classification === 'MINOR') {
      return {
        recommendation: MigrationRecommendation.KEEP,
        reasoning: 'Minor clarifications, link remains valid',
        confidence: 0.9,
        affectedBySectionIds: [change.sectionId],
      };
    }

    // Normative changes - update link with new requirements
    if (change.classification === 'NORMATIVE') {
      return {
        recommendation: MigrationRecommendation.UPDATE,
        reasoning: `Requirement strength changed (delta: ${change.normativityDelta})`,
        confidence: 0.8,
        suggestedNewLinks: [
          {
            regulationSectionId: change.sectionId,
            rationale: 'Updated to reflect new requirement strength',
          },
        ],
        affectedBySectionIds: [change.sectionId],
      };
    }

    // Structural changes - manual review needed
    if (change.classification === 'STRUCTURAL') {
      return {
        recommendation: MigrationRecommendation.REVIEW,
        reasoning: 'Significant structural changes require manual review',
        confidence: 0.4,
        affectedBySectionIds: [change.sectionId],
      };
    }
  }

  // Default: review
  return {
    recommendation: MigrationRecommendation.REVIEW,
    reasoning: 'Unable to determine appropriate action',
    confidence: 0.3,
    affectedBySectionIds: [change.sectionId],
  };
}

/**
 * Creates an impact assessment for all links affected by a regulatory change.
 */
export function createImpactAssessment(params: {
  id: string;
  tenantId: TenantId;
  domain: Domain;
  changeEvent: RegulatoryChangeEvent;
  affectedLinks: RegulationPolicyLink[];
  createdBy: string;
}): ImpactAssessment {
  const items: ImpactAssessmentItem[] = [];

  // Assess each affected link
  for (const link of params.affectedLinks) {
    const recommendation = determineMigrationRecommendation({
      link,
      changeEvent: params.changeEvent,
    });

    items.push({
      linkId: link.id,
      oldRegulationId: params.changeEvent.oldRegulationId,
      oldRegulationSectionId: link.regulationSectionId,
      newRegulationId: params.changeEvent.newRegulationId,
      policyId: link.policyId,
      policyClauseId: link.policyClauseId,
      ...recommendation,
    });
  }

  // Calculate summary statistics
  const keepCount = items.filter((i) => i.recommendation === MigrationRecommendation.KEEP).length;
  const updateCount = items.filter((i) => i.recommendation === MigrationRecommendation.UPDATE).length;
  const splitCount = items.filter((i) => i.recommendation === MigrationRecommendation.SPLIT).length;
  const mergeCount = items.filter((i) => i.recommendation === MigrationRecommendation.MERGE).length;
  const removeCount = items.filter((i) => i.recommendation === MigrationRecommendation.REMOVE).length;
  const reviewCount = items.filter((i) => i.recommendation === MigrationRecommendation.REVIEW).length;

  // Compute deterministic hash
  const assessmentHash = computeAssessmentHash({
    changeEventId: params.changeEvent.id,
    oldRegulationId: params.changeEvent.oldRegulationId,
    newRegulationId: params.changeEvent.newRegulationId,
    items,
  });

  return {
    id: params.id,
    tenantId: params.tenantId,
    domain: params.domain,
    changeEventId: params.changeEvent.id,
    oldRegulationId: params.changeEvent.oldRegulationId,
    newRegulationId: params.changeEvent.newRegulationId,
    items,
    totalLinksAssessed: items.length,
    keepCount,
    updateCount,
    splitCount,
    mergeCount,
    removeCount,
    reviewCount,
    assessmentHash,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  };
}

/**
 * Computes deterministic hash for an impact assessment.
 */
export function computeAssessmentHash(assessment: {
  changeEventId: string;
  oldRegulationId: RegulationId;
  newRegulationId: RegulationId;
  items: ImpactAssessmentItem[];
}): ContentHash {
  const canonical = {
    changeEventId: assessment.changeEventId,
    oldRegulationId: assessment.oldRegulationId,
    newRegulationId: assessment.newRegulationId,
    items: assessment.items.map((item) => ({
      linkId: item.linkId,
      recommendation: item.recommendation,
      confidence: item.confidence,
      affectedBySectionIds: item.affectedBySectionIds.sort(),
    })).sort((a, b) => a.linkId.localeCompare(b.linkId)),
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Verifies assessment integrity.
 */
export function verifyAssessmentIntegrity(assessment: ImpactAssessment): boolean {
  const expectedHash = computeAssessmentHash({
    changeEventId: assessment.changeEventId,
    oldRegulationId: assessment.oldRegulationId,
    newRegulationId: assessment.newRegulationId,
    items: assessment.items,
  });

  return assessment.assessmentHash === expectedHash;
}
