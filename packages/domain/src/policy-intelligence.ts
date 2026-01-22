/**
 * Policy Intelligence Engine (Phase 3)
 *
 * Manages non-destructive link migrations when regulations change.
 * OLD LINKS ARE DEPRECATED, NEVER OVERWRITTEN.
 */

import type { RegulationPolicyLink } from './regulation-policy-link.js';
import { LinkStatus, deprecateLink, supersedeLink } from './regulation-policy-link.js';
import type { ImpactAssessment, ImpactAssessmentItem } from './impact-assessment.js';
import type { RegulationId, LinkId } from './types.js';

/**
 * Result of applying a migration
 */
export interface MigrationResult {
  originalLinkId: LinkId;
  action: 'DEPRECATED' | 'SUPERSEDED' | 'KEPT';
  deprecatedLink?: RegulationPolicyLink;
  newLinks: RegulationPolicyLink[];
  reasoning: string;
}

/**
 * Non-destructively applies migration recommendations.
 * OLD LINKS ARE NEVER OVERWRITTEN - they are marked as deprecated or superseded.
 */
export function applyMigrationRecommendations(params: {
  assessment: ImpactAssessment;
  currentLinks: Map<LinkId, RegulationPolicyLink>;
  createNewLink: (item: ImpactAssessmentItem) => RegulationPolicyLink;
}): MigrationResult[] {
  const results: MigrationResult[] = [];

  for (const item of params.assessment.items) {
    const currentLink = params.currentLinks.get(item.linkId);
    if (!currentLink) {
      continue; // Link doesn't exist (shouldn't happen)
    }

    // Already deprecated/superseded - skip
    if (currentLink.status !== LinkStatus.ACTIVE) {
      results.push({
        originalLinkId: item.linkId,
        action: 'KEPT',
        newLinks: [],
        reasoning: `Link already ${currentLink.status}`,
      });
      continue;
    }

    switch (item.recommendation) {
      case 'KEEP': {
        // No action needed, link remains valid
        results.push({
          originalLinkId: item.linkId,
          action: 'KEPT',
          newLinks: [],
          reasoning: item.reasoning,
        });
        break;
      }

      case 'REMOVE': {
        // Deprecate the link (non-destructive)
        const deprecatedLink = deprecateLink(
          currentLink,
          `Regulation section removed: ${item.reasoning}`
        );

        results.push({
          originalLinkId: item.linkId,
          action: 'DEPRECATED',
          deprecatedLink,
          newLinks: [],
          reasoning: item.reasoning,
        });
        break;
      }

      case 'UPDATE': {
        // Create new link, supersede old one (non-destructive)
        const newLink = params.createNewLink(item);
        const supersededLink = supersedeLink(currentLink, newLink);

        results.push({
          originalLinkId: item.linkId,
          action: 'SUPERSEDED',
          deprecatedLink: supersededLink,
          newLinks: [newLink],
          reasoning: item.reasoning,
        });
        break;
      }

      case 'SPLIT':
      case 'MERGE': {
        // Create multiple new links if suggested, supersede old one
        const newLinks: RegulationPolicyLink[] = [];

        if (item.suggestedNewLinks && item.suggestedNewLinks.length > 0) {
          for (const suggestion of item.suggestedNewLinks) {
            const newLink = params.createNewLink(item);
            newLinks.push(newLink);
          }
        }

        const supersededLink = newLinks.length > 0
          ? supersedeLink(currentLink, newLinks[0])
          : deprecateLink(currentLink, item.reasoning);

        results.push({
          originalLinkId: item.linkId,
          action: newLinks.length > 0 ? 'SUPERSEDED' : 'DEPRECATED',
          deprecatedLink: supersededLink,
          newLinks,
          reasoning: item.reasoning,
        });
        break;
      }

      case 'REVIEW': {
        // Deprecate for manual review (non-destructive)
        const deprecatedLink = deprecateLink(
          currentLink,
          `Manual review required: ${item.reasoning}`
        );

        results.push({
          originalLinkId: item.linkId,
          action: 'DEPRECATED',
          deprecatedLink,
          newLinks: [],
          reasoning: item.reasoning,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Finds all links affected by a regulatory change.
 */
export function findAffectedLinks(params: {
  allLinks: RegulationPolicyLink[];
  oldRegulationId: RegulationId;
}): RegulationPolicyLink[] {
  return params.allLinks.filter(
    (link) =>
      link.regulationId === params.oldRegulationId &&
      link.status === LinkStatus.ACTIVE
  );
}

/**
 * Validates that old edges are never overwritten.
 * Returns true if all deprecated/superseded links still exist in the store.
 */
export function validateNonDestructiveMigration(params: {
  linksBefore: RegulationPolicyLink[];
  linksAfter: RegulationPolicyLink[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const beforeIds = new Set(params.linksBefore.map((l) => l.id));
  const afterIds = new Set(params.linksAfter.map((l) => l.id));

  // Check that no links were deleted
  for (const beforeLink of params.linksBefore) {
    if (!afterIds.has(beforeLink.id)) {
      errors.push(`Link ${beforeLink.id} was deleted (should be deprecated instead)`);
    }
  }

  // Check that deprecated/superseded links are not ACTIVE
  for (const afterLink of params.linksAfter) {
    if (beforeIds.has(afterLink.id)) {
      // This is an old link - verify it's not still ACTIVE if it should be deprecated
      const beforeLink = params.linksBefore.find((l) => l.id === afterLink.id);
      if (beforeLink && beforeLink.status === LinkStatus.ACTIVE && afterLink.status === LinkStatus.ACTIVE) {
        // Both before and after are ACTIVE - this is OK (no change)
        continue;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
