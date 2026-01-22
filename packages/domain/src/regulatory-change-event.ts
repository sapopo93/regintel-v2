/**
 * RegulatoryChangeEvent Entity (Phase 2: Regulatory Drift Engine)
 *
 * Represents detected changes in regulatory text with classification.
 * IMMUTABLE: Once created, change events cannot be modified.
 * Used to detect meaningful regulatory drift without alert fatigue.
 */

import { createHash } from 'node:crypto';
import type {
  TenantId,
  RegulationId,
  ISOTimestamp,
  ContentHash,
  Domain,
} from './types.js';

/**
 * Change classification based on impact to compliance requirements
 */
export enum ChangeClassification {
  COSMETIC = 'COSMETIC', // Typos, formatting, clarifications - no compliance impact
  MINOR = 'MINOR', // Small wording changes with minimal impact
  NORMATIVE = 'NORMATIVE', // Changes to requirements (should → must, new obligations)
  STRUCTURAL = 'STRUCTURAL', // Section reorganization, major restructuring
}

/**
 * Type of change detected in a section
 */
export enum ChangeType {
  ADDED = 'ADDED', // New section added
  REMOVED = 'REMOVED', // Section removed
  MODIFIED = 'MODIFIED', // Section content changed
  MOVED = 'MOVED', // Section moved to different location
}

/**
 * Normativity indicators found in text
 */
export interface NormativityIndicators {
  mustCount: number; // "must", "shall", "required"
  shouldCount: number; // "should", "recommended"
  mayCount: number; // "may", "can", "optional"
  prohibitionCount: number; // "must not", "shall not", "prohibited"
}

/**
 * Section-level change detection
 */
export interface SectionChange {
  sectionId: string;
  changeType: ChangeType;
  oldContent?: string; // For MODIFIED/REMOVED
  newContent?: string; // For MODIFIED/ADDED
  oldNormativity?: NormativityIndicators;
  newNormativity?: NormativityIndicators;
  normativityDelta: number; // Change in requirement strength (-1 to +1)
  classification: ChangeClassification;
  reasoning: string; // Why this classification was chosen
}

/**
 * Immutable regulatory change event
 */
export interface RegulatoryChangeEvent {
  // Identity
  id: string;
  tenantId: TenantId;
  domain: Domain;

  // Regulation versions being compared
  oldRegulationId: RegulationId;
  newRegulationId: RegulationId;

  // Change detection
  detectedAt: ISOTimestamp;
  sectionChanges: SectionChange[];

  // Overall classification (most severe change)
  overallClassification: ChangeClassification;

  // Integrity
  changeHash: ContentHash; // Deterministic hash of change detection

  // Metadata
  createdAt: ISOTimestamp;
  createdBy: string; // "SYSTEM" for automated detection
}

/**
 * Computes normativity indicators from text.
 * Counts modal verbs and obligation language.
 */
export function computeNormativityIndicators(text: string): NormativityIndicators {
  const lowerText = text.toLowerCase();

  // Count "must" variants
  const mustCount =
    (lowerText.match(/\bmust\b/g) || []).length +
    (lowerText.match(/\bshall\b/g) || []).length +
    (lowerText.match(/\brequired\b/g) || []).length;

  // Count "should" variants
  const shouldCount =
    (lowerText.match(/\bshould\b/g) || []).length +
    (lowerText.match(/\brecommended\b/g) || []).length;

  // Count "may" variants
  const mayCount =
    (lowerText.match(/\bmay\b/g) || []).length +
    (lowerText.match(/\bcan\b/g) || []).length +
    (lowerText.match(/\boptional\b/g) || []).length;

  // Count prohibitions
  const prohibitionCount =
    (lowerText.match(/\bmust\s+not\b/g) || []).length +
    (lowerText.match(/\bshall\s+not\b/g) || []).length +
    (lowerText.match(/\bprohibited\b/g) || []).length;

  return {
    mustCount,
    shouldCount,
    mayCount,
    prohibitionCount,
  };
}

/**
 * Computes normativity delta score between two texts.
 * Returns: -1 (weaker), 0 (same), +1 (stronger)
 */
export function computeNormativityDelta(
  oldText: string,
  newText: string
): number {
  const oldIndicators = computeNormativityIndicators(oldText);
  const newIndicators = computeNormativityIndicators(newText);

  // Calculate strength scores
  const oldStrength =
    oldIndicators.mustCount * 3 +
    oldIndicators.prohibitionCount * 3 +
    oldIndicators.shouldCount * 2 +
    oldIndicators.mayCount * 1;

  const newStrength =
    newIndicators.mustCount * 3 +
    newIndicators.prohibitionCount * 3 +
    newIndicators.shouldCount * 2 +
    newIndicators.mayCount * 1;

  // Normalize to -1, 0, +1
  if (newStrength > oldStrength) return 1; // Stronger requirements
  if (newStrength < oldStrength) return -1; // Weaker requirements
  return 0; // No change in strength
}

/**
 * Classifies a section change based on normativity and content.
 */
export function classifySectionChange(change: {
  oldContent?: string;
  newContent?: string;
  normativityDelta: number;
}): { classification: ChangeClassification; reasoning: string } {
  // If no content, structural change
  if (!change.oldContent && !change.newContent) {
    return {
      classification: ChangeClassification.STRUCTURAL,
      reasoning: 'Section added or removed',
    };
  }

  const oldContent = change.oldContent || '';
  const newContent = change.newContent || '';

  // Check for normative change (modal verb change)
  if (change.normativityDelta !== 0) {
    return {
      classification: ChangeClassification.NORMATIVE,
      reasoning:
        change.normativityDelta > 0
          ? 'Requirements strengthened (e.g., should → must)'
          : 'Requirements weakened (e.g., must → should)',
    };
  }

  // Calculate text similarity (Levenshtein distance)
  const similarity = calculateSimilarity(oldContent, newContent);

  // Very similar text (>90%) = cosmetic
  if (similarity > 0.9) {
    return {
      classification: ChangeClassification.COSMETIC,
      reasoning: 'Minor wording changes, typos, or formatting',
    };
  }

  // Moderate similarity (75-90%) = minor
  if (similarity > 0.75) {
    return {
      classification: ChangeClassification.MINOR,
      reasoning: 'Clarifications or minor wording updates',
    };
  }

  // Significant changes but no normativity change = structural
  return {
    classification: ChangeClassification.STRUCTURAL,
    reasoning: 'Significant content restructuring',
  };
}

/**
 * Calculates similarity using normalized edit distance.
 * Returns 0.0 (completely different) to 1.0 (identical).
 * Uses simplified Levenshtein distance.
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  // Simplified Levenshtein distance calculation
  const len1 = str1.length;
  const len2 = str2.length;

  // Create distance matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);

  // Convert to similarity: 1.0 - (distance / maxLength)
  return 1.0 - distance / maxLen;
}

/**
 * Computes deterministic change hash for a regulatory change event.
 */
export function computeChangeHash(event: {
  oldRegulationId: RegulationId;
  newRegulationId: RegulationId;
  sectionChanges: SectionChange[];
}): ContentHash {
  const canonical = {
    oldRegulationId: event.oldRegulationId,
    newRegulationId: event.newRegulationId,
    sectionChanges: event.sectionChanges.map((sc) => ({
      sectionId: sc.sectionId,
      changeType: sc.changeType,
      oldContent: sc.oldContent,
      newContent: sc.newContent,
      classification: sc.classification,
      normativityDelta: sc.normativityDelta,
    })).sort((a, b) => a.sectionId.localeCompare(b.sectionId)),
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new regulatory change event.
 */
export function createRegulatoryChangeEvent(input: {
  id: string;
  tenantId: TenantId;
  domain: Domain;
  oldRegulationId: RegulationId;
  newRegulationId: RegulationId;
  sectionChanges: SectionChange[];
  createdBy: string;
}): RegulatoryChangeEvent {
  // Determine overall classification (most severe)
  const classificationSeverity = {
    [ChangeClassification.COSMETIC]: 0,
    [ChangeClassification.MINOR]: 1,
    [ChangeClassification.STRUCTURAL]: 2,
    [ChangeClassification.NORMATIVE]: 3,
  };

  const overallClassification = input.sectionChanges.reduce(
    (mostSevere, change) => {
      return classificationSeverity[change.classification] >
        classificationSeverity[mostSevere]
        ? change.classification
        : mostSevere;
    },
    ChangeClassification.COSMETIC
  );

  const changeHash = computeChangeHash({
    oldRegulationId: input.oldRegulationId,
    newRegulationId: input.newRegulationId,
    sectionChanges: input.sectionChanges,
  });

  return {
    id: input.id,
    tenantId: input.tenantId,
    domain: input.domain,
    oldRegulationId: input.oldRegulationId,
    newRegulationId: input.newRegulationId,
    detectedAt: new Date().toISOString(),
    sectionChanges: input.sectionChanges,
    overallClassification,
    changeHash,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

/**
 * Verifies change event integrity.
 */
export function verifyChangeEventIntegrity(event: RegulatoryChangeEvent): boolean {
  const expectedHash = computeChangeHash({
    oldRegulationId: event.oldRegulationId,
    newRegulationId: event.newRegulationId,
    sectionChanges: event.sectionChanges,
  });

  return event.changeHash === expectedHash;
}
