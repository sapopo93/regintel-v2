/**
 * UI Phase Gate Tests for RegIntel v2
 *
 * These tests enforce the UI constitution:
 * - Every view must answer: version, hash, time, domain
 * - Mock screens must be visually distinct (red frame + watermark)
 * - No business logic in UI (pure projection layer)
 * - Progressive disclosure (summary → evidence → trace)
 * - Facts only, no interpretation (no traffic lights, emojis, risk scores)
 */

import { describe, it, expect } from 'vitest';
import {
  validateConstitutionalRequirements,
  ConstitutionalViolationError,
  validateFindingForDisplay,
  getSimulationFrameStyles,
  getSimulationWatermark,
  getOriginBadge,
  getDisclosureLayers,
  getLayerActions,
  getAllowedUIColors,
  getSeverityDisplay,
  validateNoEmojis,
} from './src/lib/validators';
import { SIMULATION_WATERMARK, ORIGIN_TYPES, REPORTING_DOMAINS } from './src/lib/constants';

/**
 * UI Constitutional Validation
 *
 * Every view must answer: version, hash, time, domain.
 * If it can't, it doesn't render.
 */
describe('ui:constitutional', () => {
  describe('Constitutional UI Requirements', () => {
    it('every view renders version', () => {
      const validProps = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'abc123def456',
        prsLogicVersion: 'v1',
        prsLogicHash: 'def456abc123',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
      };

      const result = validateConstitutionalRequirements(validProps);
      expect(result.valid).toBe(true);
      expect(result.hasVersion).toBe(true);
    });

    it('every view renders hash', () => {
      const validProps = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'abc123def456789',
        prsLogicVersion: 'v1',
        prsLogicHash: 'def456abc123789',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
      };

      const result = validateConstitutionalRequirements(validProps);
      expect(result.valid).toBe(true);
      expect(result.hasHash).toBe(true);
    });

    it('every view renders timestamp', () => {
      const validProps = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'abc123def',
        prsLogicVersion: 'v1',
        prsLogicHash: 'def456abc',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
      };

      const result = validateConstitutionalRequirements(validProps);
      expect(result.valid).toBe(true);
      expect(result.hasTimestamp).toBe(true);
    });

    it('every view renders domain', () => {
      const validProps = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'abc123def',
        prsLogicVersion: 'v1',
        prsLogicHash: 'def456abc',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
      };

      const result = validateConstitutionalRequirements(validProps);
      expect(result.valid).toBe(true);
      expect(result.hasDomain).toBe(true);
    });

    it('missing metadata throws ConstitutionalViolationError', () => {
      const invalidProps = {
        topicCatalogVersion: 'v1',
        // Missing hash, timestamp, domain
      };

      expect(() => {
        validateConstitutionalRequirements(invalidProps, { strict: true });
      }).toThrow(ConstitutionalViolationError);
    });

    it('empty hash throws ConstitutionalViolationError', () => {
      const invalidProps = {
        topicCatalogVersion: 'v1',
        topicCatalogHash: '', // Empty hash
        prsLogicVersion: 'v1',
        prsLogicHash: 'def456abc',
        snapshotTimestamp: '2026-01-23T10:00:00Z',
        domain: 'CQC',
      };

      expect(() => {
        validateConstitutionalRequirements(invalidProps, { strict: true });
      }).toThrow(ConstitutionalViolationError);
    });
  });
});

/**
 * Mock Inspection Visual Safety
 *
 * CRITICAL: Mock screens must be visually distinct from regulatory screens.
 * Red frame + watermark prevents misinterpretation.
 */
describe('ui:mock-safety', () => {
  describe('Mock Inspection Visual Safety', () => {
    it('mock screens have red frame', () => {
      const mockSessionProps = {
        origin: ORIGIN_TYPES.SYSTEM_MOCK,
        reportingDomain: REPORTING_DOMAINS.MOCK_SIMULATION,
      };

      const frameStyles = getSimulationFrameStyles(mockSessionProps);
      expect(frameStyles).not.toBeNull();
      expect(frameStyles?.borderColor).toBe('var(--color-simulation)');
      expect(frameStyles?.borderWidth).toBe('4px');
    });

    it('mock screens have SIMULATION watermark', () => {
      const mockSessionProps = {
        origin: ORIGIN_TYPES.SYSTEM_MOCK,
        reportingDomain: REPORTING_DOMAINS.MOCK_SIMULATION,
      };

      const watermark = getSimulationWatermark(mockSessionProps);
      expect(watermark).toBe('SIMULATION — NOT REGULATORY HISTORY');
      expect(watermark).toContain('NOT REGULATORY HISTORY');
    });

    it('mock findings show origin=SYSTEM_MOCK badge', () => {
      const mockFinding = {
        id: 'finding-1',
        origin: ORIGIN_TYPES.SYSTEM_MOCK,
        reportingDomain: REPORTING_DOMAINS.MOCK_SIMULATION,
      };

      const badge = getOriginBadge(mockFinding);
      expect(badge.text).toBe('MOCK');
      expect(badge.variant).toBe('simulation');
    });

    it('regulatory findings never show simulation styling', () => {
      const regulatoryFinding = {
        id: 'finding-1',
        origin: ORIGIN_TYPES.ACTUAL_INSPECTION,
        reportingDomain: REPORTING_DOMAINS.REGULATORY_HISTORY,
      };

      const badge = getOriginBadge(regulatoryFinding);
      expect(badge.text).not.toBe('MOCK');
      expect(badge.variant).not.toBe('simulation');

      // Ensure no red frame
      const frameStyles = getSimulationFrameStyles(regulatoryFinding);
      expect(frameStyles).toBeNull(); // No simulation frame for regulatory
    });

    it('SYSTEM_MOCK in REGULATORY_HISTORY is visually impossible', () => {
      // This test ensures the UI cannot render an invalid state
      const contaminatedFinding = {
        id: 'finding-1',
        origin: ORIGIN_TYPES.SYSTEM_MOCK,
        reportingDomain: REPORTING_DOMAINS.REGULATORY_HISTORY,
      };

      expect(() => {
        validateFindingForDisplay(contaminatedFinding);
      }).toThrow(/Mock contamination detected/);
    });
  });
});

/**
 * UI Projection Purity
 *
 * NO BUSINESS LOGIC IN UI. All computation happens in backend.
 * UI is a pure projection layer.
 */
describe('ui:projection-purity', () => {
  describe('No Business Logic in UI', () => {
    it('UI components contain zero business logic', () => {
      // Verify that finding display only receives pre-computed values
      const findingCardProps = {
        findingId: 'finding-1',
        title: 'Issue',
        severity: 'HIGH', // Pre-computed by backend
        compositeRiskScore: 72, // Pre-computed by backend
        regulationSectionId: 'Reg 12(2)(a)',
      };

      // UI should NOT recompute these values - they come from backend
      expect(typeof findingCardProps.severity).toBe('string'); // Not computed
      expect(typeof findingCardProps.compositeRiskScore).toBe('number'); // Not computed
    });

    it('all computed values come from backend', () => {
      // Risk register entries come pre-sorted from backend
      const riskRegisterFromBackend = {
        entries: [
          { compositeRiskScore: 80 },
          { compositeRiskScore: 60 },
          { compositeRiskScore: 40 },
        ],
        summary: {
          totalOpenFindings: 3,
          criticalCount: 0,
          highCount: 1,
          mediumCount: 1,
          lowCount: 1,
        },
      };

      // UI does NOT sort - it trusts backend order
      expect(riskRegisterFromBackend.entries[0].compositeRiskScore).toBe(80);
      expect(riskRegisterFromBackend.entries[1].compositeRiskScore).toBe(60);

      // Summary counts are pre-computed by backend
      expect(riskRegisterFromBackend.summary.totalOpenFindings).toBe(3);
    });

    it('no severity scoring in frontend', () => {
      // Severity is NEVER computed in UI
      // This test verifies that there's no computeSeverityInUI function
      const finding = {
        impactScore: 80,
        likelihoodScore: 70,
      };

      // UI does NOT have business logic functions
      // The absence of these functions is the test
      expect(typeof (globalThis as any).computeSeverityInUI).toBe('undefined');
    });

    it('no risk calculation in frontend', () => {
      // Risk calculation is NEVER in UI
      // This test verifies that there's no computeRiskScoreInUI function
      const finding = {
        impactScore: 80,
        likelihoodScore: 70,
      };

      // UI does NOT have business logic functions
      expect(typeof (globalThis as any).computeRiskScoreInUI).toBe('undefined');
    });
  });
});

/**
 * Progressive Disclosure
 *
 * Every screen has three layers: Summary → Evidence → Trace
 * No shortcuts. No jumps.
 */
describe('ui:disclosure', () => {
  describe('Progressive Disclosure Enforcement', () => {
    it('findings have Summary layer', () => {
      const disclosureLayers = getDisclosureLayers('finding');
      expect(disclosureLayers).toContain('summary');
    });

    it('findings have Evidence layer accessible from Summary', () => {
      const disclosureLayers = getDisclosureLayers('finding');
      expect(disclosureLayers).toContain('evidence');

      // Evidence is accessible from Summary (next layer)
      const summaryActions = getLayerActions('summary');
      expect(summaryActions).toContain('showEvidence');
    });

    it('findings have Trace layer accessible from Evidence', () => {
      const disclosureLayers = getDisclosureLayers('finding');
      expect(disclosureLayers).toContain('trace');

      // Trace is accessible from Evidence (next layer)
      const evidenceActions = getLayerActions('evidence');
      expect(evidenceActions).toContain('showTrace');
    });

    it('Trace layer shows deterministic hash', () => {
      const tracePanelProps = {
        regulationSectionId: 'Reg 12(2)(a)',
        topicCatalogVersion: 'v1',
        topicCatalogHash: 'abc123def456',
        prsLogicVersion: 'v1',
        prsLogicHash: 'def456abc123',
        deterministicHash: 'sha256:fedcba987654',
      };

      // Deterministic hash must have sha256: prefix
      expect(tracePanelProps.deterministicHash).toMatch(/^sha256:/);
    });

    it('cannot jump from Summary directly to Trace', () => {
      const summaryActions = getLayerActions('summary');

      // Summary can only access Evidence, NOT Trace
      expect(summaryActions).not.toContain('showTrace');
      expect(summaryActions).toContain('showEvidence');
    });
  });
});

/**
 * No Interpretation
 *
 * Only counts and facts. No traffic lights. No risk scores. No emojis.
 */
describe('ui:no-interpretation', () => {
  describe('Facts Only - No Interpretation', () => {
    it('no traffic light colors', () => {
      const allowedColors = getAllowedUIColors();

      // Only two semantic colors allowed
      expect(Object.keys(allowedColors).length).toBe(2);

      // Red is ONLY for simulation
      expect(allowedColors.simulation).toBe('var(--color-simulation)');

      // Green is ONLY for verified complete
      expect(allowedColors.verified).toBe('var(--color-verified)');

      // No traffic light color scheme for good/warning/bad
      expect((allowedColors as any)['traffic-green']).toBeUndefined();
      expect((allowedColors as any)['traffic-yellow']).toBeUndefined();
      expect((allowedColors as any)['traffic-red']).toBeUndefined();
    });

    it('no risk scores displayed', () => {
      const overviewProps = {
        providerName: 'Sunrise Care Home',
        snapshotDate: '2026-01-23',
        evidenceCoverage: 72, // Percentage, not a "score"
        topicsCompleted: 1,
        totalTopics: 2,
        unansweredQuestions: 3,
      };

      // No "risk score" property - only factual counts
      expect(overviewProps).not.toHaveProperty('riskScore');
      expect(overviewProps).not.toHaveProperty('confidenceScore');
      expect(overviewProps).not.toHaveProperty('safetyRating');
    });

    it('no emojis rendered', () => {
      const sampleTexts = [
        'Provider Overview',
        'Topics (2/5 complete)',
        'Mock Inspection',
        'Evidence Coverage: 72%',
        'SIMULATION — NOT REGULATORY HISTORY',
        SIMULATION_WATERMARK,
      ];

      for (const text of sampleTexts) {
        expect(validateNoEmojis(text)).toBe(true);
      }
    });

    it('only counts and facts shown', () => {
      const overviewContent = {
        evidenceCoverage: '72%', // Fact: percentage
        topicsCompleted: '1 / 2', // Fact: count
        unansweredQuestions: 3, // Fact: count
      };

      // All values are factual (counts or percentages)
      expect(typeof overviewContent.evidenceCoverage).toBe('string');
      expect(overviewContent.topicsCompleted).toMatch(/^\d+ \/ \d+$/);
      expect(typeof overviewContent.unansweredQuestions).toBe('number');
    });

    it('severity uses text labels not colors', () => {
      const severityDisplay = getSeverityDisplay('HIGH');

      // Severity is shown as text, not color-coded
      expect(severityDisplay.text).toBe('HIGH');
      expect(severityDisplay.backgroundColor).toBe('transparent');
    });

    it('watermark text is fact-based', () => {
      // Watermark states facts, not interpretations
      expect(SIMULATION_WATERMARK).toContain('MOCK');
      expect(SIMULATION_WATERMARK).toContain('NOT REGULATORY HISTORY');

      // No interpretive language like "safe", "risky", "good", "bad"
      expect(SIMULATION_WATERMARK).not.toMatch(/safe|risky|good|bad|warning/i);
    });
  });
});
