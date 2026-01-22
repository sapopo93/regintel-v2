/**
 * PRS Logic Profile Entity (Phase 4: PRS Logic Profiles)
 *
 * Defines deterministic logic for how the system judges severity and rigor
 * based on provider context (PRS - Provider Regulatory State).
 * IMMUTABLE: Logic profiles are versioned, never modified in place.
 */

import { createHash } from 'node:crypto';
import {
  type TenantId,
  type ISOTimestamp,
  type ContentHash,
  ProviderRegulatoryState,
  type Severity,
  type Domain,
} from './types.js';
import type { ProviderContextSnapshot } from './provider-context-snapshot.js';

/**
 * Severity multiplier based on PRS
 */
export interface SeverityRule {
  prs: ProviderRegulatoryState;
  multiplier: number; // 1.0 = normal, >1.0 = heightened scrutiny, <1.0 = reduced
  description: string;
}

/**
 * Follow-up question limits based on PRS
 */
export interface InteractionRule {
  prs: ProviderRegulatoryState;
  maxFollowUpsPerTopic: number;
  maxTotalQuestions: number;
  allowContradictionHunt: boolean; // Can system probe for inconsistencies?
}

/**
 * Base score adjustments for different severity levels
 */
export interface SeverityScoreMapping {
  severity: Severity;
  baseImpactScore: number; // 0-100
  baseLikelihoodScore: number; // 0-100
}

/**
 * Interaction directive (bounded, no free-text prompts)
 */
export enum InteractionMode {
  EVIDENCE_FIRST = 'EVIDENCE_FIRST', // Request evidence before questioning
  NARRATIVE_FIRST = 'NARRATIVE_FIRST', // Ask for explanation first
  CONTRADICTION_HUNT = 'CONTRADICTION_HUNT', // Probe for inconsistencies
  VERIFICATION_ONLY = 'VERIFICATION_ONLY', // Only verify existing evidence
}

/**
 * Immutable, versioned logic profile
 */
export interface PRSLogicProfile {
  // Identity
  id: string;
  tenantId: TenantId;
  domain: Domain;
  version: number;

  // Effective date
  effectiveDate: ISOTimestamp;
  supersedes: string | null; // Previous profile ID

  // Logic rules
  severityRules: SeverityRule[];
  interactionRules: InteractionRule[];
  severityScoreMappings: SeverityScoreMapping[];

  // Defaults
  defaultMaxFollowUps: number;
  defaultMaxQuestions: number;

  // Integrity
  profileHash: ContentHash; // Deterministic hash of rules

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string;
}

/**
 * Result of applying logic profile to a snapshot
 */
export interface LogicEvaluation {
  snapshotId: string;
  profileId: string;
  prs: ProviderRegulatoryState;

  // Applied rules
  severityMultiplier: number;
  maxFollowUpsPerTopic: number;
  maxTotalQuestions: number;
  allowContradictionHunt: boolean;

  // Interaction directive
  recommendedInteractionMode: InteractionMode;

  // Hash for determinism verification
  evaluationHash: ContentHash;
}

/**
 * Computes deterministic hash for a logic profile.
 */
export function computeProfileHash(profile: {
  severityRules: SeverityRule[];
  interactionRules: InteractionRule[];
  severityScoreMappings: SeverityScoreMapping[];
  effectiveDate: ISOTimestamp;
}): ContentHash {
  const canonical = {
    effectiveDate: profile.effectiveDate,
    severityRules: profile.severityRules
      .map((r) => ({
        prs: r.prs,
        multiplier: r.multiplier,
        description: r.description,
      }))
      .sort((a, b) => a.prs.localeCompare(b.prs)),
    interactionRules: profile.interactionRules
      .map((r) => ({
        prs: r.prs,
        maxFollowUpsPerTopic: r.maxFollowUpsPerTopic,
        maxTotalQuestions: r.maxTotalQuestions,
        allowContradictionHunt: r.allowContradictionHunt,
      }))
      .sort((a, b) => a.prs.localeCompare(b.prs)),
    severityScoreMappings: profile.severityScoreMappings
      .map((m) => ({
        severity: m.severity,
        baseImpactScore: m.baseImpactScore,
        baseLikelihoodScore: m.baseLikelihoodScore,
      }))
      .sort((a, b) => a.severity.localeCompare(b.severity)),
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new PRS logic profile.
 */
export function createPRSLogicProfile(input: {
  id: string;
  tenantId: TenantId;
  domain: Domain;
  version: number;
  effectiveDate: ISOTimestamp;
  supersedes: string | null;
  severityRules: SeverityRule[];
  interactionRules: InteractionRule[];
  severityScoreMappings: SeverityScoreMapping[];
  defaultMaxFollowUps: number;
  defaultMaxQuestions: number;
  createdBy: string;
}): PRSLogicProfile {
  const profileHash = computeProfileHash({
    severityRules: input.severityRules,
    interactionRules: input.interactionRules,
    severityScoreMappings: input.severityScoreMappings,
    effectiveDate: input.effectiveDate,
  });

  return {
    id: input.id,
    tenantId: input.tenantId,
    domain: input.domain,
    version: input.version,
    effectiveDate: input.effectiveDate,
    supersedes: input.supersedes,
    severityRules: input.severityRules,
    interactionRules: input.interactionRules,
    severityScoreMappings: input.severityScoreMappings,
    defaultMaxFollowUps: input.defaultMaxFollowUps,
    defaultMaxQuestions: input.defaultMaxQuestions,
    profileHash,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

/**
 * Applies logic profile to a provider context snapshot.
 * DETERMINISTIC: Same snapshot + profile = same evaluation.
 */
export function evaluateLogicProfile(
  snapshot: ProviderContextSnapshot,
  profile: PRSLogicProfile
): LogicEvaluation {
  const prs = snapshot.regulatoryState;

  // Find applicable severity rule
  const severityRule = profile.severityRules.find((r) => r.prs === prs);
  const severityMultiplier = severityRule?.multiplier ?? 1.0;

  // Find applicable interaction rule
  const interactionRule = profile.interactionRules.find((r) => r.prs === prs);
  const maxFollowUpsPerTopic =
    interactionRule?.maxFollowUpsPerTopic ?? profile.defaultMaxFollowUps;
  const maxTotalQuestions =
    interactionRule?.maxTotalQuestions ?? profile.defaultMaxQuestions;
  const allowContradictionHunt =
    interactionRule?.allowContradictionHunt ?? false;

  // Determine recommended interaction mode
  let recommendedInteractionMode: InteractionMode;
  if (prs === ProviderRegulatoryState.NEW_PROVIDER) {
    recommendedInteractionMode = InteractionMode.NARRATIVE_FIRST;
  } else if (
    prs === ProviderRegulatoryState.SPECIAL_MEASURES ||
    prs === ProviderRegulatoryState.RATING_INADEQUATE
  ) {
    recommendedInteractionMode = InteractionMode.CONTRADICTION_HUNT;
  } else if (prs === ProviderRegulatoryState.RATING_REQUIRES_IMPROVEMENT) {
    recommendedInteractionMode = InteractionMode.EVIDENCE_FIRST;
  } else {
    recommendedInteractionMode = InteractionMode.EVIDENCE_FIRST;
  }

  // Compute deterministic evaluation hash
  const evaluationHash = computeEvaluationHash({
    snapshotHash: snapshot.snapshotHash,
    profileId: profile.id,
    profileHash: profile.profileHash,
    prs,
    severityMultiplier,
    maxFollowUpsPerTopic,
    maxTotalQuestions,
    allowContradictionHunt,
    recommendedInteractionMode,
  });

  return {
    snapshotId: snapshot.id,
    profileId: profile.id,
    prs,
    severityMultiplier,
    maxFollowUpsPerTopic,
    maxTotalQuestions,
    allowContradictionHunt,
    recommendedInteractionMode,
    evaluationHash,
  };
}

/**
 * Computes deterministic hash for a logic evaluation.
 */
export function computeEvaluationHash(evaluation: {
  snapshotHash: ContentHash;
  profileId: string;
  profileHash: ContentHash;
  prs: ProviderRegulatoryState;
  severityMultiplier: number;
  maxFollowUpsPerTopic: number;
  maxTotalQuestions: number;
  allowContradictionHunt: boolean;
  recommendedInteractionMode: InteractionMode;
}): ContentHash {
  const canonical = {
    snapshotHash: evaluation.snapshotHash,
    profileId: evaluation.profileId,
    profileHash: evaluation.profileHash,
    prs: evaluation.prs,
    severityMultiplier: evaluation.severityMultiplier,
    maxFollowUpsPerTopic: evaluation.maxFollowUpsPerTopic,
    maxTotalQuestions: evaluation.maxTotalQuestions,
    allowContradictionHunt: evaluation.allowContradictionHunt,
    recommendedInteractionMode: evaluation.recommendedInteractionMode,
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Computes adjusted severity score based on PRS multiplier.
 */
export function computeAdjustedSeverityScore(
  baseImpactScore: number,
  baseLikelihoodScore: number,
  severityMultiplier: number
): { adjustedImpact: number; adjustedLikelihood: number; composite: number } {
  // Apply multiplier to impact (likelihood stays base)
  const adjustedImpact = Math.min(100, Math.round(baseImpactScore * severityMultiplier));
  const adjustedLikelihood = baseLikelihoodScore;

  // Compute composite risk score
  const composite = Math.round((adjustedImpact * adjustedLikelihood) / 100);

  return {
    adjustedImpact,
    adjustedLikelihood,
    composite,
  };
}

/**
 * Verifies profile integrity.
 */
export function verifyProfileIntegrity(profile: PRSLogicProfile): boolean {
  const expectedHash = computeProfileHash({
    severityRules: profile.severityRules,
    interactionRules: profile.interactionRules,
    severityScoreMappings: profile.severityScoreMappings,
    effectiveDate: profile.effectiveDate,
  });

  return profile.profileHash === expectedHash;
}
