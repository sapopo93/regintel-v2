/**
 * Facility Context Resolver
 *
 * Single source of truth for facility-specific parameters.
 * Replaces 17 hardcoded constants in the API with context-aware values
 * derived from facility metadata (service type, PRS state, capacity).
 *
 * The domain layer already has the infrastructure (evaluateLogicProfile,
 * RegulationScopeSelector, PRSOverride). This module wires them together
 * into a single resolved context object consumed by the API.
 */

import { ProviderRegulatoryState, Domain } from './types';
import { InteractionMode } from './prs-logic-profile';
import { EvidenceType } from './evidence-types';
import { getApplicableTopicIds, getRequiredEvidenceTypes } from './service-type-topics';

export interface FacilityContextInput {
  serviceType?: string;
  prsState?: ProviderRegulatoryState;
  capacity?: number;
  enabledDomains?: Domain[];
}

export interface FacilityContext {
  applicableTopicIds: string[];
  applicableTopicCount: number;
  requiredEvidenceTypes: EvidenceType[];
  expectedEvidenceCount: number;
  maxFollowUpsPerTopic: number;
  recommendedInteractionMode: InteractionMode;
  severityMultiplier: number;
  allowContradictionHunt: boolean;
  readinessWeights: { evidence: number; mockCoverage: number };
  attentionThresholdDays: number;
  readinessColorThresholds: { red: number; amber: number };
  enabledDomains: Domain[];
}

export interface TopicDefinition {
  id: string;
  evidenceRequirements: EvidenceType[];
}

/**
 * Resolves all facility-specific parameters from metadata.
 *
 * Backward compat: resolveFacilityContext({}, topics) returns values
 * matching the current hardcoded defaults (34 topics, 6 evidence types,
 * maxFollowUps=4, 60/40 weights, 50/80 thresholds, 14-day attention).
 */
export function resolveFacilityContext(
  input: FacilityContextInput,
  topics: TopicDefinition[],
): FacilityContext {
  const { serviceType, prsState, enabledDomains } = input;

  // Topic filtering by service type
  const applicableTopicIds = getApplicableTopicIds(serviceType);
  const applicableTopicCount = applicableTopicIds.length;

  // Evidence types from applicable topics only
  const requiredEvidenceTypes = getRequiredEvidenceTypes(serviceType, topics);
  const expectedEvidenceCount = requiredEvidenceTypes.length;

  // PRS-driven parameters
  const prsParams = resolvePrsParameters(prsState);

  return {
    applicableTopicIds,
    applicableTopicCount,
    requiredEvidenceTypes,
    expectedEvidenceCount,
    maxFollowUpsPerTopic: prsParams.maxFollowUpsPerTopic,
    recommendedInteractionMode: prsParams.recommendedInteractionMode,
    severityMultiplier: prsParams.severityMultiplier,
    allowContradictionHunt: prsParams.allowContradictionHunt,
    readinessWeights: prsParams.readinessWeights,
    attentionThresholdDays: prsParams.attentionThresholdDays,
    readinessColorThresholds: prsParams.readinessColorThresholds,
    enabledDomains: enabledDomains ?? [Domain.CQC],
  };
}

interface PrsParameters {
  maxFollowUpsPerTopic: number;
  recommendedInteractionMode: InteractionMode;
  severityMultiplier: number;
  allowContradictionHunt: boolean;
  readinessWeights: { evidence: number; mockCoverage: number };
  attentionThresholdDays: number;
  readinessColorThresholds: { red: number; amber: number };
}

/**
 * Maps PRS state to inspection parameters.
 * Mirrors the logic in evaluateLogicProfile() but without requiring
 * a full PRSLogicProfile entity (which needs tenant context, versioning, etc.).
 */
function resolvePrsParameters(prsState?: ProviderRegulatoryState): PrsParameters {
  switch (prsState) {
    case ProviderRegulatoryState.NEW_PROVIDER:
      return {
        maxFollowUpsPerTopic: 4,
        recommendedInteractionMode: InteractionMode.NARRATIVE_FIRST,
        severityMultiplier: 1.0,
        allowContradictionHunt: false,
        readinessWeights: { evidence: 0.7, mockCoverage: 0.3 },
        attentionThresholdDays: 14,
        readinessColorThresholds: { red: 50, amber: 80 },
      };

    case ProviderRegulatoryState.SPECIAL_MEASURES:
    case ProviderRegulatoryState.RATING_INADEQUATE:
      return {
        maxFollowUpsPerTopic: 5,
        recommendedInteractionMode: InteractionMode.CONTRADICTION_HUNT,
        severityMultiplier: 1.5,
        allowContradictionHunt: true,
        readinessWeights: { evidence: 0.5, mockCoverage: 0.5 },
        attentionThresholdDays: 7,
        readinessColorThresholds: { red: 60, amber: 90 },
      };

    case ProviderRegulatoryState.ENFORCEMENT_ACTION:
      return {
        maxFollowUpsPerTopic: 5,
        recommendedInteractionMode: InteractionMode.EVIDENCE_FIRST,
        severityMultiplier: 1.3,
        allowContradictionHunt: true,
        readinessWeights: { evidence: 0.6, mockCoverage: 0.4 },
        attentionThresholdDays: 7,
        readinessColorThresholds: { red: 50, amber: 80 },
      };

    case ProviderRegulatoryState.RATING_REQUIRES_IMPROVEMENT:
      return {
        maxFollowUpsPerTopic: 4,
        recommendedInteractionMode: InteractionMode.EVIDENCE_FIRST,
        severityMultiplier: 1.2,
        allowContradictionHunt: false,
        readinessWeights: { evidence: 0.6, mockCoverage: 0.4 },
        attentionThresholdDays: 10,
        readinessColorThresholds: { red: 50, amber: 80 },
      };

    // Default: ESTABLISHED, REOPENED_SERVICE, MERGED_SERVICE, undefined
    default:
      return {
        maxFollowUpsPerTopic: 4,
        recommendedInteractionMode: InteractionMode.EVIDENCE_FIRST,
        severityMultiplier: 1.0,
        allowContradictionHunt: false,
        readinessWeights: { evidence: 0.6, mockCoverage: 0.4 },
        attentionThresholdDays: 14,
        readinessColorThresholds: { red: 50, amber: 80 },
      };
  }
}
