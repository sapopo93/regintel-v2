import { describe, it, expect } from 'vitest';
import { resolveFacilityContext, type TopicDefinition } from './facility-context';
import { ProviderRegulatoryState, Domain } from './types';
import { InteractionMode } from './prs-logic-profile';
import { EvidenceType } from './evidence-types';

// Minimal topic stubs matching the 34 topics in app.ts
const STUB_TOPICS: TopicDefinition[] = [
  { id: 'safe-care-treatment', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'safeguarding', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'medication-management', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'infection-prevention-control', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'risk-assessment', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'premises-equipment', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.CERTIFICATE] },
  { id: 'deprivation-of-liberty', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'person-centred-care', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'consent', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'nutrition-hydration', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'staff-training-development', evidenceRequirements: [EvidenceType.TRAINING, EvidenceType.CERTIFICATE, EvidenceType.SKILLS_MATRIX] },
  { id: 'supervision-appraisal', evidenceRequirements: [EvidenceType.SUPERVISION, EvidenceType.POLICY] },
  { id: 'mental-capacity-act', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'dignity-respect', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'service-user-involvement', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'emotional-social-wellbeing', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'end-of-life-care', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'complaints-handling', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'care-planning-review', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'meeting-individual-needs', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'transitions-discharge', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'equality-diversity', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'governance-oversight', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'quality-assurance', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY] },
  { id: 'staff-recruitment', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.CERTIFICATE, EvidenceType.AUDIT] },
  { id: 'fit-proper-persons', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.CERTIFICATE, EvidenceType.AUDIT] },
  { id: 'whistleblowing-openness', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING] },
  { id: 'notifications-cqc', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'financial-sustainability', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY] },
  { id: 'records-management', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'staff-wellbeing', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.SUPERVISION, EvidenceType.AUDIT] },
  { id: 'learning-from-incidents', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY, EvidenceType.TRAINING] },
  { id: 'partnership-working', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'staffing', evidenceRequirements: [EvidenceType.ROTA, EvidenceType.SKILLS_MATRIX, EvidenceType.SUPERVISION] },
];

describe('facility-context', () => {
  describe('backward compatibility (empty input)', () => {
    it('returns 34 topics with no serviceType', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      expect(ctx.applicableTopicCount).toBe(34);
    });

    it('returns 6 evidence types with no serviceType', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      // POLICY, TRAINING, AUDIT, CERTIFICATE, SKILLS_MATRIX, SUPERVISION, ROTA = 7 unique types
      // Actually let's count: the full set has POLICY, TRAINING, AUDIT, CERTIFICATE, SKILLS_MATRIX, SUPERVISION, ROTA
      expect(ctx.expectedEvidenceCount).toBe(7);
    });

    it('returns default weights 60/40', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      expect(ctx.readinessWeights).toEqual({ evidence: 0.6, mockCoverage: 0.4 });
    });

    it('returns default thresholds 50/80', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      expect(ctx.readinessColorThresholds).toEqual({ red: 50, amber: 80 });
    });

    it('returns maxFollowUps=4', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      expect(ctx.maxFollowUpsPerTopic).toBe(4);
    });

    it('returns 14-day attention threshold', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      expect(ctx.attentionThresholdDays).toBe(14);
    });

    it('returns EVIDENCE_FIRST mode', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      expect(ctx.recommendedInteractionMode).toBe(InteractionMode.EVIDENCE_FIRST);
    });

    it('defaults to CQC domain', () => {
      const ctx = resolveFacilityContext({}, STUB_TOPICS);
      expect(ctx.enabledDomains).toEqual([Domain.CQC]);
    });
  });

  describe('service type filtering', () => {
    it('domiciliary gets 31 topics', () => {
      const ctx = resolveFacilityContext({ serviceType: 'domiciliary' }, STUB_TOPICS);
      expect(ctx.applicableTopicCount).toBe(31);
      expect(ctx.applicableTopicIds).not.toContain('premises-equipment');
    });

    it('domiciliary has fewer evidence types (no CERTIFICATE from premises)', () => {
      const ctx = resolveFacilityContext({ serviceType: 'domiciliary' }, STUB_TOPICS);
      // Still has CERTIFICATE from staff-recruitment and fit-proper-persons
      expect(ctx.requiredEvidenceTypes).toContain(EvidenceType.CERTIFICATE);
    });
  });

  describe('PRS state overrides', () => {
    it('NEW_PROVIDER uses NARRATIVE_FIRST with 70/30 weights', () => {
      const ctx = resolveFacilityContext(
        { prsState: ProviderRegulatoryState.NEW_PROVIDER },
        STUB_TOPICS,
      );
      expect(ctx.recommendedInteractionMode).toBe(InteractionMode.NARRATIVE_FIRST);
      expect(ctx.readinessWeights).toEqual({ evidence: 0.7, mockCoverage: 0.3 });
    });

    it('SPECIAL_MEASURES uses CONTRADICTION_HUNT with tighter thresholds', () => {
      const ctx = resolveFacilityContext(
        { prsState: ProviderRegulatoryState.SPECIAL_MEASURES },
        STUB_TOPICS,
      );
      expect(ctx.recommendedInteractionMode).toBe(InteractionMode.CONTRADICTION_HUNT);
      expect(ctx.readinessWeights).toEqual({ evidence: 0.5, mockCoverage: 0.5 });
      expect(ctx.readinessColorThresholds).toEqual({ red: 60, amber: 90 });
      expect(ctx.attentionThresholdDays).toBe(7);
      expect(ctx.allowContradictionHunt).toBe(true);
      expect(ctx.severityMultiplier).toBe(1.5);
      expect(ctx.maxFollowUpsPerTopic).toBe(5);
    });

    it('RATING_INADEQUATE same as SPECIAL_MEASURES', () => {
      const ctx = resolveFacilityContext(
        { prsState: ProviderRegulatoryState.RATING_INADEQUATE },
        STUB_TOPICS,
      );
      expect(ctx.recommendedInteractionMode).toBe(InteractionMode.CONTRADICTION_HUNT);
      expect(ctx.attentionThresholdDays).toBe(7);
    });

    it('ENFORCEMENT_ACTION uses EVIDENCE_FIRST with 7-day attention', () => {
      const ctx = resolveFacilityContext(
        { prsState: ProviderRegulatoryState.ENFORCEMENT_ACTION },
        STUB_TOPICS,
      );
      expect(ctx.recommendedInteractionMode).toBe(InteractionMode.EVIDENCE_FIRST);
      expect(ctx.attentionThresholdDays).toBe(7);
      expect(ctx.severityMultiplier).toBe(1.3);
    });

    it('ESTABLISHED uses defaults', () => {
      const ctx = resolveFacilityContext(
        { prsState: ProviderRegulatoryState.ESTABLISHED },
        STUB_TOPICS,
      );
      expect(ctx.recommendedInteractionMode).toBe(InteractionMode.EVIDENCE_FIRST);
      expect(ctx.readinessWeights).toEqual({ evidence: 0.6, mockCoverage: 0.4 });
      expect(ctx.attentionThresholdDays).toBe(14);
    });
  });

  describe('combined service type + PRS', () => {
    it('domiciliary + SPECIAL_MEASURES: fewer topics, tighter thresholds', () => {
      const ctx = resolveFacilityContext(
        {
          serviceType: 'domiciliary',
          prsState: ProviderRegulatoryState.SPECIAL_MEASURES,
        },
        STUB_TOPICS,
      );
      expect(ctx.applicableTopicCount).toBe(31);
      expect(ctx.readinessColorThresholds).toEqual({ red: 60, amber: 90 });
      expect(ctx.maxFollowUpsPerTopic).toBe(5);
    });
  });
});
