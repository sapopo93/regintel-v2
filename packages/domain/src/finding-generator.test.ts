/**
 * Finding Generator Tests (Phase 9c: Evidence)
 *
 * Tests deterministic DraftFinding generation from mock session answers.
 */

import { describe, it, expect } from 'vitest';
import {
  computeWhyHash,
  analyzeTopicEvidence,
  generateMissingEvidenceFinding,
  analyzeSessionForFindings,
  finalizeDraftFindings,
  promoteMockFindingToRegulatory,
  DraftFindingStatus,
} from './finding-generator.js';
import { createMockInspectionSession, openTopic } from './mock-inspection-engine.js';
import { createTopic, EvidenceType, QuestionMode } from './topic-catalog.js';
import { createProviderContextSnapshot } from './provider-context-snapshot.js';
import { createEvidenceRecord } from './evidence.js';
import {
  createInspectionFinding,
  MockContaminationError,
} from './inspection-finding.js';
import {
  Domain,
  ProviderRegulatoryState,
  FindingOrigin,
  ReportingDomain,
  Severity,
} from './types.js';

describe('Finding Generator', () => {
  describe('computeWhyHash', () => {
    it('should compute deterministic hash', () => {
      const params = {
        topicId: 'topic-safeguarding',
        missingEvidenceTypes: [EvidenceType.POLICY, EvidenceType.TRAINING_LOG],
        regSectionPath: 'Reg13/Safeguarding',
        prsSnapshotHash: 'abc123',
      };

      const hash1 = computeWhyHash(params);
      const hash2 = computeWhyHash(params);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should sort missing evidence types for determinism', () => {
      const params1 = {
        topicId: 'topic-safeguarding',
        missingEvidenceTypes: [EvidenceType.POLICY, EvidenceType.TRAINING_LOG],
        regSectionPath: 'Reg13/Safeguarding',
        prsSnapshotHash: 'abc123',
      };

      const params2 = {
        topicId: 'topic-safeguarding',
        missingEvidenceTypes: [EvidenceType.TRAINING_LOG, EvidenceType.POLICY],
        regSectionPath: 'Reg13/Safeguarding',
        prsSnapshotHash: 'abc123',
      };

      const hash1 = computeWhyHash(params1);
      const hash2 = computeWhyHash(params2);

      expect(hash1).toBe(hash2); // Order doesn't matter
    });

    it('should produce different hashes for different inputs', () => {
      const params1 = {
        topicId: 'topic-safeguarding',
        missingEvidenceTypes: [EvidenceType.POLICY],
        regSectionPath: 'Reg13/Safeguarding',
        prsSnapshotHash: 'abc123',
      };

      const params2 = {
        topicId: 'topic-medications',
        missingEvidenceTypes: [EvidenceType.POLICY],
        regSectionPath: 'Reg13/Safeguarding',
        prsSnapshotHash: 'abc123',
      };

      const hash1 = computeWhyHash(params1);
      const hash2 = computeWhyHash(params2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('analyzeTopicEvidence', () => {
    it('should identify missing evidence types', () => {
      const topic = createTopic({
        topicId: 'topic-safeguarding',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding vulnerable adults',
        priority: 90,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg13/Safeguarding'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.POLICY, minCount: 1, required: true },
            { evidenceType: EvidenceType.TRAINING_LOG, minCount: 1, required: true },
            { evidenceType: EvidenceType.AUDIT_REPORT, minCount: 1, required: false },
          ],
          preferredOrder: [EvidenceType.POLICY, EvidenceType.TRAINING_LOG, EvidenceType.AUDIT_REPORT],
          stopIfMissingConfirmed: true,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-safeguarding',
          transitionTemplateId: 'transition-safeguarding',
          closingTemplateId: 'closing-safeguarding',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-safeguarding-policy'],
          followupQuestionIds: ['q-safeguarding-training'],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 2,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      // Provider has only POLICY evidence, missing TRAINING_LOG and AUDIT_REPORT
      const providedEvidence = [
        createEvidenceRecord({
          id: 'evidence-1',
          tenantId: 'tenant-1',
          blobHashes: ['hash1'],
          primaryBlobHash: 'hash1',
          title: 'Safeguarding Policy',
          evidenceType: 'POLICY',
          collectedAt: '2024-01-01T00:00:00.000Z',
          collectedBy: 'user-1',
          createdBy: 'user-1',
        }),
      ];

      const analysis = analyzeTopicEvidence(topic, providedEvidence);

      expect(analysis.topicId).toBe('topic-safeguarding');
      expect(analysis.missingEvidence).toContain(EvidenceType.TRAINING_LOG);
      expect(analysis.missingEvidence).toContain(EvidenceType.AUDIT_REPORT);
      expect(analysis.hasRequiredGaps).toBe(true); // TRAINING_LOG is required
    });

    it('should handle no missing evidence', () => {
      const topic = createTopic({
        topicId: 'topic-medications',
        domain: Domain.CQC,
        version: 1,
        title: 'Medications',
        description: 'Safe management of medications',
        priority: 85,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg12/Medications'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.PROCEDURE, minCount: 1, required: true },
          ],
          preferredOrder: [EvidenceType.PROCEDURE],
          stopIfMissingConfirmed: false,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-meds',
          transitionTemplateId: 'transition-meds',
          closingTemplateId: 'closing-meds',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-meds-procedure'],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      const providedEvidence = [
        createEvidenceRecord({
          id: 'evidence-2',
          tenantId: 'tenant-1',
          blobHashes: ['hash2'],
          primaryBlobHash: 'hash2',
          title: 'Medication Procedure',
          evidenceType: 'PROCEDURE',
          collectedAt: '2024-01-01T00:00:00.000Z',
          collectedBy: 'user-1',
          createdBy: 'user-1',
        }),
      ];

      const analysis = analyzeTopicEvidence(topic, providedEvidence);

      expect(analysis.missingEvidence).toHaveLength(0);
      expect(analysis.hasRequiredGaps).toBe(false);
    });
  });

  describe('generateMissingEvidenceFinding', () => {
    it('should generate finding with correct fields', () => {
      const contextSnapshot = createProviderContextSnapshot({
        id: 'snapshot-1',
        tenantId: 'tenant-1',
        asOf: '2024-01-01T00:00:00.000Z',
        regulatoryState: ProviderRegulatoryState.ESTABLISHED,
        metadata: {
          providerName: 'Test Care Home',
          serviceTypes: ['residential'],
        },
        enabledDomains: [Domain.CQC],
        activeRegulationIds: ['reg-cqc-2014'],
        activePolicyIds: [],
        createdBy: 'system',
      });

      const topic = createTopic({
        topicId: 'topic-safeguarding',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding vulnerable adults',
        priority: 90,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg13/Safeguarding'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.POLICY, minCount: 1, required: true },
          ],
          preferredOrder: [EvidenceType.POLICY],
          stopIfMissingConfirmed: true,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-safeguarding',
          transitionTemplateId: 'transition-safeguarding',
          closingTemplateId: 'closing-safeguarding',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-safeguarding-policy'],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      const finding = generateMissingEvidenceFinding({
        sessionId: 'session-1',
        topicId: 'topic-safeguarding',
        topic,
        missingEvidenceTypes: [EvidenceType.POLICY],
        contextSnapshot,
        regulationId: 'reg-cqc-2014',
        regSectionPath: 'Reg13/Safeguarding',
        tenantId: 'tenant-1',
        identifiedBy: 'inspector-1',
      });

      expect(finding.origin).toBe(FindingOrigin.SYSTEM_MOCK);
      expect(finding.reportingDomain).toBe(ReportingDomain.MOCK_SIMULATION);
      expect(finding.status).toBe(DraftFindingStatus.DRAFT);
      expect(finding.regulationSectionId).toBe('Reg13/Safeguarding');
      expect(finding.missingEvidenceTypes).toContain(EvidenceType.POLICY);
      expect(finding.whyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(finding.severity).toBe(Severity.HIGH); // Required evidence missing
    });

    it('should compute deterministic whyHash', () => {
      const contextSnapshot = createProviderContextSnapshot({
        id: 'snapshot-1',
        tenantId: 'tenant-1',
        asOf: '2024-01-01T00:00:00.000Z',
        regulatoryState: ProviderRegulatoryState.ESTABLISHED,
        metadata: {
          providerName: 'Test Care Home',
          serviceTypes: ['residential'],
        },
        enabledDomains: [Domain.CQC],
        activeRegulationIds: ['reg-cqc-2014'],
        activePolicyIds: [],
        createdBy: 'system',
      });

      const topic = createTopic({
        topicId: 'topic-safeguarding',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding vulnerable adults',
        priority: 90,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg13/Safeguarding'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.POLICY, minCount: 1, required: true },
          ],
          preferredOrder: [EvidenceType.POLICY],
          stopIfMissingConfirmed: true,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-safeguarding',
          transitionTemplateId: 'transition-safeguarding',
          closingTemplateId: 'closing-safeguarding',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-safeguarding-policy'],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      const finding1 = generateMissingEvidenceFinding({
        sessionId: 'session-1',
        topicId: 'topic-safeguarding',
        topic,
        missingEvidenceTypes: [EvidenceType.POLICY],
        contextSnapshot,
        regulationId: 'reg-cqc-2014',
        regSectionPath: 'Reg13/Safeguarding',
        tenantId: 'tenant-1',
        identifiedBy: 'inspector-1',
      });

      const finding2 = generateMissingEvidenceFinding({
        sessionId: 'session-2', // Different session
        topicId: 'topic-safeguarding',
        topic,
        missingEvidenceTypes: [EvidenceType.POLICY],
        contextSnapshot,
        regulationId: 'reg-cqc-2014',
        regSectionPath: 'Reg13/Safeguarding',
        tenantId: 'tenant-1',
        identifiedBy: 'inspector-1',
      });

      // whyHash should be same (deterministic), even though sessionId differs
      expect(finding1.whyHash).toBe(finding2.whyHash);
    });
  });

  describe('analyzeSessionForFindings', () => {
    it('should generate findings for all topics with missing evidence', () => {
      const contextSnapshot = createProviderContextSnapshot({
        id: 'snapshot-1',
        tenantId: 'tenant-1',
        asOf: '2024-01-01T00:00:00.000Z',
        regulatoryState: ProviderRegulatoryState.ESTABLISHED,
        metadata: {
          providerName: 'Test Care Home',
          serviceTypes: ['residential'],
        },
        enabledDomains: [Domain.CQC],
        activeRegulationIds: ['reg-cqc-2014'],
        activePolicyIds: [],
        createdBy: 'system',
      });

      const logicProfile = {
        id: 'profile-1',
        tenantId: 'tenant-1',
        domain: Domain.CQC,
        providerRegulatoryState: ProviderRegulatoryState.ESTABLISHED,
        overlayStates: [],
        severityRules: [],
        rigorRules: [],
        defaultMaxFollowUps: 3,
        defaultMaxQuestions: 20,
        profileHash: 'hash123',
        version: 1,
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        createdBy: 'system',
      };

      let session = createMockInspectionSession({
        id: 'session-1',
        tenantId: 'tenant-1',
        domain: Domain.CQC,
        contextSnapshot,
        logicProfile,
        createdBy: 'inspector-1',
      });

      // Open topics
      session = openTopic(session, 'topic-safeguarding');
      session = openTopic(session, 'topic-medications');

      const topicSafeguarding = createTopic({
        topicId: 'topic-safeguarding',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding vulnerable adults',
        priority: 90,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg13/Safeguarding'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.POLICY, minCount: 1, required: true },
          ],
          preferredOrder: [EvidenceType.POLICY],
          stopIfMissingConfirmed: true,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-safeguarding',
          transitionTemplateId: 'transition-safeguarding',
          closingTemplateId: 'closing-safeguarding',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-safeguarding-policy'],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      const topicMedications = createTopic({
        topicId: 'topic-medications',
        domain: Domain.CQC,
        version: 1,
        title: 'Medications',
        description: 'Safe management of medications',
        priority: 85,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg12/Medications'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.PROCEDURE, minCount: 1, required: true },
          ],
          preferredOrder: [EvidenceType.PROCEDURE],
          stopIfMissingConfirmed: false,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-meds',
          transitionTemplateId: 'transition-meds',
          closingTemplateId: 'closing-meds',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-meds-procedure'],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      const topics = new Map([
        ['topic-safeguarding', topicSafeguarding],
        ['topic-medications', topicMedications],
      ]);

      // No evidence provided for either topic
      const providedEvidenceByTopic = new Map();

      const result = analyzeSessionForFindings({
        session,
        topics,
        providedEvidenceByTopic,
        contextSnapshot,
        tenantId: 'tenant-1',
      });

      expect(result.topicAnalyses).toHaveLength(2);
      expect(result.generatedFindings).toHaveLength(2);
      expect(result.generatedFindings[0].origin).toBe(FindingOrigin.SYSTEM_MOCK);
      expect(result.generatedFindings[0].reportingDomain).toBe(ReportingDomain.MOCK_SIMULATION);
    });
  });

  describe('finalizeDraftFindings', () => {
    it('should convert DraftFindings to InspectionFindings', () => {
      const contextSnapshot = createProviderContextSnapshot({
        id: 'snapshot-1',
        tenantId: 'tenant-1',
        asOf: '2024-01-01T00:00:00.000Z',
        regulatoryState: ProviderRegulatoryState.ESTABLISHED,
        metadata: {
          providerName: 'Test Care Home',
          serviceTypes: ['residential'],
        },
        enabledDomains: [Domain.CQC],
        activeRegulationIds: ['reg-cqc-2014'],
        activePolicyIds: [],
        createdBy: 'system',
      });

      const topic = createTopic({
        topicId: 'topic-safeguarding',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding vulnerable adults',
        priority: 90,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg13/Safeguarding'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.POLICY, minCount: 1, required: true },
          ],
          preferredOrder: [EvidenceType.POLICY],
          stopIfMissingConfirmed: true,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-safeguarding',
          transitionTemplateId: 'transition-safeguarding',
          closingTemplateId: 'closing-safeguarding',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-safeguarding-policy'],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      const draftFinding = generateMissingEvidenceFinding({
        sessionId: 'session-1',
        topicId: 'topic-safeguarding',
        topic,
        missingEvidenceTypes: [EvidenceType.POLICY],
        contextSnapshot,
        regulationId: 'reg-cqc-2014',
        regSectionPath: 'Reg13/Safeguarding',
        tenantId: 'tenant-1',
        identifiedBy: 'inspector-1',
      });

      const finalized = finalizeDraftFindings({
        draftFindings: [draftFinding],
        contextSnapshotId: contextSnapshot.id,
        domain: Domain.CQC,
        identifiedAt: '2024-01-01T00:00:00.000Z',
      });

      expect(finalized).toHaveLength(1);
      expect(finalized[0].origin).toBe(FindingOrigin.SYSTEM_MOCK);
      expect(finalized[0].reportingDomain).toBe(ReportingDomain.MOCK_SIMULATION);
      expect(finalized[0].contextSnapshotId).toBe(contextSnapshot.id);
      expect(finalized[0].provenanceHash).toBeDefined();
    });

    it('should throw if draft finding has wrong reporting domain', () => {
      const contextSnapshot = createProviderContextSnapshot({
        id: 'snapshot-1',
        tenantId: 'tenant-1',
        asOf: '2024-01-01T00:00:00.000Z',
        regulatoryState: ProviderRegulatoryState.ESTABLISHED,
        metadata: {
          providerName: 'Test Care Home',
          serviceTypes: ['residential'],
        },
        enabledDomains: [Domain.CQC],
        activeRegulationIds: ['reg-cqc-2014'],
        activePolicyIds: [],
        createdBy: 'system',
      });

      const topic = createTopic({
        topicId: 'topic-safeguarding',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding vulnerable adults',
        priority: 90,
        regulationScope: {
          regulationIds: ['reg-cqc-2014'],
          includeSectionPaths: ['Reg13/Safeguarding'],
          includeSectionPrefixes: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: {
          autoRequest: [
            { evidenceType: EvidenceType.POLICY, minCount: 1, required: true },
          ],
          preferredOrder: [EvidenceType.POLICY],
          stopIfMissingConfirmed: true,
        },
        conversationTemplates: {
          openingTemplateId: 'opening-safeguarding',
          transitionTemplateId: 'transition-safeguarding',
          closingTemplateId: 'closing-safeguarding',
        },
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['q-safeguarding-policy'],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00.000Z',
        supersedes: null,
        createdBy: 'system',
      });

      const maliciousDraft = generateMissingEvidenceFinding({
        sessionId: 'session-1',
        topicId: 'topic-safeguarding',
        topic,
        missingEvidenceTypes: [EvidenceType.POLICY],
        contextSnapshot,
        regulationId: 'reg-cqc-2014',
        regSectionPath: 'Reg13/Safeguarding',
        tenantId: 'tenant-1',
        identifiedBy: 'inspector-1',
      });

      // Tamper with reporting domain
      const tamperedDraft = {
        ...maliciousDraft,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
      };

      expect(() =>
        finalizeDraftFindings({
          draftFindings: [tamperedDraft],
          contextSnapshotId: contextSnapshot.id,
          domain: Domain.CQC,
          identifiedAt: '2024-01-01T00:00:00.000Z',
        })
      ).toThrow(MockContaminationError);
    });
  });

  describe('promoteMockFindingToRegulatory', () => {
    it('should throw when attempting to promote mock finding', () => {
      const mockFinding = createInspectionFinding({
        id: 'finding-1',
        tenantId: 'tenant-1',
        domain: Domain.CQC,
        origin: FindingOrigin.SYSTEM_MOCK,
        reportingDomain: ReportingDomain.MOCK_SIMULATION,
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-cqc-2014',
        regulationSectionId: 'Reg13/Safeguarding',
        title: 'Mock Finding',
        description: 'This is a mock finding',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-01T00:00:00.000Z',
        identifiedBy: 'inspector-1',
      });

      expect(() => promoteMockFindingToRegulatory(mockFinding)).toThrow(
        MockContaminationError
      );
      expect(() => promoteMockFindingToRegulatory(mockFinding)).toThrow(
        'SYSTEM_MOCK findings cannot be promoted to REGULATORY_HISTORY'
      );
    });

    it('should allow promotion of non-mock findings', () => {
      const actualFinding = createInspectionFinding({
        id: 'finding-2',
        tenantId: 'tenant-1',
        domain: Domain.CQC,
        origin: FindingOrigin.ACTUAL_INSPECTION,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-cqc-2014',
        regulationSectionId: 'Reg13/Safeguarding',
        title: 'Actual Finding',
        description: 'This is a real finding',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-01T00:00:00.000Z',
        identifiedBy: 'cqc-inspector-1',
      });

      const promoted = promoteMockFindingToRegulatory(actualFinding);
      expect(promoted.reportingDomain).toBe(ReportingDomain.REGULATORY_HISTORY);
    });
  });

  describe('phase9c:evidence:mock-regulatory-barrier', () => {
    it('should throw when trying to create SYSTEM_MOCK finding in REGULATORY_HISTORY', () => {
      expect(() =>
        createInspectionFinding({
          id: 'finding-1',
          tenantId: 'tenant-1',
          domain: Domain.CQC,
          origin: FindingOrigin.SYSTEM_MOCK,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY, // INVALID!
          contextSnapshotId: 'snapshot-1',
          regulationId: 'reg-cqc-2014',
          regulationSectionId: 'Reg13/Safeguarding',
          title: 'Mock Finding',
          description: 'This should fail',
          severity: Severity.HIGH,
          impactScore: 80,
          likelihoodScore: 70,
          identifiedAt: '2024-01-01T00:00:00.000Z',
          identifiedBy: 'inspector-1',
        })
      ).toThrow(MockContaminationError);
    });

    it('should allow SYSTEM_MOCK findings in MOCK_SIMULATION', () => {
      const finding = createInspectionFinding({
        id: 'finding-1',
        tenantId: 'tenant-1',
        domain: Domain.CQC,
        origin: FindingOrigin.SYSTEM_MOCK,
        reportingDomain: ReportingDomain.MOCK_SIMULATION, // VALID
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-cqc-2014',
        regulationSectionId: 'Reg13/Safeguarding',
        title: 'Mock Finding',
        description: 'This should succeed',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-01T00:00:00.000Z',
        identifiedBy: 'inspector-1',
      });

      expect(finding.origin).toBe(FindingOrigin.SYSTEM_MOCK);
      expect(finding.reportingDomain).toBe(ReportingDomain.MOCK_SIMULATION);
    });

    it('should allow ACTUAL_INSPECTION findings in REGULATORY_HISTORY', () => {
      const finding = createInspectionFinding({
        id: 'finding-1',
        tenantId: 'tenant-1',
        domain: Domain.CQC,
        origin: FindingOrigin.ACTUAL_INSPECTION,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY, // VALID
        contextSnapshotId: 'snapshot-1',
        regulationId: 'reg-cqc-2014',
        regulationSectionId: 'Reg13/Safeguarding',
        title: 'Real Finding',
        description: 'This should succeed',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-01T00:00:00.000Z',
        identifiedBy: 'cqc-inspector-1',
      });

      expect(finding.origin).toBe(FindingOrigin.ACTUAL_INSPECTION);
      expect(finding.reportingDomain).toBe(ReportingDomain.REGULATORY_HISTORY);
    });
  });
});
