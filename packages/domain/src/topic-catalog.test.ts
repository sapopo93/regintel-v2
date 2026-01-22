import { describe, it, expect } from 'vitest';
import {
  createTopic,
  createTopicCatalog,
  validateTopicRegulationScope,
  validateEvidenceAlignment,
  validateTopicCatalog,
  EvidenceType,
  QuestionMode,
  type RegulationScopeSelector,
  type EvidenceHuntProfile,
  type QuestionPlan,
  type ConversationTemplates,
} from './topic-catalog.js';
import { Domain } from './types.js';

function buildValidRegulationScope(): RegulationScopeSelector {
  return {
    regulationIds: ['reg-1', 'reg-2'],
    includeSectionPrefixes: ['Reg13/*', 'QS/Safe/*'],
    includeSectionPaths: ['Reg13/Reporting', 'QS/Safe/Systems'],
    excludeSectionPrefixes: [],
    excludeSectionPaths: [],
  };
}

function buildValidEvidenceHuntProfile(): EvidenceHuntProfile {
  return {
    autoRequest: [
      {
        evidenceType: EvidenceType.POLICY,
        minCount: 1,
        required: true,
      },
      {
        evidenceType: EvidenceType.TRAINING_LOG,
        minCount: 1,
        required: false,
      },
    ],
    preferredOrder: [EvidenceType.POLICY, EvidenceType.TRAINING_LOG],
    stopIfMissingConfirmed: true,
  };
}

function buildValidQuestionPlan(): QuestionPlan {
  return {
    mode: QuestionMode.EVIDENCE_FIRST,
    starterQuestionIds: ['Q_SG_001', 'Q_SG_002'],
    followupQuestionIds: ['Q_SG_FU_010', 'Q_SG_FU_011'],
    contradictionProbeIds: ['Q_SG_CP_001'],
    maxRepeatPerQuestionId: 1,
  };
}

function buildValidConversationTemplates(): ConversationTemplates {
  return {
    openingTemplateId: 'OPEN_SAFEGUARDING_V1',
    transitionTemplateId: 'TRANSITION_GENERIC_V1',
    closingTemplateId: 'CLOSE_TOPIC_V1',
  };
}

describe('topics:scope', () => {
  describe('Topics Reference Valid Regulation Sections', () => {
    it('topics reference valid regulation sections', () => {
      const topic = createTopic({
        topicId: 'SAFEGUARDING',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding practices and governance',
        priority: 90,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validRegulationIds = new Set(['reg-1', 'reg-2']);
      const validSectionPaths = new Set(['Reg13/Reporting', 'QS/Safe/Systems']);

      const validation = validateTopicRegulationScope(
        topic,
        validRegulationIds,
        validSectionPaths
      );

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('rejects topic with invalid regulation ID', () => {
      const topic = createTopic({
        topicId: 'INVALID_TOPIC',
        domain: Domain.CQC,
        version: 1,
        title: 'Invalid Topic',
        description: 'References non-existent regulation',
        priority: 50,
        regulationScope: {
          regulationIds: ['non-existent-reg'],
          includeSectionPrefixes: ['*'],
          includeSectionPaths: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validRegulationIds = new Set(['reg-1', 'reg-2']);
      const validSectionPaths = new Set<string>([]);

      const validation = validateTopicRegulationScope(
        topic,
        validRegulationIds,
        validSectionPaths
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('invalid regulation ID');
    });

    it('rejects topic with invalid section path', () => {
      const topic = createTopic({
        topicId: 'INVALID_SECTION',
        domain: Domain.CQC,
        version: 1,
        title: 'Invalid Section Topic',
        description: 'References non-existent section',
        priority: 50,
        regulationScope: {
          regulationIds: ['reg-1'],
          includeSectionPrefixes: [],
          includeSectionPaths: ['NonExistent/Section'],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validRegulationIds = new Set(['reg-1']);
      const validSectionPaths = new Set(['Reg13/Reporting']);

      const validation = validateTopicRegulationScope(
        topic,
        validRegulationIds,
        validSectionPaths
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('invalid section path'))).toBe(
        true
      );
    });

    it('rejects topic with no regulation references', () => {
      const topic = createTopic({
        topicId: 'NO_REGULATIONS',
        domain: Domain.CQC,
        version: 1,
        title: 'No Regulations',
        description: 'Does not reference any regulations',
        priority: 50,
        regulationScope: {
          regulationIds: [],
          includeSectionPrefixes: ['*'],
          includeSectionPaths: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validRegulationIds = new Set<string>([]);
      const validSectionPaths = new Set<string>([]);

      const validation = validateTopicRegulationScope(
        topic,
        validRegulationIds,
        validSectionPaths
      );

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some((e) => e.includes('does not reference any regulations'))
      ).toBe(true);
    });

    it('rejects topic with no inclusion rules', () => {
      const topic = createTopic({
        topicId: 'NO_INCLUSIONS',
        domain: Domain.CQC,
        version: 1,
        title: 'No Inclusions',
        description: 'Has no section inclusion rules',
        priority: 50,
        regulationScope: {
          regulationIds: ['reg-1'],
          includeSectionPrefixes: [],
          includeSectionPaths: [],
          excludeSectionPrefixes: [],
          excludeSectionPaths: [],
        },
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validRegulationIds = new Set(['reg-1']);
      const validSectionPaths = new Set<string>([]);

      const validation = validateTopicRegulationScope(
        topic,
        validRegulationIds,
        validSectionPaths
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('no inclusion rules'))).toBe(true);
    });
  });
});

describe('topics:evidence', () => {
  describe('Evidence Requests Align with Topic Definitions', () => {
    it('evidence requests align with topic definitions', () => {
      const topic = createTopic({
        topicId: 'SAFEGUARDING',
        domain: Domain.CQC,
        version: 1,
        title: 'Safeguarding',
        description: 'Safeguarding practices',
        priority: 90,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validation = validateEvidenceAlignment(topic);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('rejects topic with no evidence requests', () => {
      const topic = createTopic({
        topicId: 'NO_EVIDENCE',
        domain: Domain.CQC,
        version: 1,
        title: 'No Evidence',
        description: 'Has no evidence requests',
        priority: 50,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: {
          autoRequest: [],
          preferredOrder: [],
          stopIfMissingConfirmed: false,
        },
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validation = validateEvidenceAlignment(topic);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('no evidence requests'))).toBe(
        true
      );
    });

    it('rejects topic with misaligned preferred order', () => {
      const topic = createTopic({
        topicId: 'MISALIGNED_EVIDENCE',
        domain: Domain.CQC,
        version: 1,
        title: 'Misaligned Evidence',
        description: 'Preferred order does not match auto-request',
        priority: 50,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: {
          autoRequest: [
            {
              evidenceType: EvidenceType.POLICY,
              minCount: 1,
              required: true,
            },
          ],
          preferredOrder: [EvidenceType.POLICY, EvidenceType.TRAINING_LOG], // Training log not in auto-request
          stopIfMissingConfirmed: false,
        },
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validation = validateEvidenceAlignment(topic);

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some((e) => e.includes('not in auto-request list'))
      ).toBe(true);
    });

    it('rejects topic with required evidence but zero min_count', () => {
      const topic = createTopic({
        topicId: 'INVALID_REQUIRED',
        domain: Domain.CQC,
        version: 1,
        title: 'Invalid Required',
        description: 'Required evidence with zero min_count',
        priority: 50,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: {
          autoRequest: [
            {
              evidenceType: EvidenceType.POLICY,
              minCount: 0,
              required: true, // Required but min_count is 0!
            },
          ],
          preferredOrder: [EvidenceType.POLICY],
          stopIfMissingConfirmed: false,
        },
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validation = validateEvidenceAlignment(topic);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('min_count is 0'))).toBe(true);
    });

    it('rejects topic with no starter questions', () => {
      const topic = createTopic({
        topicId: 'NO_QUESTIONS',
        domain: Domain.CQC,
        version: 1,
        title: 'No Questions',
        description: 'Has no starter questions',
        priority: 50,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: [],
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validation = validateEvidenceAlignment(topic);

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some((e) => e.includes('no starter question IDs'))
      ).toBe(true);
    });

    it('rejects topic with free-text in question IDs', () => {
      const topic = createTopic({
        topicId: 'FREE_TEXT_QUESTIONS',
        domain: Domain.CQC,
        version: 1,
        title: 'Free Text Questions',
        description: 'Uses free-text instead of IDs',
        priority: 50,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: {
          mode: QuestionMode.EVIDENCE_FIRST,
          starterQuestionIds: ['Can you tell me about your safeguarding policies?'], // Free text!
          followupQuestionIds: [],
          contradictionProbeIds: [],
          maxRepeatPerQuestionId: 1,
        },
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validation = validateEvidenceAlignment(topic);

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some((e) => e.includes('appears to be free-text'))
      ).toBe(true);
    });

    it('validates entire catalog successfully', () => {
      const topic1 = createTopic({
        topicId: 'TOPIC_1',
        domain: Domain.CQC,
        version: 1,
        title: 'Topic 1',
        description: 'First topic',
        priority: 90,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const topic2 = createTopic({
        topicId: 'TOPIC_2',
        domain: Domain.CQC,
        version: 1,
        title: 'Topic 2',
        description: 'Second topic',
        priority: 80,
        regulationScope: buildValidRegulationScope(),
        evidenceHuntProfile: buildValidEvidenceHuntProfile(),
        conversationTemplates: buildValidConversationTemplates(),
        questionPlan: buildValidQuestionPlan(),
        prsOverrides: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const catalog = createTopicCatalog({
        id: 'catalog-1',
        tenantId: 'tenant-a',
        version: 1,
        topics: [topic1, topic2],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validRegulationIds = new Set(['reg-1', 'reg-2']);
      const validSectionPaths = new Set(['Reg13/Reporting', 'QS/Safe/Systems']);

      const validation = validateTopicCatalog(
        catalog,
        validRegulationIds,
        validSectionPaths
      );

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('rejects empty catalog', () => {
      const catalog = createTopicCatalog({
        id: 'catalog-empty',
        tenantId: 'tenant-a',
        version: 1,
        topics: [],
        effectiveFrom: '2024-01-01T00:00:00Z',
        supersedes: null,
        createdBy: 'system',
      });

      const validRegulationIds = new Set<string>([]);
      const validSectionPaths = new Set<string>([]);

      const validation = validateTopicCatalog(
        catalog,
        validRegulationIds,
        validSectionPaths
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('no topics'))).toBe(true);
    });
  });
});
