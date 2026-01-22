import { describe, it, expect } from 'vitest';
import {
  generateInspectionConfidenceReport,
  generateRiskRegister,
  generateActionVerificationView,
  validateOutputPurity,
} from './provider-outputs.js';
import { createInspectionFinding } from './inspection-finding.js';
import { createAction, ActionStatus } from './action.js';
import {
  Domain,
  FindingOrigin,
  ReportingDomain,
  Severity,
} from './types.js';

describe('outputs:purity', () => {
  describe('UI Derives Data Only from Canonical Spine', () => {
    it('UI derives data only from canonical spine', () => {
      // Create spine data (findings and actions)
      const finding1 = createInspectionFinding({
        id: 'finding-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        origin: FindingOrigin.ACTUAL_INSPECTION,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-1',
        regulationSectionId: '8.1',
        title: 'Fire safety issue',
        description: 'Missing fire extinguisher',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-15T10:00:00Z',
        identifiedBy: 'inspector-1',
      });

      const finding2 = createInspectionFinding({
        id: 'finding-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        origin: FindingOrigin.ACTUAL_INSPECTION,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-1',
        regulationSectionId: '10.1',
        title: 'Staffing issue',
        description: 'Insufficient staff',
        severity: Severity.MEDIUM,
        impactScore: 60,
        likelihoodScore: 60,
        identifiedAt: '2024-01-15T11:00:00Z',
        identifiedBy: 'inspector-1',
      });

      const action1 = createAction({
        id: 'action-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        findingId: 'finding-1',
        description: 'Purchase fire extinguisher',
        assignedTo: 'user-1',
        targetCompletionDate: '2024-02-01T00:00:00Z',
        createdBy: 'user-1',
      });

      const findings = [finding1, finding2];
      const actions = [action1];

      // Generate outputs from spine
      const report = generateInspectionConfidenceReport({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings,
        actions,
      });

      const riskRegister = generateRiskRegister({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings,
        actions,
      });

      const actionView = generateActionVerificationView({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        actions,
        findings,
      });

      // Validate that outputs derive ONLY from spine
      const purity = validateOutputPurity({
        findings,
        actions,
        report,
        riskRegister,
        actionView,
      });

      expect(purity.pure).toBe(true);
      expect(purity.violations).toHaveLength(0);
    });

    it('no business logic in frontend - all computation in domain layer', () => {
      // Create findings
      const findings = [
        createInspectionFinding({
          id: 'finding-1',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.ACTUAL_INSPECTION,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY,
          contextSnapshotId: 'snapshot-1',
          regulationId: 'reg-1',
          regulationSectionId: '8.1',
          title: 'Critical issue',
          description: 'Serious problem',
          severity: Severity.CRITICAL,
          impactScore: 90,
          likelihoodScore: 80,
          identifiedAt: '2024-01-15T10:00:00Z',
          identifiedBy: 'inspector-1',
        }),
      ];

      // Generate report (ALL computation happens here)
      const report = generateInspectionConfidenceReport({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings,
        actions: [],
      });

      // Report contains computed values (not raw data)
      expect(report.overallConfidenceScore).toBeDefined();
      expect(report.overallConfidenceScore).toBeGreaterThanOrEqual(0);
      expect(report.overallConfidenceScore).toBeLessThanOrEqual(100);

      // Findings summary is computed
      expect(report.findingsSummary.total).toBe(1);
      expect(report.findingsSummary.critical).toBe(1);

      // Readiness indicators are computed
      expect(report.readinessIndicators.hasOpenCriticalFindings).toBe(true);
    });

    it('outputs contain summary statistics computed from spine', () => {
      const findings = [
        createInspectionFinding({
          id: 'finding-1',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.ACTUAL_INSPECTION,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY,
          contextSnapshotId: 'snapshot-1',
          regulationId: 'reg-1',
          regulationSectionId: '8.1',
          title: 'High severity issue',
          description: 'Problem',
          severity: Severity.HIGH,
          impactScore: 80,
          likelihoodScore: 70,
          identifiedAt: '2024-01-15T10:00:00Z',
          identifiedBy: 'inspector-1',
        }),
        createInspectionFinding({
          id: 'finding-2',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.ACTUAL_INSPECTION,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY,
          contextSnapshotId: 'snapshot-1',
          regulationId: 'reg-1',
          regulationSectionId: '10.1',
          title: 'Medium severity issue',
          description: 'Problem',
          severity: Severity.MEDIUM,
          impactScore: 60,
          likelihoodScore: 60,
          identifiedAt: '2024-01-15T11:00:00Z',
          identifiedBy: 'inspector-1',
        }),
        createInspectionFinding({
          id: 'finding-3',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.ACTUAL_INSPECTION,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY,
          contextSnapshotId: 'snapshot-1',
          regulationId: 'reg-1',
          regulationSectionId: '12.1',
          title: 'Low severity issue',
          description: 'Problem',
          severity: Severity.LOW,
          impactScore: 40,
          likelihoodScore: 50,
          identifiedAt: '2024-01-15T12:00:00Z',
          identifiedBy: 'inspector-1',
        }),
      ];

      // Generate risk register
      const riskRegister = generateRiskRegister({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings,
        actions: [],
      });

      // Summary is computed from findings
      expect(riskRegister.summary.totalOpenFindings).toBe(3);
      expect(riskRegister.summary.highCount).toBe(1);
      expect(riskRegister.summary.mediumCount).toBe(1);
      expect(riskRegister.summary.lowCount).toBe(1);
      expect(riskRegister.summary.criticalCount).toBe(0);

      // Entries are sorted by risk (highest first)
      expect(riskRegister.entries[0].compositeRiskScore).toBeGreaterThanOrEqual(
        riskRegister.entries[1].compositeRiskScore
      );
      expect(riskRegister.entries[1].compositeRiskScore).toBeGreaterThanOrEqual(
        riskRegister.entries[2].compositeRiskScore
      );
    });

    it('action verification view derives from actions and findings only', () => {
      const finding1 = createInspectionFinding({
        id: 'finding-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        origin: FindingOrigin.ACTUAL_INSPECTION,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-1',
        regulationSectionId: '8.1',
        title: 'Fire safety issue',
        description: 'Missing fire extinguisher',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-15T10:00:00Z',
        identifiedBy: 'inspector-1',
      });

      const action1 = createAction({
        id: 'action-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        findingId: 'finding-1',
        description: 'Purchase fire extinguisher',
        assignedTo: 'user-1',
        targetCompletionDate: '2024-02-01T00:00:00Z',
        createdBy: 'user-1',
      });

      const action2 = createAction({
        id: 'action-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        findingId: 'finding-1',
        description: 'Install fire extinguisher',
        assignedTo: 'user-2',
        targetCompletionDate: '2024-02-05T00:00:00Z',
        createdBy: 'user-1',
      });

      const actionView = generateActionVerificationView({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        actions: [action1, action2],
        findings: [finding1],
      });

      // Summary is computed
      expect(actionView.summary.total).toBe(2);
      expect(actionView.summary.open).toBe(2);
      expect(actionView.summary.verified).toBe(0);

      // Entries contain computed fields
      expect(actionView.entries[0].daysOpen).toBeGreaterThanOrEqual(0);
      expect(actionView.entries[0].findingTitle).toBe('Fire safety issue');
    });

    it('detects impurity if output data does not match spine', () => {
      const findings = [
        createInspectionFinding({
          id: 'finding-1',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.ACTUAL_INSPECTION,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY,
          contextSnapshotId: 'snapshot-1',
          regulationId: 'reg-1',
          regulationSectionId: '8.1',
          title: 'Issue',
          description: 'Problem',
          severity: Severity.HIGH,
          impactScore: 80,
          likelihoodScore: 70,
          identifiedAt: '2024-01-15T10:00:00Z',
          identifiedBy: 'inspector-1',
        }),
      ];

      // Generate outputs
      const report = generateInspectionConfidenceReport({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings,
        actions: [],
      });

      const riskRegister = generateRiskRegister({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings,
        actions: [],
      });

      const actionView = generateActionVerificationView({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        actions: [],
        findings,
      });

      // Now test with DIFFERENT spine data (simulate impurity)
      const differentFindings = [
        ...findings,
        createInspectionFinding({
          id: 'finding-2',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.ACTUAL_INSPECTION,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY,
          contextSnapshotId: 'snapshot-1',
          regulationId: 'reg-1',
          regulationSectionId: '10.1',
          title: 'Another issue',
          description: 'Problem',
          severity: Severity.MEDIUM,
          impactScore: 60,
          likelihoodScore: 60,
          identifiedAt: '2024-01-15T11:00:00Z',
          identifiedBy: 'inspector-1',
        }),
      ];

      // Validate purity (should fail because findings don't match)
      const purity = validateOutputPurity({
        findings: differentFindings, // Different from what was used to generate report
        actions: [],
        report,
        riskRegister,
        actionView,
      });

      expect(purity.pure).toBe(false);
      expect(purity.violations.length).toBeGreaterThan(0);
    });

    it('inspection confidence report reflects remediation progress', () => {
      const finding1 = createInspectionFinding({
        id: 'finding-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        origin: FindingOrigin.ACTUAL_INSPECTION,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-1',
        regulationSectionId: '8.1',
        title: 'Critical issue',
        description: 'Serious problem',
        severity: Severity.CRITICAL,
        impactScore: 90,
        likelihoodScore: 80,
        identifiedAt: '2024-01-15T10:00:00Z',
        identifiedBy: 'inspector-1',
      });

      // Create action and mark as verified
      let action1 = createAction({
        id: 'action-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        findingId: 'finding-1',
        description: 'Fix critical issue',
        assignedTo: 'user-1',
        targetCompletionDate: '2024-02-01T00:00:00Z',
        createdBy: 'user-1',
      });

      // Progress through action lifecycle
      action1 = { ...action1, status: ActionStatus.IN_PROGRESS };
      action1 = { ...action1, status: ActionStatus.PENDING_VERIFICATION };
      action1 = {
        ...action1,
        status: ActionStatus.VERIFIED_CLOSED,
        completedAt: '2024-01-20T10:00:00Z',
        verifiedAt: '2024-01-21T10:00:00Z',
      };

      const report = generateInspectionConfidenceReport({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings: [finding1],
        actions: [action1],
      });

      // Report shows remediation progress
      expect(report.remediationSummary.verifiedActions).toBe(1);
      expect(report.readinessIndicators.allActionsVerified).toBe(true);

      // Confidence score should be higher with verified remediation
      const reportWithoutRemediation = generateInspectionConfidenceReport({
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        asOfSnapshot: 'snapshot-1',
        findings: [finding1],
        actions: [],
      });

      expect(report.overallConfidenceScore).toBeGreaterThan(
        reportWithoutRemediation.overallConfidenceScore
      );
    });
  });
});
