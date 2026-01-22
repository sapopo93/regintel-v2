import { describe, it, expect } from 'vitest';
import {
  createPRSLogicProfile,
  evaluateLogicProfile,
  computeEvaluationHash,
  computeAdjustedSeverityScore,
  verifyProfileIntegrity,
  InteractionMode,
} from './prs-logic-profile.js';
import { createProviderContextSnapshot } from './provider-context-snapshot.js';
import { Domain, ProviderRegulatoryState, Severity } from './types.js';

function buildProfile() {
  return createPRSLogicProfile({
    id: 'profile-1',
    tenantId: 'tenant-a',
    domain: Domain.CQC,
    version: 1,
    effectiveDate: '2024-01-01T00:00:00Z',
    supersedes: null,
    severityRules: [
      {
        prs: ProviderRegulatoryState.NEW_PROVIDER,
        multiplier: 0.9,
        description: 'Lower scrutiny for new providers',
      },
      {
        prs: ProviderRegulatoryState.SPECIAL_MEASURES,
        multiplier: 1.4,
        description: 'Heightened scrutiny for special measures',
      },
    ],
    interactionRules: [
      {
        prs: ProviderRegulatoryState.NEW_PROVIDER,
        maxFollowUpsPerTopic: 2,
        maxTotalQuestions: 10,
        allowContradictionHunt: false,
      },
      {
        prs: ProviderRegulatoryState.SPECIAL_MEASURES,
        maxFollowUpsPerTopic: 4,
        maxTotalQuestions: 20,
        allowContradictionHunt: true,
      },
    ],
    severityScoreMappings: [
      {
        severity: Severity.HIGH,
        baseImpactScore: 80,
        baseLikelihoodScore: 70,
      },
    ],
    defaultMaxFollowUps: 3,
    defaultMaxQuestions: 12,
    createdBy: 'system',
  });
}

function buildSnapshot(prs: ProviderRegulatoryState, id: string) {
  return createProviderContextSnapshot({
    id,
    tenantId: 'tenant-a',
    asOf: '2024-01-15T10:00:00Z',
    regulatoryState: prs,
    metadata: {
      providerName: 'Care Home Example',
      serviceTypes: ['residential'],
    },
    enabledDomains: [Domain.CQC],
    activeRegulationIds: ['reg-1'],
    activePolicyIds: ['policy-1'],
    createdBy: 'system',
  });
}

describe('logic:determinism', () => {
  it('same snapshot + profile ⇒ identical outputs', () => {
    const profile = buildProfile();
    const snapshot = buildSnapshot(
      ProviderRegulatoryState.NEW_PROVIDER,
      'snapshot-1'
    );

    const first = evaluateLogicProfile(snapshot, profile);
    const second = evaluateLogicProfile(snapshot, profile);

    expect(first).toEqual(second);
  });
});

describe('logic:interaction-hash', () => {
  it('interaction directive hash is stable', () => {
    const profile = buildProfile();
    const snapshotA = buildSnapshot(
      ProviderRegulatoryState.SPECIAL_MEASURES,
      'snapshot-a'
    );
    const snapshotB = buildSnapshot(
      ProviderRegulatoryState.SPECIAL_MEASURES,
      'snapshot-b'
    );

    const evalA = evaluateLogicProfile(snapshotA, profile);
    const evalB = evaluateLogicProfile(snapshotB, profile);

    expect(evalA.recommendedInteractionMode).toBe(
      InteractionMode.CONTRADICTION_HUNT
    );
    expect(evalB.recommendedInteractionMode).toBe(
      InteractionMode.CONTRADICTION_HUNT
    );
    expect(evalA.evaluationHash).toBe(evalB.evaluationHash);

    const recomputedHash = computeEvaluationHash({
      snapshotHash: snapshotA.snapshotHash,
      profileId: profile.id,
      profileHash: profile.profileHash,
      prs: snapshotA.regulatoryState,
      severityMultiplier: evalA.severityMultiplier,
      maxFollowUpsPerTopic: evalA.maxFollowUpsPerTopic,
      maxTotalQuestions: evalA.maxTotalQuestions,
      allowContradictionHunt: evalA.allowContradictionHunt,
      recommendedInteractionMode: evalA.recommendedInteractionMode,
    });

    expect(recomputedHash).toBe(evalA.evaluationHash);
  });
});

describe('logic:rule-matching', () => {
  it('severity rule matches based on PRS lifecycle state', () => {
    const profile = buildProfile();

    // NEW_PROVIDER should get 0.9 multiplier
    const newProviderSnapshot = buildSnapshot(
      ProviderRegulatoryState.NEW_PROVIDER,
      'snap-new'
    );
    const evalNew = evaluateLogicProfile(newProviderSnapshot, profile);
    expect(evalNew.severityMultiplier).toBe(0.9);

    // SPECIAL_MEASURES should get 1.4 multiplier
    const specialMeasuresSnapshot = buildSnapshot(
      ProviderRegulatoryState.SPECIAL_MEASURES,
      'snap-special'
    );
    const evalSpecial = evaluateLogicProfile(specialMeasuresSnapshot, profile);
    expect(evalSpecial.severityMultiplier).toBe(1.4);
  });

  it('interaction rule matches based on PRS lifecycle state', () => {
    const profile = buildProfile();

    // NEW_PROVIDER should get limited interaction rules
    const newProviderSnapshot = buildSnapshot(
      ProviderRegulatoryState.NEW_PROVIDER,
      'snap-new'
    );
    const evalNew = evaluateLogicProfile(newProviderSnapshot, profile);
    expect(evalNew.maxFollowUpsPerTopic).toBe(2);
    expect(evalNew.maxTotalQuestions).toBe(10);
    expect(evalNew.allowContradictionHunt).toBe(false);

    // SPECIAL_MEASURES should get heightened interaction rules
    const specialMeasuresSnapshot = buildSnapshot(
      ProviderRegulatoryState.SPECIAL_MEASURES,
      'snap-special'
    );
    const evalSpecial = evaluateLogicProfile(specialMeasuresSnapshot, profile);
    expect(evalSpecial.maxFollowUpsPerTopic).toBe(4);
    expect(evalSpecial.maxTotalQuestions).toBe(20);
    expect(evalSpecial.allowContradictionHunt).toBe(true);
  });

  it('falls back to defaults when no rule matches PRS', () => {
    const profile = buildProfile();

    // ESTABLISHED provider has no specific rules, should use defaults
    const establishedSnapshot = buildSnapshot(
      ProviderRegulatoryState.ESTABLISHED,
      'snap-established'
    );
    const evalEstablished = evaluateLogicProfile(establishedSnapshot, profile);

    expect(evalEstablished.severityMultiplier).toBe(1.0); // No rule, default
    expect(evalEstablished.maxFollowUpsPerTopic).toBe(3); // profile.defaultMaxFollowUps
    expect(evalEstablished.maxTotalQuestions).toBe(12); // profile.defaultMaxQuestions
    expect(evalEstablished.allowContradictionHunt).toBe(false); // default false
  });

  it('interaction mode selection is deterministic based on PRS', () => {
    const profile = buildProfile();

    // NEW_PROVIDER → NARRATIVE_FIRST
    const newSnapshot = buildSnapshot(ProviderRegulatoryState.NEW_PROVIDER, 'snap-1');
    expect(evaluateLogicProfile(newSnapshot, profile).recommendedInteractionMode).toBe(
      InteractionMode.NARRATIVE_FIRST
    );

    // SPECIAL_MEASURES → CONTRADICTION_HUNT
    const specialSnapshot = buildSnapshot(
      ProviderRegulatoryState.SPECIAL_MEASURES,
      'snap-2'
    );
    expect(evaluateLogicProfile(specialSnapshot, profile).recommendedInteractionMode).toBe(
      InteractionMode.CONTRADICTION_HUNT
    );

    // RATING_INADEQUATE → CONTRADICTION_HUNT
    const inadequateSnapshot = buildSnapshot(
      ProviderRegulatoryState.RATING_INADEQUATE,
      'snap-3'
    );
    expect(evaluateLogicProfile(inadequateSnapshot, profile).recommendedInteractionMode).toBe(
      InteractionMode.CONTRADICTION_HUNT
    );

    // RATING_REQUIRES_IMPROVEMENT → EVIDENCE_FIRST
    const requiresImprovementSnapshot = buildSnapshot(
      ProviderRegulatoryState.RATING_REQUIRES_IMPROVEMENT,
      'snap-4'
    );
    expect(
      evaluateLogicProfile(requiresImprovementSnapshot, profile).recommendedInteractionMode
    ).toBe(InteractionMode.EVIDENCE_FIRST);

    // ESTABLISHED → EVIDENCE_FIRST (default)
    const establishedSnapshot = buildSnapshot(
      ProviderRegulatoryState.ESTABLISHED,
      'snap-5'
    );
    expect(evaluateLogicProfile(establishedSnapshot, profile).recommendedInteractionMode).toBe(
      InteractionMode.EVIDENCE_FIRST
    );
  });
});

describe('logic:resolution-strategy', () => {
  it('uses first-match strategy for severity rules', () => {
    // Create profile with multiple overlapping rules (first should win)
    const profile = createPRSLogicProfile({
      id: 'profile-multi',
      tenantId: 'tenant-a',
      domain: Domain.CQC,
      version: 1,
      effectiveDate: '2024-01-01T00:00:00Z',
      supersedes: null,
      severityRules: [
        {
          prs: ProviderRegulatoryState.SPECIAL_MEASURES,
          multiplier: 1.5,
          description: 'First rule',
        },
        {
          prs: ProviderRegulatoryState.SPECIAL_MEASURES, // Duplicate (should not happen in practice)
          multiplier: 2.0,
          description: 'Second rule',
        },
      ],
      interactionRules: [],
      severityScoreMappings: [],
      defaultMaxFollowUps: 3,
      defaultMaxQuestions: 12,
      createdBy: 'system',
    });

    const snapshot = buildSnapshot(ProviderRegulatoryState.SPECIAL_MEASURES, 'snap-1');
    const eval1 = evaluateLogicProfile(snapshot, profile);

    // First matching rule should be used
    expect(eval1.severityMultiplier).toBe(1.5);
  });

  it('rule matching is deterministic across multiple evaluations', () => {
    const profile = buildProfile();
    const snapshot = buildSnapshot(ProviderRegulatoryState.NEW_PROVIDER, 'snap-1');

    // Evaluate 5 times - should always get identical results
    const results = Array.from({ length: 5 }, () => evaluateLogicProfile(snapshot, profile));

    const first = results[0];
    for (const result of results.slice(1)) {
      expect(result).toEqual(first);
      expect(result.evaluationHash).toBe(first.evaluationHash);
    }
  });
});

describe('logic:output-invariants', () => {
  it('evaluation hash is stable for identical inputs', () => {
    const profile = buildProfile();
    const snapshot1 = buildSnapshot(ProviderRegulatoryState.NEW_PROVIDER, 'snap-1');
    const snapshot2 = buildSnapshot(ProviderRegulatoryState.NEW_PROVIDER, 'snap-1'); // Same ID

    const eval1 = evaluateLogicProfile(snapshot1, profile);
    const eval2 = evaluateLogicProfile(snapshot2, profile);

    // Same snapshot + same profile → same evaluation hash
    expect(eval1.evaluationHash).toBe(eval2.evaluationHash);
  });

  it('profile hash is deterministic and independent of rule order', () => {
    const profileA = createPRSLogicProfile({
      id: 'profile-a',
      tenantId: 'tenant-a',
      domain: Domain.CQC,
      version: 1,
      effectiveDate: '2024-01-01T00:00:00Z',
      supersedes: null,
      severityRules: [
        {
          prs: ProviderRegulatoryState.NEW_PROVIDER,
          multiplier: 0.9,
          description: 'Lower scrutiny',
        },
        {
          prs: ProviderRegulatoryState.SPECIAL_MEASURES,
          multiplier: 1.4,
          description: 'Higher scrutiny',
        },
      ],
      interactionRules: [],
      severityScoreMappings: [],
      defaultMaxFollowUps: 3,
      defaultMaxQuestions: 12,
      createdBy: 'system',
    });

    const profileB = createPRSLogicProfile({
      id: 'profile-b',
      tenantId: 'tenant-a',
      domain: Domain.CQC,
      version: 1,
      effectiveDate: '2024-01-01T00:00:00Z',
      supersedes: null,
      // Reversed order
      severityRules: [
        {
          prs: ProviderRegulatoryState.SPECIAL_MEASURES,
          multiplier: 1.4,
          description: 'Higher scrutiny',
        },
        {
          prs: ProviderRegulatoryState.NEW_PROVIDER,
          multiplier: 0.9,
          description: 'Lower scrutiny',
        },
      ],
      interactionRules: [],
      severityScoreMappings: [],
      defaultMaxFollowUps: 3,
      defaultMaxQuestions: 12,
      createdBy: 'system',
    });

    // Hash should be identical (rules are sorted before hashing)
    expect(profileA.profileHash).toBe(profileB.profileHash);
  });

  it('severity multiplier clamping prevents impact > 100', () => {
    // Extreme multiplier should still clamp to 100
    const result = computeAdjustedSeverityScore(90, 80, 2.0); // 90 * 2.0 = 180, should clamp to 100

    expect(result.adjustedImpact).toBe(100);
    expect(result.adjustedLikelihood).toBe(80);
    expect(result.composite).toBe(80); // (100 * 80) / 100
  });

  it('interaction mode is bounded enum with no free-text', () => {
    const profile = buildProfile();
    const snapshot = buildSnapshot(ProviderRegulatoryState.NEW_PROVIDER, 'snap-1');
    const evaluation = evaluateLogicProfile(snapshot, profile);

    // Must be one of the defined enum values
    const validModes = [
      InteractionMode.EVIDENCE_FIRST,
      InteractionMode.NARRATIVE_FIRST,
      InteractionMode.CONTRADICTION_HUNT,
      InteractionMode.VERIFICATION_ONLY,
    ];

    expect(validModes).toContain(evaluation.recommendedInteractionMode);
  });

  it('composite risk score calculation is deterministic', () => {
    const result1 = computeAdjustedSeverityScore(80, 70, 1.4);
    const result2 = computeAdjustedSeverityScore(80, 70, 1.4);

    expect(result1).toEqual(result2);
    expect(result1.composite).toBe(Math.round((result1.adjustedImpact * 70) / 100));
  });
});

describe('logic:edge-cases', () => {
  it('handles profile with empty rules (all defaults)', () => {
    const emptyProfile = createPRSLogicProfile({
      id: 'profile-empty',
      tenantId: 'tenant-a',
      domain: Domain.CQC,
      version: 1,
      effectiveDate: '2024-01-01T00:00:00Z',
      supersedes: null,
      severityRules: [], // Empty
      interactionRules: [], // Empty
      severityScoreMappings: [],
      defaultMaxFollowUps: 5,
      defaultMaxQuestions: 15,
      createdBy: 'system',
    });

    const snapshot = buildSnapshot(ProviderRegulatoryState.ESTABLISHED, 'snap-1');
    const evaluation = evaluateLogicProfile(snapshot, emptyProfile);

    // Should use all defaults
    expect(evaluation.severityMultiplier).toBe(1.0);
    expect(evaluation.maxFollowUpsPerTopic).toBe(5);
    expect(evaluation.maxTotalQuestions).toBe(15);
    expect(evaluation.allowContradictionHunt).toBe(false);
  });

  it('handles unknown PRS values gracefully', () => {
    const profile = buildProfile();

    // Create snapshot with PRS that has no matching rules
    const snapshot = buildSnapshot(
      ProviderRegulatoryState.ENFORCEMENT_ACTION,
      'snap-enforcement'
    );
    const evaluation = evaluateLogicProfile(snapshot, profile);

    // Should fall back to defaults
    expect(evaluation.severityMultiplier).toBe(1.0);
    expect(evaluation.maxFollowUpsPerTopic).toBe(3); // profile.defaultMaxFollowUps
    expect(evaluation.maxTotalQuestions).toBe(12); // profile.defaultMaxQuestions
  });

  it('extreme multiplier values are preserved (not clamped at profile level)', () => {
    const extremeProfile = createPRSLogicProfile({
      id: 'profile-extreme',
      tenantId: 'tenant-a',
      domain: Domain.CQC,
      version: 1,
      effectiveDate: '2024-01-01T00:00:00Z',
      supersedes: null,
      severityRules: [
        {
          prs: ProviderRegulatoryState.SPECIAL_MEASURES,
          multiplier: 5.0, // Very high multiplier
          description: 'Extreme scrutiny',
        },
      ],
      interactionRules: [],
      severityScoreMappings: [],
      defaultMaxFollowUps: 3,
      defaultMaxQuestions: 12,
      createdBy: 'system',
    });

    const snapshot = buildSnapshot(ProviderRegulatoryState.SPECIAL_MEASURES, 'snap-1');
    const evaluation = evaluateLogicProfile(snapshot, extremeProfile);

    // Multiplier is preserved in evaluation (clamping happens during score computation)
    expect(evaluation.severityMultiplier).toBe(5.0);
  });

  it('profile integrity verification detects tampering', () => {
    const profile = buildProfile();

    // Valid profile should verify
    expect(verifyProfileIntegrity(profile)).toBe(true);

    // Tampered profile should fail verification
    const tamperedProfile = {
      ...profile,
      severityRules: [
        {
          prs: ProviderRegulatoryState.NEW_PROVIDER,
          multiplier: 999.0, // Tampered value
          description: 'Tampered',
        },
      ],
      // profileHash unchanged (simulates tampering)
    };

    expect(verifyProfileIntegrity(tamperedProfile)).toBe(false);
  });

  it('zero multiplier is valid (no impact)', () => {
    const result = computeAdjustedSeverityScore(80, 70, 0.0);

    expect(result.adjustedImpact).toBe(0);
    expect(result.composite).toBe(0);
  });
});
