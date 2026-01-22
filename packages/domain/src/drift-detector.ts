/**
 * Drift Detector (Phase 2: Regulatory Drift Engine)
 *
 * Detects meaningful changes between regulation versions.
 * Performs section-level diffing and normativity scoring.
 */

import type { Regulation, RegulationSection } from './regulation.js';
import {
  createRegulatoryChangeEvent,
  classifySectionChange,
  computeNormativityDelta,
  computeNormativityIndicators,
  type RegulatoryChangeEvent,
  type SectionChange,
  ChangeType,
} from './regulatory-change-event.js';

/**
 * Detects changes between two regulation versions.
 * Returns a RegulatoryChangeEvent describing all section changes.
 */
export function detectRegulatoryDrift(
  oldRegulation: Regulation,
  newRegulation: Regulation
): RegulatoryChangeEvent {
  // Validate same regulation lineage
  if (oldRegulation.domain !== newRegulation.domain) {
    throw new Error('Cannot compare regulations from different domains');
  }

  if (oldRegulation.tenantId !== newRegulation.tenantId) {
    throw new Error('Cannot compare regulations from different tenants');
  }

  // Build section maps for efficient lookup
  const oldSections = new Map<string, RegulationSection>();
  const newSections = new Map<string, RegulationSection>();

  for (const section of oldRegulation.sections) {
    oldSections.set(section.sectionId, section);
  }

  for (const section of newRegulation.sections) {
    newSections.set(section.sectionId, section);
  }

  const sectionChanges: SectionChange[] = [];

  // Detect removed sections
  for (const [sectionId, oldSection] of oldSections) {
    if (!newSections.has(sectionId)) {
      const classification = classifySectionChange({
        oldContent: oldSection.content,
        newContent: undefined,
        normativityDelta: oldSection.normative ? -1 : 0,
      });

      sectionChanges.push({
        sectionId,
        changeType: ChangeType.REMOVED,
        oldContent: oldSection.content,
        newContent: undefined,
        oldNormativity: oldSection.normative
          ? computeNormativityIndicators(oldSection.content)
          : undefined,
        newNormativity: undefined,
        normativityDelta: oldSection.normative ? -1 : 0,
        classification: classification.classification,
        reasoning: classification.reasoning,
      });
    }
  }

  // Detect added and modified sections
  for (const [sectionId, newSection] of newSections) {
    const oldSection = oldSections.get(sectionId);

    if (!oldSection) {
      // Added section
      const classification = classifySectionChange({
        oldContent: undefined,
        newContent: newSection.content,
        normativityDelta: newSection.normative ? 1 : 0,
      });

      sectionChanges.push({
        sectionId,
        changeType: ChangeType.ADDED,
        oldContent: undefined,
        newContent: newSection.content,
        oldNormativity: undefined,
        newNormativity: newSection.normative
          ? computeNormativityIndicators(newSection.content)
          : undefined,
        normativityDelta: newSection.normative ? 1 : 0,
        classification: classification.classification,
        reasoning: classification.reasoning,
      });
    } else if (oldSection.content !== newSection.content) {
      // Modified section
      const normativityDelta = computeNormativityDelta(
        oldSection.content,
        newSection.content
      );

      const classification = classifySectionChange({
        oldContent: oldSection.content,
        newContent: newSection.content,
        normativityDelta,
      });

      sectionChanges.push({
        sectionId,
        changeType: ChangeType.MODIFIED,
        oldContent: oldSection.content,
        newContent: newSection.content,
        oldNormativity: computeNormativityIndicators(oldSection.content),
        newNormativity: computeNormativityIndicators(newSection.content),
        normativityDelta,
        classification: classification.classification,
        reasoning: classification.reasoning,
      });
    }
    // If content is identical, no change to report
  }

  // Create change event
  return createRegulatoryChangeEvent({
    id: `change_${oldRegulation.id}_to_${newRegulation.id}`,
    tenantId: oldRegulation.tenantId,
    domain: oldRegulation.domain,
    oldRegulationId: oldRegulation.id,
    newRegulationId: newRegulation.id,
    sectionChanges,
    createdBy: 'SYSTEM',
  });
}

/**
 * Filters change events to only include meaningful changes.
 * Excludes COSMETIC changes to reduce alert fatigue.
 */
export function filterMeaningfulChanges(
  event: RegulatoryChangeEvent
): SectionChange[] {
  return event.sectionChanges.filter(
    (change) => change.classification !== 'COSMETIC'
  );
}

/**
 * Gets the most severe change in an event.
 */
export function getMostSevereChange(
  event: RegulatoryChangeEvent
): SectionChange | null {
  if (event.sectionChanges.length === 0) return null;

  const severityOrder = ['COSMETIC', 'MINOR', 'STRUCTURAL', 'NORMATIVE'];

  return event.sectionChanges.reduce((mostSevere, change) => {
    const currentSeverity = severityOrder.indexOf(change.classification);
    const mostSevereSeverity = severityOrder.indexOf(mostSevere.classification);

    return currentSeverity > mostSevereSeverity ? change : mostSevere;
  });
}
