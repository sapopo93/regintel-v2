/**
 * Constitutional UI Validators
 *
 * Enforces the UI constitution: every view must answer
 * version, hash, time, and domain. If it can't, it doesn't render.
 */

import {
  ORIGIN_TYPES,
  ORIGIN_LABELS,
  REPORTING_DOMAINS,
  DISCLOSURE_LAYERS,
  LAYER_ACTIONS,
  type DisclosureLayer,
} from './constants';

/**
 * Error thrown when UI constitutional requirements are violated
 */
export class ConstitutionalViolationError extends Error {
  constructor(
    message: string,
    public missingRequirements: string[]
  ) {
    super(message);
    this.name = 'ConstitutionalViolationError';
  }
}

/**
 * Props required for constitutional compliance
 */
export interface ConstitutionalProps {
  topicCatalogVersion?: string;
  topicCatalogHash?: string;
  prsLogicVersion?: string;
  prsLogicHash?: string;
  snapshotTimestamp?: string;
  domain?: string;
}

/**
 * Result of constitutional validation
 */
export interface ConstitutionalValidationResult {
  valid: boolean;
  hasVersion: boolean;
  hasHash: boolean;
  hasTimestamp: boolean;
  hasDomain: boolean;
  missingRequirements: string[];
}

/**
 * Validates that all constitutional requirements are met
 *
 * Every view must render: version, hash, timestamp, domain.
 * If any are missing, the view should not render.
 */
export function validateConstitutionalRequirements(
  props: ConstitutionalProps,
  options?: { strict?: boolean }
): ConstitutionalValidationResult {
  const missing: string[] = [];

  const hasVersion = !!(props.topicCatalogVersion && props.prsLogicVersion);
  const hasHash = !!(
    props.topicCatalogHash &&
    props.topicCatalogHash.length > 0 &&
    props.prsLogicHash &&
    props.prsLogicHash.length > 0
  );
  const hasTimestamp = !!props.snapshotTimestamp;
  const hasDomain = !!props.domain;

  if (!hasVersion) missing.push('version');
  if (!hasHash) missing.push('hash');
  if (!hasTimestamp) missing.push('timestamp');
  if (!hasDomain) missing.push('domain');

  if (options?.strict && missing.length > 0) {
    throw new ConstitutionalViolationError(
      `Constitutional UI violation: missing ${missing.join(', ')}`,
      missing
    );
  }

  return {
    valid: missing.length === 0,
    hasVersion,
    hasHash,
    hasTimestamp,
    hasDomain,
    missingRequirements: missing,
  };
}

/**
 * Finding display properties
 */
export interface FindingDisplayProps {
  id: string;
  origin: string;
  reportingDomain: string;
}

/**
 * Validates that a finding can be safely displayed
 *
 * CRITICAL: Mock findings in regulatory history is a contamination error.
 * This should never happen if backend is correct, but UI enforces as defense.
 */
export function validateFindingForDisplay(finding: FindingDisplayProps): void {
  // Mock contamination check: SYSTEM_MOCK should NEVER be in REGULATORY_HISTORY
  if (
    finding.origin === ORIGIN_TYPES.SYSTEM_MOCK &&
    finding.reportingDomain === REPORTING_DOMAINS.REGULATORY_HISTORY
  ) {
    throw new Error(
      `Mock contamination detected: Finding ${finding.id} has origin=SYSTEM_MOCK ` +
        `in reportingDomain=REGULATORY_HISTORY. This violates regulatory/mock separation.`
    );
  }
}

/**
 * Simulation frame style properties
 */
export interface SimulationFrameStyles {
  borderColor: string;
  borderWidth: string;
}

/**
 * Gets simulation frame styles for mock inspection screens
 *
 * Returns styles only for mock content, null for regulatory content.
 */
export function getSimulationFrameStyles(props: {
  origin?: string;
  reportingDomain?: string;
}): SimulationFrameStyles | null {
  if (
    props.origin === ORIGIN_TYPES.SYSTEM_MOCK ||
    props.reportingDomain === REPORTING_DOMAINS.MOCK_SIMULATION
  ) {
    return {
      borderColor: 'var(--color-simulation)',
      borderWidth: '4px',
    };
  }

  return null;
}

/**
 * Gets the simulation watermark text if applicable
 */
export function getSimulationWatermark(props: {
  origin?: string;
  reportingDomain?: string;
}): string | null {
  if (
    props.origin === ORIGIN_TYPES.SYSTEM_MOCK ||
    props.reportingDomain === REPORTING_DOMAINS.MOCK_SIMULATION
  ) {
    return 'SIMULATION — NOT REGULATORY HISTORY';
  }

  return null;
}

/**
 * Origin badge display properties
 */
export interface OriginBadge {
  text: string;
  variant: 'simulation' | 'official' | 'self';
}

/**
 * Gets the origin badge for a finding
 */
export function getOriginBadge(finding: { origin: string }): OriginBadge {
  switch (finding.origin) {
    case ORIGIN_TYPES.SYSTEM_MOCK:
      return { text: ORIGIN_LABELS.SYSTEM_MOCK, variant: 'simulation' };
    case ORIGIN_TYPES.ACTUAL_INSPECTION:
      return { text: ORIGIN_LABELS.ACTUAL_INSPECTION, variant: 'official' };
    case ORIGIN_TYPES.SELF_IDENTIFIED:
      return { text: ORIGIN_LABELS.SELF_IDENTIFIED, variant: 'self' };
    default:
      return { text: finding.origin, variant: 'official' };
  }
}

/**
 * Gets the disclosure layers for a content type
 */
export function getDisclosureLayers(
  _type: 'finding' | 'evidence' | 'topic'
): readonly DisclosureLayer[] {
  return DISCLOSURE_LAYERS;
}

/**
 * Gets the available actions for a disclosure layer
 */
export function getLayerActions(layer: DisclosureLayer): readonly string[] {
  return LAYER_ACTIONS[layer];
}

/**
 * Allowed UI colors - strictly controlled
 */
export interface AllowedUIColors {
  simulation: string;
  verified: string;
}

/**
 * Returns the allowed semantic colors
 *
 * NO traffic lights (green/yellow/red for good/warning/bad).
 * Red ONLY for simulation, Green ONLY for verified complete.
 */
export function getAllowedUIColors(): AllowedUIColors {
  return {
    simulation: 'var(--color-simulation)',
    verified: 'var(--color-verified)',
  };
}

/**
 * Severity display properties
 */
export interface SeverityDisplay {
  text: string;
  backgroundColor: string;
}

/**
 * Gets severity display properties
 *
 * Severity uses TEXT labels, not color coding.
 * This prevents traffic-light interpretation.
 */
export function getSeverityDisplay(severity: string): SeverityDisplay {
  return {
    text: severity,
    backgroundColor: 'transparent',
  };
}

/**
 * Validates that no emojis are present in text
 */
export function validateNoEmojis(text: string): boolean {
  const emojiPattern =
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u;
  return !emojiPattern.test(text);
}
