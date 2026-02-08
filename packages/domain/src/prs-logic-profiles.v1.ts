import { Domain, ProviderRegulatoryState, Severity, type TenantId } from './types.js';
import {
  computeProfileHash,
  type PRSLogicProfile,
  type SeverityRule,
  type InteractionRule,
  type SeverityScoreMapping,
} from './prs-logic-profile.js';

const TENANT_ID: TenantId = 'system';

const severityRules: SeverityRule[] = [
  {
    prs: ProviderRegulatoryState.NEW_PROVIDER,
    multiplier: 0.9,
    description: 'Lower scrutiny for new providers during onboarding.',
  },
  {
    prs: ProviderRegulatoryState.ESTABLISHED,
    multiplier: 1.0,
    description: 'Standard scrutiny for established providers.',
  },
  {
    prs: ProviderRegulatoryState.SPECIAL_MEASURES,
    multiplier: 1.5,
    description: 'Heightened scrutiny for providers in special measures.',
  },
  {
    prs: ProviderRegulatoryState.ENFORCEMENT_ACTION,
    multiplier: 1.6,
    description: 'Maximum scrutiny for providers under enforcement action.',
  },
  {
    prs: ProviderRegulatoryState.RATING_INADEQUATE,
    multiplier: 1.5,
    description: 'Heightened scrutiny for inadequate ratings.',
  },
  {
    prs: ProviderRegulatoryState.RATING_REQUIRES_IMPROVEMENT,
    multiplier: 1.2,
    description: 'Increased scrutiny for ratings requiring improvement.',
  },
  {
    prs: ProviderRegulatoryState.REOPENED_SERVICE,
    multiplier: 1.1,
    description: 'Moderate scrutiny for reopened services.',
  },
  {
    prs: ProviderRegulatoryState.MERGED_SERVICE,
    multiplier: 1.05,
    description: 'Slightly elevated scrutiny for merged services.',
  },
];

const interactionRules: InteractionRule[] = [
  {
    prs: ProviderRegulatoryState.NEW_PROVIDER,
    maxFollowUpsPerTopic: 2,
    maxTotalQuestions: 10,
    allowContradictionHunt: false,
  },
  {
    prs: ProviderRegulatoryState.ESTABLISHED,
    maxFollowUpsPerTopic: 3,
    maxTotalQuestions: 12,
    allowContradictionHunt: false,
  },
  {
    prs: ProviderRegulatoryState.SPECIAL_MEASURES,
    maxFollowUpsPerTopic: 5,
    maxTotalQuestions: 25,
    allowContradictionHunt: true,
  },
  {
    prs: ProviderRegulatoryState.ENFORCEMENT_ACTION,
    maxFollowUpsPerTopic: 5,
    maxTotalQuestions: 25,
    allowContradictionHunt: true,
  },
  {
    prs: ProviderRegulatoryState.RATING_INADEQUATE,
    maxFollowUpsPerTopic: 4,
    maxTotalQuestions: 20,
    allowContradictionHunt: true,
  },
  {
    prs: ProviderRegulatoryState.RATING_REQUIRES_IMPROVEMENT,
    maxFollowUpsPerTopic: 4,
    maxTotalQuestions: 18,
    allowContradictionHunt: true,
  },
  {
    prs: ProviderRegulatoryState.REOPENED_SERVICE,
    maxFollowUpsPerTopic: 3,
    maxTotalQuestions: 12,
    allowContradictionHunt: false,
  },
  {
    prs: ProviderRegulatoryState.MERGED_SERVICE,
    maxFollowUpsPerTopic: 3,
    maxTotalQuestions: 12,
    allowContradictionHunt: false,
  },
];

const severityScoreMappings: SeverityScoreMapping[] = [
  { severity: Severity.CRITICAL, baseImpactScore: 95, baseLikelihoodScore: 90 },
  { severity: Severity.HIGH, baseImpactScore: 80, baseLikelihoodScore: 70 },
  { severity: Severity.MEDIUM, baseImpactScore: 60, baseLikelihoodScore: 50 },
  { severity: Severity.LOW, baseImpactScore: 40, baseLikelihoodScore: 30 },
  { severity: Severity.INFO, baseImpactScore: 20, baseLikelihoodScore: 20 },
];

const effectiveDate = '2024-01-01T00:00:00Z';

export const PRS_LOGIC_PROFILE_V1: PRSLogicProfile = {
  id: 'prs-logic-v1',
  tenantId: TENANT_ID,
  domain: Domain.CQC,
  version: 1,
  effectiveDate,
  supersedes: null,
  severityRules,
  interactionRules,
  severityScoreMappings,
  defaultMaxFollowUps: 3,
  defaultMaxQuestions: 12,
  profileHash: computeProfileHash({
    severityRules,
    interactionRules,
    severityScoreMappings,
    effectiveDate,
  }),
  createdAt: '2024-01-01T00:00:00Z',
  createdBy: 'system',
};
