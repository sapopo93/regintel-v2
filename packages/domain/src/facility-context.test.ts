import { describe, it, expect } from 'vitest';
import { resolveFacilityContext, type TopicDefinition } from './facility-context';
import { ProviderRegulatoryState, Domain } from './types';
import { InteractionMode } from './prs-logic-profile';
import { EvidenceType } from './evidence-types';

// Minimal topic stubs matching the 34 SAF-aligned topics in app.ts
const STUB_TOPICS: TopicDefinition[] = [
  // SAFE (S1–S8)
  { id: 'learning-culture', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT, EvidenceType.TRAINING] },
  { id: 'safe-systems-pathways-transitions', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'safeguarding', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'involving-people-manage-risks', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'safe-environments', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.CERTIFICATE] },
  { id: 'safe-effective-staffing', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.CERTIFICATE, EvidenceType.SKILLS_MATRIX, EvidenceType.SUPERVISION, EvidenceType.ROTA] },
  { id: 'infection-prevention-control', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'medicines-optimisation', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  // EFFECTIVE (E1–E6)
  { id: 'assessing-needs', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'evidence-based-care', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'staff-teams-work-together', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'supporting-healthier-lives', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'monitoring-improving-outcomes', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY] },
  { id: 'consent-to-care', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  // CARING (C1–C5)
  { id: 'kindness-compassion-dignity', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'treating-people-as-individuals', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'independence-choice-control', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'responding-immediate-needs', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'workforce-wellbeing-enablement', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.SUPERVISION, EvidenceType.AUDIT] },
  // RESPONSIVE (R1–R7)
  { id: 'person-centred-care', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'care-continuity-integration', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'providing-information', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'listening-involving-people', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'equity-in-access', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'equity-experiences-outcomes', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'planning-for-future', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  // WELL-LED (W1–W8)
  { id: 'shared-direction-culture', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'capable-compassionate-leaders', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.CERTIFICATE, EvidenceType.AUDIT] },
  { id: 'freedom-to-speak-up', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING] },
  { id: 'workforce-edi', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
  { id: 'governance-management-sustainability', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'partnerships-communities', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
  { id: 'learning-improvement-innovation', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY, EvidenceType.TRAINING] },
  { id: 'environmental-sustainability', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT] },
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
    it('domiciliary gets 33 topics', () => {
      const ctx = resolveFacilityContext({ serviceType: 'domiciliary' }, STUB_TOPICS);
      expect(ctx.applicableTopicCount).toBe(33);
      expect(ctx.applicableTopicIds).not.toContain('safe-environments');
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
      expect(ctx.applicableTopicCount).toBe(33);
      expect(ctx.readinessColorThresholds).toEqual({ red: 60, amber: 90 });
      expect(ctx.maxFollowUpsPerTopic).toBe(5);
    });
  });
});
