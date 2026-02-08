/**
 * Phase 11 Gate Tests: Blue Ocean
 *
 * Determinism, RCA coverage, and mock watermark enforcement.
 */

import { describe, it, expect } from 'vitest';
import {
  BLUE_OCEAN_MOCK_WATERMARK,
  computeBlueOceanReportHash,
  generateBlueOceanReport,
} from './blue-ocean-report.js';
import {
  blueOceanFixtureExpectedHash,
  blueOceanFixtureInput,
} from './fixtures/blue-ocean-golden.fixture.js';

describe('blue-ocean:rca', () => {
  it('major findings include at least two hypotheses with disconfirming tests', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);

    expect(report.sections.majorFindings.length).toBeGreaterThan(0);
    expect(report.sections.rootCauseAnalysis.length).toBe(
      report.sections.majorFindings.length
    );

    for (const analysis of report.sections.rootCauseAnalysis) {
      expect(analysis.hypotheses.length).toBeGreaterThanOrEqual(2);
      for (const hypothesis of analysis.hypotheses) {
        expect(hypothesis.disconfirmingTests.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('blue-ocean:determinism', () => {
  it('hashing output twice yields the same value', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const hashA = computeBlueOceanReportHash(report);
    const hashB = computeBlueOceanReportHash(report);

    expect(hashA).toBe(hashB);
  });

  it('matches golden fixture hash', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    expect(report.reportId).toBe(blueOceanFixtureExpectedHash);
    expect(computeBlueOceanReportHash(report)).toBe(blueOceanFixtureExpectedHash);
  });

  it('emits all 14 sections (13 original + evidenceIndex)', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    expect(Object.keys(report.sections)).toHaveLength(14);
    expect(report.sections.evidenceIndex).toBeDefined();
  });
});

describe('blue-ocean:mock-watermark', () => {
  it('preserves mock watermark', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    expect(report.watermark).toBe(BLUE_OCEAN_MOCK_WATERMARK);
    expect(report.reportingDomain).toBe('MOCK_SIMULATION');
  });
});

describe('blue-ocean:completeness', () => {
  it('contributing factors are non-empty for major findings', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    expect(report.sections.majorFindings.length).toBeGreaterThan(0);
    expect(report.sections.contributingFactors.length).toBeGreaterThan(0);
  });

  it('evidence index includes evidence provided', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    expect(report.sections.evidenceIndex).toBeDefined();
    expect(Array.isArray(report.sections.evidenceIndex)).toBe(true);
    expect(report.sections.evidenceIndex.length).toBeGreaterThan(0);
  });

  it('actions exist for major findings in fixture', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    expect(report.sections.majorFindings.length).toBeGreaterThan(0);
    // Fixture already has 2 actions
    const totalActions =
      report.sections.remediationPlan.openActions +
      report.sections.remediationPlan.inProgressActions +
      report.sections.remediationPlan.pendingVerificationActions +
      report.sections.remediationPlan.verifiedActions +
      report.sections.remediationPlan.rejectedActions;
    expect(totalActions).toBeGreaterThan(0);
  });

  it('SMART action completeness >= 0.95', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const details = report.sections.remediationPlan.actionDetails;
    expect(details.length).toBeGreaterThan(0);

    let completeCount = 0;
    for (const detail of details) {
      const hasOwner = detail.ownerRole !== null && detail.ownerRole.length > 0;
      const hasDeadline =
        detail.targetCompletionDate !== null && detail.targetCompletionDate.length > 0;
      const hasAC =
        detail.acceptanceCriteria.length > 0 &&
        detail.acceptanceCriteria.every((ac) => ac.verificationMethod.length > 0);
      if (hasOwner && hasDeadline && hasAC) {
        completeCount += 1;
      }
    }

    const completeness = completeCount / details.length;
    expect(completeness).toBeGreaterThanOrEqual(0.95);
  });
});

describe('blue-ocean:smart-actions', () => {
  it('all actions have ownerRole (role name, not user ID)', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const details = report.sections.remediationPlan.actionDetails;
    expect(details.length).toBeGreaterThan(0);

    for (const detail of details) {
      expect(detail.ownerRole).not.toBeNull();
      expect(detail.ownerRole!.length).toBeGreaterThan(0);
      // Must be a role name, not a user ID like "user-1"
      expect(detail.ownerRole).not.toMatch(/^user-/);
    }
  });

  it('all actions have deadline (ISO date format)', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const details = report.sections.remediationPlan.actionDetails;
    expect(details.length).toBeGreaterThan(0);

    for (const detail of details) {
      expect(detail.targetCompletionDate).not.toBeNull();
      expect(detail.targetCompletionDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('all actions have >= 1 acceptance criterion with verification method', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const details = report.sections.remediationPlan.actionDetails;
    expect(details.length).toBeGreaterThan(0);

    for (const detail of details) {
      expect(detail.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);
      for (const ac of detail.acceptanceCriteria) {
        expect(ac.criterion.length).toBeGreaterThan(0);
        expect(ac.verificationMethod.length).toBeGreaterThan(0);
      }
    }
  });

  it('effort estimates (S/M/L) with non-empty rationale', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const details = report.sections.remediationPlan.actionDetails;
    expect(details.length).toBeGreaterThan(0);

    for (const detail of details) {
      expect(['S', 'M', 'L']).toContain(detail.effortEstimate.size);
      expect(detail.effortEstimate.rationale.length).toBeGreaterThan(0);
    }
  });

  it('dependencies tracked (array exists on every action detail)', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const details = report.sections.remediationPlan.actionDetails;
    expect(details.length).toBeGreaterThan(0);

    for (const detail of details) {
      expect(Array.isArray(detail.dependencies)).toBe(true);
    }
  });
});

describe('blue-ocean:golden', () => {
  it('golden fixture produces >= 0.95 on all quality gate scores', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const gates = report.sections.qualityGates;

    expect(gates.rcaCoverageScore).toBeGreaterThanOrEqual(95);
    expect(gates.mockWatermarkScore).toBeGreaterThanOrEqual(95);
    expect(gates.domainConsistencyScore).toBeGreaterThanOrEqual(95);
    expect(gates.determinismScore).toBeGreaterThanOrEqual(95);
    expect(gates.overallScore).toBeGreaterThanOrEqual(95);
  });

  it('output is deterministic (same inputs produce same hash)', () => {
    const reportA = generateBlueOceanReport(blueOceanFixtureInput);
    const reportB = generateBlueOceanReport(blueOceanFixtureInput);

    expect(reportA.reportId).toBe(reportB.reportId);
    expect(computeBlueOceanReportHash(reportA)).toBe(computeBlueOceanReportHash(reportB));
  });

  it('no fabricated facts (all IDs trace to fixture input)', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);

    // All finding IDs in the report must exist in the input
    const inputFindingIds = new Set(blueOceanFixtureInput.findings.map((f) => f.id));
    for (const findingId of report.sections.dataLineage.findingIds) {
      expect(inputFindingIds.has(findingId)).toBe(true);
    }

    // All action IDs in the report must exist in the input
    const inputActionIds = new Set(blueOceanFixtureInput.actions.map((a) => a.id));
    for (const actionId of report.sections.dataLineage.actionIds) {
      expect(inputActionIds.has(actionId)).toBe(true);
    }

    // All evidence IDs in the report must exist in the input
    const inputEvidenceIds = new Set(
      (blueOceanFixtureInput.evidence ?? []).map((e) => e.id)
    );
    for (const evidenceId of report.sections.dataLineage.evidenceIds) {
      expect(inputEvidenceIds.has(evidenceId)).toBe(true);
    }
  });

  it('unknowns flagged (evidenceReadiness tracks missing; RCA has disconfirming tests)', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);

    // Evidence readiness tracks actions missing evidence
    expect(report.sections.evidenceReadiness).toBeDefined();
    expect(typeof report.sections.evidenceReadiness.actionsMissingEvidence).toBe('number');
    expect(typeof report.sections.evidenceReadiness.coveragePercentage).toBe('number');

    // RCA hypotheses all have disconfirming tests
    for (const rca of report.sections.rootCauseAnalysis) {
      for (const hypothesis of rca.hypotheses) {
        expect(hypothesis.disconfirmingTests.length).toBeGreaterThan(0);
      }
    }
  });
});
