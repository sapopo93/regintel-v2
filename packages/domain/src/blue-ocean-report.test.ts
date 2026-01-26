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
});
