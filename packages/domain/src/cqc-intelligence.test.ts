import { describe, it, expect } from 'vitest';
import {
  generateAlerts,
  deduplicateAlerts,
  capAlerts,
  alertDeduplicationKey,
  isAlertArchived,
  type CqcReportForIntelligence,
  type ProviderCoverageForIntelligence,
  type CqcIntelligenceAlert,
} from './cqc-intelligence';

function makeCoverage(overrides: Partial<ProviderCoverageForIntelligence> = {}): ProviderCoverageForIntelligence {
  const perQS: Record<string, number> = {};
  // Default all QS to 0%
  for (const id of ['S1','S2','S3','S4','S5','S6','S7','S8','E1','E2','E3','E4','E5','E6','C1','C2','C3','C4','C5','R1','R2','R3','R4','R5','R6','R7','W1','W2','W3','W4','W5','W6','W7','W8']) {
    perQS[id] = 0;
  }
  return {
    perQualityStatement: { ...perQS, ...overrides.perQualityStatement },
    perKeyQuestion: { SAFE: 0, EFFECTIVE: 0, CARING: 0, RESPONSIVE: 0, WELL_LED: 0, ...overrides.perKeyQuestion } as any,
  };
}

function makeReport(overrides: Partial<CqcReportForIntelligence> = {}): CqcReportForIntelligence {
  return {
    locationId: '1-12345',
    locationName: 'Test Care Home',
    serviceType: 'Social Care Org',
    reportDate: '2026-03-01',
    keyQuestionRatings: {},
    keyQuestionFindings: {},
    ...overrides,
  };
}

describe('cqc-intelligence', () => {
  describe('generateAlerts', () => {
    it('generates OUTSTANDING_SIGNAL for Outstanding rating', () => {
      const report = makeReport({
        keyQuestionRatings: { safe: 'Outstanding' },
        keyQuestionFindings: { safe: 'Staff demonstrated exceptional infection control practices.' },
      });

      const alerts = generateAlerts({
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        report,
        coverage: makeCoverage({ perQualityStatement: { S7: 35 } }),
      });

      const outstandingAlerts = alerts.filter((a) => a.intelligenceType === 'OUTSTANDING_SIGNAL');
      expect(outstandingAlerts.length).toBeGreaterThan(0);

      // All should be for SAFE key question
      expect(outstandingAlerts.every((a) => a.keyQuestion === 'SAFE')).toBe(true);

      // S7 alert should have 35% coverage
      const s7Alert = outstandingAlerts.find((a) => a.qualityStatementId === 'S7');
      expect(s7Alert).toBeDefined();
      expect(s7Alert!.providerCoveragePercent).toBe(35);
    });

    it('generates RISK_SIGNAL for Requires Improvement rating', () => {
      const report = makeReport({
        keyQuestionRatings: { effective: 'Requires Improvement' },
      });

      const alerts = generateAlerts({
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        report,
        coverage: makeCoverage(),
      });

      const riskAlerts = alerts.filter((a) => a.intelligenceType === 'RISK_SIGNAL');
      expect(riskAlerts.length).toBeGreaterThan(0);
      expect(riskAlerts.every((a) => a.keyQuestion === 'EFFECTIVE')).toBe(true);
    });

    it('generates RISK_SIGNAL for Inadequate rating', () => {
      const report = makeReport({
        keyQuestionRatings: { caring: 'Inadequate' },
      });

      const alerts = generateAlerts({
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        report,
        coverage: makeCoverage(),
      });

      expect(alerts.filter((a) => a.intelligenceType === 'RISK_SIGNAL').length).toBeGreaterThan(0);
    });

    it('generates no alerts for Good rating', () => {
      const report = makeReport({
        keyQuestionRatings: { safe: 'Good', effective: 'Good' },
      });

      const alerts = generateAlerts({
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        report,
        coverage: makeCoverage(),
      });

      // Good is expected — no alerts generated from rating
      expect(alerts.length).toBe(0);
    });

    it('generates text-based OUTSTANDING_SIGNAL from findings containing outstanding phrases', () => {
      const report = makeReport({
        keyQuestionRatings: { wellLed: 'Good' }, // Not "Outstanding" — triggers text-based detection
        keyQuestionFindings: { wellLed: 'The service demonstrated exemplary leadership and innovation.' },
      });

      const alerts = generateAlerts({
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        report,
        coverage: makeCoverage(),
      });

      const textAlerts = alerts.filter((a) => a.intelligenceType === 'OUTSTANDING_SIGNAL');
      expect(textAlerts.length).toBe(1);
      expect(textAlerts[0].findingText).toContain('exemplary');
    });

    it('calculates HIGH severity for low coverage risk signals', () => {
      const report = makeReport({
        keyQuestionRatings: { safe: 'Requires Improvement' },
      });

      const alerts = generateAlerts({
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        report,
        coverage: makeCoverage(), // All 0% coverage
      });

      const highAlerts = alerts.filter((a) => a.severity === 'HIGH');
      expect(highAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('deduplicateAlerts', () => {
    it('removes alerts with same source+QS+date', () => {
      const alert: CqcIntelligenceAlert = {
        id: 'demo:alert-1',
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        intelligenceType: 'RISK_SIGNAL',
        sourceLocationId: '1-12345',
        sourceLocationName: 'Test',
        sourceServiceType: 'Social Care Org',
        reportDate: '2026-03-01',
        keyQuestion: 'SAFE',
        qualityStatementId: 'S7',
        qualityStatementTitle: 'IPC',
        findingText: 'test',
        providerCoveragePercent: 35,
        severity: 'HIGH',
        createdAt: new Date().toISOString(),
        dismissedAt: null,
      };

      const existingKeys = new Set(['1-12345:S7:2026-03-01:RISK_SIGNAL']);
      const result = deduplicateAlerts([alert], existingKeys);
      expect(result).toHaveLength(0);
    });

    it('keeps both RISK_SIGNAL and OUTSTANDING_SIGNAL for same location+QS+date', () => {
      const baseAlert: CqcIntelligenceAlert = {
        id: 'demo:alert-1',
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: ['demo:fac-1'],
        intelligenceType: 'RISK_SIGNAL',
        sourceLocationId: '1-12345',
        sourceLocationName: 'Test',
        sourceServiceType: 'Social Care Org',
        reportDate: '2026-03-01',
        keyQuestion: 'SAFE',
        qualityStatementId: 'S7',
        qualityStatementTitle: 'IPC',
        findingText: 'test',
        providerCoveragePercent: 35,
        severity: 'HIGH',
        createdAt: new Date().toISOString(),
        dismissedAt: null,
      };
      const outstandingAlert: CqcIntelligenceAlert = {
        ...baseAlert,
        id: 'demo:alert-2',
        intelligenceType: 'OUTSTANDING_SIGNAL',
      };

      const result = deduplicateAlerts([baseAlert, outstandingAlert], new Set());
      expect(result).toHaveLength(2);
    });

    it('keeps alerts with different keys', () => {
      const alert: CqcIntelligenceAlert = {
        id: 'demo:alert-1',
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: [],
        intelligenceType: 'RISK_SIGNAL',
        sourceLocationId: '1-12345',
        sourceLocationName: 'Test',
        sourceServiceType: 'Social Care Org',
        reportDate: '2026-03-01',
        keyQuestion: 'SAFE',
        qualityStatementId: 'S7',
        qualityStatementTitle: 'IPC',
        findingText: 'test',
        providerCoveragePercent: 35,
        severity: 'HIGH',
        createdAt: new Date().toISOString(),
        dismissedAt: null,
      };

      const existingKeys = new Set(['1-99999:S7:2026-03-01']); // Different location
      const result = deduplicateAlerts([alert], existingKeys);
      expect(result).toHaveLength(1);
    });
  });

  describe('capAlerts', () => {
    it('caps alerts at maxCount, prioritised by severity then coverage', () => {
      const makeAlert = (severity: 'HIGH' | 'MEDIUM' | 'LOW', coverage: number): CqcIntelligenceAlert => ({
        id: `demo:alert-${Math.random()}`,
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: [],
        intelligenceType: 'RISK_SIGNAL',
        sourceLocationId: '1-12345',
        sourceLocationName: 'Test',
        sourceServiceType: 'Social Care Org',
        reportDate: '2026-03-01',
        keyQuestion: 'SAFE',
        qualityStatementId: 'S1',
        qualityStatementTitle: 'Test',
        findingText: 'test',
        providerCoveragePercent: coverage,
        severity,
        createdAt: new Date().toISOString(),
        dismissedAt: null,
      });

      const alerts = [
        makeAlert('LOW', 80),
        makeAlert('HIGH', 10),
        makeAlert('MEDIUM', 50),
        makeAlert('HIGH', 5),
        makeAlert('LOW', 90),
      ];

      const capped = capAlerts(alerts, 3);
      expect(capped).toHaveLength(3);
      // First two should be HIGH severity, sorted by lowest coverage
      expect(capped[0].severity).toBe('HIGH');
      expect(capped[0].providerCoveragePercent).toBe(5);
      expect(capped[1].severity).toBe('HIGH');
      expect(capped[1].providerCoveragePercent).toBe(10);
      expect(capped[2].severity).toBe('MEDIUM');
    });
  });

  describe('isAlertArchived', () => {
    it('returns true for alerts older than 90 days', () => {
      const alert: CqcIntelligenceAlert = {
        id: 'demo:alert-1',
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: [],
        intelligenceType: 'RISK_SIGNAL',
        sourceLocationId: '1-12345',
        sourceLocationName: 'Test',
        sourceServiceType: 'Social Care Org',
        reportDate: '2026-01-01',
        keyQuestion: 'SAFE',
        qualityStatementId: 'S1',
        qualityStatementTitle: 'Test',
        findingText: 'test',
        providerCoveragePercent: 0,
        severity: 'HIGH',
        createdAt: '2025-11-01T00:00:00.000Z', // ~130 days ago
        dismissedAt: null,
      };

      expect(isAlertArchived(alert, new Date('2026-03-08'))).toBe(true);
    });

    it('returns false for recent alerts', () => {
      const alert: CqcIntelligenceAlert = {
        id: 'demo:alert-1',
        tenantId: 'demo',
        providerId: 'demo:provider-1',
        facilityIds: [],
        intelligenceType: 'RISK_SIGNAL',
        sourceLocationId: '1-12345',
        sourceLocationName: 'Test',
        sourceServiceType: 'Social Care Org',
        reportDate: '2026-03-01',
        keyQuestion: 'SAFE',
        qualityStatementId: 'S1',
        qualityStatementTitle: 'Test',
        findingText: 'test',
        providerCoveragePercent: 0,
        severity: 'HIGH',
        createdAt: '2026-03-01T00:00:00.000Z', // 7 days ago
        dismissedAt: null,
      };

      expect(isAlertArchived(alert, new Date('2026-03-08'))).toBe(false);
    });
  });
});
