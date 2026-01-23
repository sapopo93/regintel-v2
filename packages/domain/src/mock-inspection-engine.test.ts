import { describe, it, expect } from 'vitest';
import {
  createMockInspectionSession,
  openTopic,
  askQuestion,
  draftFinding,
  closeTopic,
  completeSession,
  replaySession,
  validateMockSafety,
  FollowUpLimitExceededError,
  SessionStatus,
  computeQuestionId,
  selectNextTopic,
  selectNextQuestion,
  computeEventHash,
  computeSessionHash,
  type MockInspectionSession,
  type SessionEvent,
  SessionEventType,
} from './mock-inspection-engine.js';
import { createProviderContextSnapshot } from './provider-context-snapshot.js';
import { createPRSLogicProfile } from './prs-logic-profile.js';
import {
  createInspectionFinding,
  MockContaminationError,
} from './inspection-finding.js';
import {
  Domain,
  ProviderRegulatoryState,
  Severity,
  FindingOrigin,
  ReportingDomain,
} from './types.js';

function buildTestSnapshot() {
  return createProviderContextSnapshot({
    id: 'snapshot-1',
    tenantId: 'tenant-a',
    asOf: '2024-01-15T10:00:00Z',
    regulatoryState: ProviderRegulatoryState.ESTABLISHED,
    metadata: {
      providerName: 'Test Care Home',
      serviceTypes: ['residential'],
    },
    enabledDomains: [Domain.CQC],
    activeRegulationIds: ['reg-1'],
    activePolicyIds: ['policy-1'],
    createdBy: 'system',
  });
}

function buildTestProfile() {
  return createPRSLogicProfile({
    id: 'profile-1',
    tenantId: 'tenant-a',
    domain: Domain.CQC,
    version: 1,
    effectiveDate: '2024-01-01T00:00:00Z',
    supersedes: null,
    severityRules: [],
    interactionRules: [
      {
        prs: ProviderRegulatoryState.ESTABLISHED,
        maxFollowUpsPerTopic: 3,
        maxTotalQuestions: 20,
        allowContradictionHunt: false,
      },
    ],
    severityScoreMappings: [],
    defaultMaxFollowUps: 3,
    defaultMaxQuestions: 20,
    createdBy: 'system',
  });
}

describe('mock:limits', () => {
  describe('Follow-up Limits Enforcement', () => {
    it('max_followups_per_topic enforced', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      // Open a topic
      session = openTopic(session, 'topic-1');

      // Ask initial question (not a follow-up)
      session = askQuestion(session, 'topic-1', 'Initial question?', false);

      // Ask follow-ups up to the limit (3)
      session = askQuestion(session, 'topic-1', 'Follow-up 1?', true);
      session = askQuestion(session, 'topic-1', 'Follow-up 2?', true);
      session = askQuestion(session, 'topic-1', 'Follow-up 3?', true);

      const topicState = session.topicStates.get('topic-1')!;
      expect(topicState.followUpCount).toBe(3);

      // Attempt to exceed follow-up limit
      expect(() => {
        askQuestion(session, 'topic-1', 'Follow-up 4?', true);
      }).toThrow(FollowUpLimitExceededError);
    });

    it('max_total_questions enforced across all topics', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      // Open multiple topics
      session = openTopic(session, 'topic-1');
      session = openTopic(session, 'topic-2');

      // Ask questions up to the global limit (20)
      for (let i = 0; i < 20; i++) {
        const topicId = i % 2 === 0 ? 'topic-1' : 'topic-2';
        session = askQuestion(session, topicId, `Question ${i + 1}?`, false);
      }

      expect(session.totalQuestionsAsked).toBe(20);

      // Attempt to exceed global question limit
      expect(() => {
        askQuestion(session, 'topic-1', 'Question 21?', false);
      }).toThrow(FollowUpLimitExceededError);
    });

    it('follow-up limit is per-topic, not global', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-3',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      // Open two topics
      session = openTopic(session, 'topic-1');
      session = openTopic(session, 'topic-2');

      // Max out follow-ups on topic-1
      session = askQuestion(session, 'topic-1', 'Initial?', false);
      session = askQuestion(session, 'topic-1', 'Follow-up 1?', true);
      session = askQuestion(session, 'topic-1', 'Follow-up 2?', true);
      session = askQuestion(session, 'topic-1', 'Follow-up 3?', true);

      // Topic-1 should be at limit
      expect(() => {
        askQuestion(session, 'topic-1', 'Follow-up 4?', true);
      }).toThrow(FollowUpLimitExceededError);

      // But topic-2 should still allow follow-ups
      session = askQuestion(session, 'topic-2', 'Initial?', false);
      session = askQuestion(session, 'topic-2', 'Follow-up 1?', true);

      const topic2State = session.topicStates.get('topic-2')!;
      expect(topic2State.followUpCount).toBe(1);
    });
  });
});

/**
 * Serializes session findings to canonical JSON for determinism testing.
 * Produces deterministic, byte-for-byte identical output for same inputs.
 */
function serializeSessionCanonical(session: MockInspectionSession): string {
  // Convert topicStates Map to sorted array for determinism
  const topicStates = Array.from(session.topicStates.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topicId, state]) => ({
      topicId,
      questionCount: state.questionCount,
      followUpCount: state.followUpCount,
      findingsCount: state.findingsCount,
      openedAt: state.openedAt,
      closedAt: state.closedAt,
    }));

  // Sort draft findings by ID for determinism
  const draftFindings = session.draftFindings
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((finding) => ({
      id: finding.id,
      sessionId: finding.sessionId,
      topicId: finding.topicId,
      regulationId: finding.regulationId,
      regulationSectionId: finding.regulationSectionId,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      impactScore: finding.impactScore,
      likelihoodScore: finding.likelihoodScore,
      draftedAt: finding.draftedAt,
      draftedBy: finding.draftedBy,
    }));

  // Sort events by ID for determinism
  const events = session.events
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((event) => ({
      id: event.id,
      sessionId: event.sessionId,
      eventType: event.eventType,
      payload: event.payload,
      occurredAt: event.occurredAt,
      eventHash: event.eventHash,
    }));

  const canonical = {
    id: session.id,
    tenantId: session.tenantId,
    domain: session.domain,
    contextSnapshotId: session.contextSnapshotId,
    logicProfileId: session.logicProfileId,
    status: session.status,
    topicStates,
    draftFindings,
    events,
    totalQuestionsAsked: session.totalQuestionsAsked,
    totalFindingsDrafted: session.totalFindingsDrafted,
    maxFollowUpsPerTopic: session.maxFollowUpsPerTopic,
    maxTotalQuestions: session.maxTotalQuestions,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    createdBy: session.createdBy,
    sessionHash: session.sessionHash,
  };

  // Use deterministic JSON serialization (keys already sorted by canonical object construction)
  return JSON.stringify(canonical, null, 2);
}

describe('mock:replay', () => {
  describe('Event Replay Determinism', () => {
    it('full session replay produces byte-for-byte identical output with canonical serialization', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      // Fixed timestamps for determinism
      const FIXED_START_TIME = '2024-01-15T10:00:00.000Z';
      const FIXED_TOPIC_OPEN_TIME = '2024-01-15T10:01:00.000Z';
      const FIXED_QUESTION_1_TIME = '2024-01-15T10:02:00.000Z';
      const FIXED_QUESTION_2_TIME = '2024-01-15T10:03:00.000Z';
      const FIXED_FINDING_TIME = '2024-01-15T10:04:00.000Z';
      const FIXED_TOPIC_CLOSE_TIME = '2024-01-15T10:05:00.000Z';
      const FIXED_COMPLETE_TIME = '2024-01-15T10:06:00.000Z';

      // Manually construct events with fixed timestamps
      const events: SessionEvent[] = [
        {
          id: 'event-session-replay-determinism-0',
          sessionId: 'session-replay-determinism',
          eventType: SessionEventType.SESSION_STARTED,
          payload: {
            contextSnapshotId: snapshot.id,
            logicProfileId: profile.id,
            regulatoryState: snapshot.regulatoryState,
          },
          occurredAt: FIXED_START_TIME,
          eventHash: '',
        },
        {
          id: 'event-session-replay-determinism-1',
          sessionId: 'session-replay-determinism',
          eventType: SessionEventType.TOPIC_OPENED,
          payload: { topicId: 'topic-safeguarding' },
          occurredAt: FIXED_TOPIC_OPEN_TIME,
          eventHash: '',
        },
        {
          id: 'event-session-replay-determinism-2',
          sessionId: 'session-replay-determinism',
          eventType: SessionEventType.QUESTION_ASKED,
          payload: {
            topicId: 'topic-safeguarding',
            question: 'How do you ensure safeguarding policies are followed?',
            isFollowUp: false,
          },
          occurredAt: FIXED_QUESTION_1_TIME,
          eventHash: '',
        },
        {
          id: 'event-session-replay-determinism-3',
          sessionId: 'session-replay-determinism',
          eventType: SessionEventType.QUESTION_ASKED,
          payload: {
            topicId: 'topic-safeguarding',
            question: 'Can you provide evidence of recent safeguarding training?',
            isFollowUp: true,
          },
          occurredAt: FIXED_QUESTION_2_TIME,
          eventHash: '',
        },
        {
          id: 'event-session-replay-determinism-4',
          sessionId: 'session-replay-determinism',
          eventType: SessionEventType.FINDING_DRAFTED,
          payload: {
            topicId: 'topic-safeguarding',
            findingId: 'finding-session-replay-determinism-0',
            title: 'Inadequate safeguarding training records',
            severity: Severity.HIGH,
          },
          occurredAt: FIXED_FINDING_TIME,
          eventHash: '',
        },
        {
          id: 'event-session-replay-determinism-5',
          sessionId: 'session-replay-determinism',
          eventType: SessionEventType.TOPIC_CLOSED,
          payload: { topicId: 'topic-safeguarding' },
          occurredAt: FIXED_TOPIC_CLOSE_TIME,
          eventHash: '',
        },
        {
          id: 'event-session-replay-determinism-6',
          sessionId: 'session-replay-determinism',
          eventType: SessionEventType.SESSION_COMPLETED,
          payload: {
            totalQuestionsAsked: 2,
            totalFindingsDrafted: 1,
          },
          occurredAt: FIXED_COMPLETE_TIME,
          eventHash: '',
        },
      ];

      // Compute event hashes
      for (const event of events) {
        event.eventHash = computeEventHash(event);
      }

      // Compute session hash
      const sessionHash = computeSessionHash({
        id: 'session-replay-determinism',
        contextSnapshotId: snapshot.id,
        logicProfileId: profile.id,
        startedAt: FIXED_START_TIME,
      });

      // Create initial session (first replay)
      const initialSession: MockInspectionSession = {
        id: 'session-replay-determinism',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshotId: snapshot.id,
        logicProfileId: profile.id,
        status: SessionStatus.ACTIVE,
        topicStates: new Map(),
        draftFindings: [],
        events: [events[0]],
        totalQuestionsAsked: 0,
        totalFindingsDrafted: 0,
        maxFollowUpsPerTopic: profile.defaultMaxFollowUps,
        maxTotalQuestions: profile.defaultMaxQuestions,
        startedAt: FIXED_START_TIME,
        completedAt: null,
        createdBy: 'user-1',
        sessionHash,
      };

      // First replay
      const session1 = replaySession(initialSession, events);

      // Serialize first replay output
      const serialized1 = serializeSessionCanonical(session1);

      // Second replay (from same initial session and events)
      const session2 = replaySession(initialSession, events);

      // Serialize second replay output
      const serialized2 = serializeSessionCanonical(session2);

      // Assert byte-for-byte identical serialization
      expect(serialized1).toBe(serialized2);
      expect(serialized1.length).toBe(serialized2.length);

      // Assert identical session hashes
      expect(session1.sessionHash).toBe(session2.sessionHash);
      expect(session1.sessionHash).toBe(sessionHash);

      // Assert identical event hashes
      for (let i = 0; i < session1.events.length; i++) {
        expect(session1.events[i].eventHash).toBe(session2.events[i].eventHash);
      }

      // Assert identical state
      expect(session1.status).toBe(SessionStatus.COMPLETED);
      expect(session2.status).toBe(SessionStatus.COMPLETED);
      expect(session1.totalQuestionsAsked).toBe(2);
      expect(session2.totalQuestionsAsked).toBe(2);
      expect(session1.totalFindingsDrafted).toBe(1);
      expect(session2.totalFindingsDrafted).toBe(1);

      // Assert identical topic states
      const topic1 = session1.topicStates.get('topic-safeguarding')!;
      const topic2 = session2.topicStates.get('topic-safeguarding')!;
      expect(topic1.questionCount).toBe(topic2.questionCount);
      expect(topic1.followUpCount).toBe(topic2.followUpCount);
      expect(topic1.findingsCount).toBe(topic2.findingsCount);
      expect(topic1.openedAt).toBe(topic2.openedAt);
      expect(topic1.closedAt).toBe(topic2.closedAt);

      // Assert timestamps are deterministic (not regenerated)
      expect(session1.startedAt).toBe(FIXED_START_TIME);
      expect(session2.startedAt).toBe(FIXED_START_TIME);
      expect(session1.completedAt).toBe(FIXED_COMPLETE_TIME);
      expect(session2.completedAt).toBe(FIXED_COMPLETE_TIME);
    });

    it('replay produces identical session state', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      // Create and execute a session
      let session = createMockInspectionSession({
        id: 'session-replay-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      session = openTopic(session, 'topic-1');
      session = askQuestion(session, 'topic-1', 'Question 1?', false);
      session = askQuestion(session, 'topic-1', 'Follow-up 1?', true);
      session = draftFinding(session, 'topic-1', {
        regulationId: 'reg-1',
        regulationSectionId: '8.1',
        title: 'Fire safety issue',
        description: 'Missing fire extinguisher',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 60,
      });
      session = closeTopic(session, 'topic-1');
      session = completeSession(session);

      // Capture events
      const events = session.events;

      // Replay from initial session
      const initialSession = createMockInspectionSession({
        id: 'session-replay-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      const replayedSession = replaySession(initialSession, events);

      // Verify state is identical
      expect(replayedSession.status).toBe(SessionStatus.COMPLETED);
      expect(replayedSession.totalQuestionsAsked).toBe(session.totalQuestionsAsked);
      expect(replayedSession.totalFindingsDrafted).toBe(session.totalFindingsDrafted);

      // Topic state should match
      const originalTopicState = session.topicStates.get('topic-1')!;
      const replayedTopicState = replayedSession.topicStates.get('topic-1')!;

      expect(replayedTopicState.questionCount).toBe(originalTopicState.questionCount);
      expect(replayedTopicState.followUpCount).toBe(originalTopicState.followUpCount);
      expect(replayedTopicState.findingsCount).toBe(originalTopicState.findingsCount);
      expect(replayedTopicState.closedAt).toBe(originalTopicState.closedAt);

      // Event count should match
      expect(replayedSession.events.length).toBe(events.length);
    });

    it('replay with multiple topics produces correct state', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-replay-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      // Open and work on multiple topics
      session = openTopic(session, 'topic-1');
      session = askQuestion(session, 'topic-1', 'Q1?', false);
      session = askQuestion(session, 'topic-1', 'Q2?', true);

      session = openTopic(session, 'topic-2');
      session = askQuestion(session, 'topic-2', 'Q3?', false);
      session = draftFinding(session, 'topic-2', {
        regulationId: 'reg-1',
        regulationSectionId: '10.1',
        title: 'Staffing issue',
        description: 'Insufficient staff',
        severity: Severity.MEDIUM,
        impactScore: 60,
        likelihoodScore: 70,
      });
      session = closeTopic(session, 'topic-2');

      session = openTopic(session, 'topic-3');
      session = askQuestion(session, 'topic-3', 'Q4?', false);
      session = closeTopic(session, 'topic-3');

      const events = session.events;

      // Replay
      const initialSession = createMockInspectionSession({
        id: 'session-replay-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      const replayedSession = replaySession(initialSession, events);

      // Verify all topics
      expect(replayedSession.topicStates.size).toBe(3);
      expect(replayedSession.topicStates.has('topic-1')).toBe(true);
      expect(replayedSession.topicStates.has('topic-2')).toBe(true);
      expect(replayedSession.topicStates.has('topic-3')).toBe(true);

      // Verify counters
      expect(replayedSession.totalQuestionsAsked).toBe(4);
      expect(replayedSession.totalFindingsDrafted).toBe(1);
    });
  });
});

describe('mock:safety', () => {
  describe('Mock Findings Never Leak to Regulatory History', () => {
    it('mock findings never leak to regulatory history', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      const session = createMockInspectionSession({
        id: 'session-safety-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      // Draft findings in session are safe (they're draft findings, not InspectionFinding)
      const safety = validateMockSafety(session);
      expect(safety.safe).toBe(true);
      expect(safety.violations).toHaveLength(0);
    });

    it('SYSTEM_MOCK findings cannot be created in REGULATORY_HISTORY', () => {
      const snapshot = buildTestSnapshot();

      // Attempt to create a mock finding in regulatory history (should fail)
      expect(() => {
        createInspectionFinding({
          id: 'finding-1',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.SYSTEM_MOCK,
          reportingDomain: ReportingDomain.REGULATORY_HISTORY, // VIOLATION!
          contextSnapshotId: snapshot.id,
          regulationId: 'reg-1',
          regulationSectionId: '8.1',
          title: 'Mock finding',
          description: 'This should fail',
          severity: Severity.HIGH,
          impactScore: 80,
          likelihoodScore: 70,
          identifiedAt: '2024-01-15T12:00:00Z',
          identifiedBy: 'SYSTEM',
        });
      }).toThrow(MockContaminationError);
    });

    it('SYSTEM_MOCK findings must use MOCK_SIMULATION reporting domain', () => {
      const snapshot = buildTestSnapshot();

      // Creating a mock finding in MOCK_SIMULATION is allowed
      const finding = createInspectionFinding({
        id: 'finding-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        origin: FindingOrigin.SYSTEM_MOCK,
        reportingDomain: ReportingDomain.MOCK_SIMULATION, // Correct!
        contextSnapshotId: snapshot.id,
        regulationId: 'reg-1',
        regulationSectionId: '8.1',
        title: 'Mock finding',
        description: 'This should succeed',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-15T12:00:00Z',
        identifiedBy: 'SYSTEM',
      });

      expect(finding.origin).toBe(FindingOrigin.SYSTEM_MOCK);
      expect(finding.reportingDomain).toBe(ReportingDomain.MOCK_SIMULATION);
    });

    it('ACTUAL_INSPECTION findings must use REGULATORY_HISTORY', () => {
      const snapshot = buildTestSnapshot();

      // Actual inspection findings must go to regulatory history
      const finding = createInspectionFinding({
        id: 'finding-3',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        origin: FindingOrigin.ACTUAL_INSPECTION,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
        contextSnapshotId: snapshot.id,
        regulationId: 'reg-1',
        regulationSectionId: '8.1',
        title: 'Actual inspection finding',
        description: 'From CQC inspector',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        identifiedAt: '2024-01-15T12:00:00Z',
        identifiedBy: 'inspector-1',
      });

      expect(finding.origin).toBe(FindingOrigin.ACTUAL_INSPECTION);
      expect(finding.reportingDomain).toBe(ReportingDomain.REGULATORY_HISTORY);

      // Attempt to place actual inspection in mock simulation (should fail)
      expect(() => {
        createInspectionFinding({
          id: 'finding-4',
          tenantId: 'tenant-a',
          domain: Domain.CQC,
          origin: FindingOrigin.ACTUAL_INSPECTION,
          reportingDomain: ReportingDomain.MOCK_SIMULATION, // VIOLATION!
          contextSnapshotId: snapshot.id,
          regulationId: 'reg-1',
          regulationSectionId: '8.1',
          title: 'Actual inspection finding',
          description: 'Should not be in mock simulation',
          severity: Severity.HIGH,
          impactScore: 80,
          likelihoodScore: 70,
          identifiedAt: '2024-01-15T12:00:00Z',
          identifiedBy: 'inspector-1',
        });
      }).toThrow();
    });

    it('session draft findings never become regulatory findings', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-safety-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      session = openTopic(session, 'topic-1');
      session = draftFinding(session, 'topic-1', {
        regulationId: 'reg-1',
        regulationSectionId: '8.1',
        title: 'Draft finding',
        description: 'This is a draft',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
      });

      // Draft findings stay in the session
      expect(session.draftFindings).toHaveLength(1);
      expect(session.draftFindings[0].sessionId).toBe(session.id);

      // They are never converted to InspectionFinding objects with REGULATORY_HISTORY
      // This is enforced by the type system and the createInspectionFinding validation
    });
  });
});

describe('mock:question-determinism', () => {
  describe('Question ID Determinism', () => {
    it('same inputs produce identical question IDs', () => {
      // First computation
      const questionId1 = computeQuestionId({
        topicId: 'topic-safeguarding',
        topicVersion: 1,
        followupIndex: 0,
        templateId: 'Q_SG_001',
      });

      // Second computation with identical inputs
      const questionId2 = computeQuestionId({
        topicId: 'topic-safeguarding',
        topicVersion: 1,
        followupIndex: 0,
        templateId: 'Q_SG_001',
      });

      // Third computation with identical inputs
      const questionId3 = computeQuestionId({
        topicId: 'topic-safeguarding',
        topicVersion: 1,
        followupIndex: 0,
        templateId: 'Q_SG_001',
      });

      // All IDs should be identical
      expect(questionId1).toBe(questionId2);
      expect(questionId2).toBe(questionId3);
      expect(questionId1).toMatch(/^q-[a-f0-9]{16}$/);
    });

    it('different inputs produce different question IDs', () => {
      const baselineId = computeQuestionId({
        topicId: 'topic-safeguarding',
        topicVersion: 1,
        followupIndex: 0,
        templateId: 'Q_SG_001',
      });

      const followupId = computeQuestionId({
        topicId: 'topic-safeguarding',
        topicVersion: 1,
        followupIndex: 1,
        templateId: 'Q_SG_FU_001',
      });

      const differentTopicId = computeQuestionId({
        topicId: 'topic-medication',
        topicVersion: 1,
        followupIndex: 0,
        templateId: 'Q_SG_001',
      });

      // All should be different
      expect(baselineId).not.toBe(followupId);
      expect(baselineId).not.toBe(differentTopicId);
      expect(followupId).not.toBe(differentTopicId);
    });

    it('question IDs are deterministic across runs', () => {
      const runs = [];

      // Run 10 times
      for (let i = 0; i < 10; i++) {
        const questionId = computeQuestionId({
          topicId: 'topic-test',
          topicVersion: 1,
          followupIndex: 0,
          templateId: 'Q_TEST_001',
        });
        runs.push(questionId);
      }

      // All runs should produce identical IDs
      const firstId = runs[0];
      for (const id of runs) {
        expect(id).toBe(firstId);
      }
    });

    it('followup index affects question ID', () => {
      const followup0 = computeQuestionId({
        topicId: 'topic-1',
        topicVersion: 1,
        followupIndex: 0,
        templateId: 'Q_001',
      });

      const followup1 = computeQuestionId({
        topicId: 'topic-1',
        topicVersion: 1,
        followupIndex: 1,
        templateId: 'Q_001',
      });

      const followup2 = computeQuestionId({
        topicId: 'topic-1',
        topicVersion: 1,
        followupIndex: 2,
        templateId: 'Q_001',
      });

      // Each followup index produces unique ID
      expect(followup0).not.toBe(followup1);
      expect(followup1).not.toBe(followup2);
      expect(followup0).not.toBe(followup2);
    });

    it('topic version affects question ID', () => {
      const v1 = computeQuestionId({
        topicId: 'topic-1',
        topicVersion: 1,
        followupIndex: 0,
        templateId: 'Q_001',
      });

      const v2 = computeQuestionId({
        topicId: 'topic-1',
        topicVersion: 2,
        followupIndex: 0,
        templateId: 'Q_001',
      });

      // Different versions produce different IDs
      expect(v1).not.toBe(v2);
    });
  });
});

describe('mock:topic-sequencing', () => {
  describe('Topic Sequencing', () => {
    it('selects topics in catalog order', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      const session = createMockInspectionSession({
        id: 'session-seq-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      const orderedTopicIds = ['topic-1', 'topic-2', 'topic-3'];

      // First call should return first topic
      const nextTopic1 = selectNextTopic(session, orderedTopicIds);
      expect(nextTopic1).toBe('topic-1');
    });

    it('moves to next topic after exhausting follow-ups', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-seq-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      const orderedTopicIds = ['topic-1', 'topic-2', 'topic-3'];

      // Open topic-1 and exhaust follow-ups
      session = openTopic(session, 'topic-1');
      session = askQuestion(session, 'topic-1', 'Q1', false);
      session = askQuestion(session, 'topic-1', 'FU1', true);
      session = askQuestion(session, 'topic-1', 'FU2', true);
      session = askQuestion(session, 'topic-1', 'FU3', true);

      // topic-1 is now exhausted (3 follow-ups is the limit)
      const topicState = session.topicStates.get('topic-1')!;
      expect(topicState.followUpCount).toBe(3);

      // Next topic should be topic-2
      const nextTopic = selectNextTopic(session, orderedTopicIds);
      expect(nextTopic).toBe('topic-2');
    });

    it('returns null when all topics exhausted', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-seq-3',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      const orderedTopicIds = ['topic-1', 'topic-2'];

      // Exhaust both topics
      session = openTopic(session, 'topic-1');
      session = askQuestion(session, 'topic-1', 'Q1', false);
      session = askQuestion(session, 'topic-1', 'FU1', true);
      session = askQuestion(session, 'topic-1', 'FU2', true);
      session = askQuestion(session, 'topic-1', 'FU3', true);
      session = closeTopic(session, 'topic-1');

      session = openTopic(session, 'topic-2');
      session = askQuestion(session, 'topic-2', 'Q1', false);
      session = askQuestion(session, 'topic-2', 'FU1', true);
      session = askQuestion(session, 'topic-2', 'FU2', true);
      session = askQuestion(session, 'topic-2', 'FU3', true);
      session = closeTopic(session, 'topic-2');

      // All topics exhausted
      const nextTopic = selectNextTopic(session, orderedTopicIds);
      expect(nextTopic).toBeNull();
    });

    it('selectNextQuestion returns baseline for unopened topic', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      const session = createMockInspectionSession({
        id: 'session-seq-4',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      const questionContext = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001', 'Q_002'],
        ['Q_FU_001', 'Q_FU_002'],
        1
      );

      expect(questionContext).not.toBeNull();
      expect(questionContext!.isFollowUp).toBe(false);
      expect(questionContext!.followupIndex).toBe(0);
      expect(questionContext!.templateId).toBe('Q_001'); // First starter question
    });

    it('selectNextQuestion returns follow-ups after baseline', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-seq-5',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      // Open topic and ask baseline question
      session = openTopic(session, 'topic-1');
      session = askQuestion(session, 'topic-1', 'Baseline', false);

      // Now ask for follow-up
      const questionContext = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001', 'Q_FU_002'],
        1
      );

      expect(questionContext).not.toBeNull();
      expect(questionContext!.isFollowUp).toBe(true);
      expect(questionContext!.followupIndex).toBe(1);
      expect(questionContext!.templateId).toBe('Q_FU_001'); // First follow-up
    });

    it('selectNextQuestion cycles through follow-ups', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-seq-6',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      session = openTopic(session, 'topic-1');
      session = askQuestion(session, 'topic-1', 'Baseline', false);

      // Ask first follow-up
      const q1 = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001', 'Q_FU_002'],
        1
      );
      expect(q1!.templateId).toBe('Q_FU_001');

      session = askQuestion(session, 'topic-1', 'Follow-up 1', true);

      // Ask second follow-up
      const q2 = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001', 'Q_FU_002'],
        1
      );
      expect(q2!.templateId).toBe('Q_FU_002');

      session = askQuestion(session, 'topic-1', 'Follow-up 2', true);

      // Ask third follow-up (should cycle back to first)
      const q3 = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001', 'Q_FU_002'],
        1
      );
      expect(q3!.templateId).toBe('Q_FU_001'); // Cycles back
    });

    it('selectNextQuestion returns null when topic exhausted', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      let session = createMockInspectionSession({
        id: 'session-seq-7',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      session = openTopic(session, 'topic-1');
      session = askQuestion(session, 'topic-1', 'Q', false);
      session = askQuestion(session, 'topic-1', 'FU1', true);
      session = askQuestion(session, 'topic-1', 'FU2', true);
      session = askQuestion(session, 'topic-1', 'FU3', true);

      // Topic is at follow-up limit (3)
      const questionContext = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001'],
        1
      );

      expect(questionContext).toBeNull();
    });

    it('question IDs are deterministic for same session state', () => {
      const snapshot = buildTestSnapshot();
      const profile = buildTestProfile();

      const session = createMockInspectionSession({
        id: 'session-seq-8',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        contextSnapshot: snapshot,
        logicProfile: profile,
        createdBy: 'user-1',
      });

      // Get question ID multiple times with same session state
      const q1 = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001'],
        1
      );

      const q2 = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001'],
        1
      );

      const q3 = selectNextQuestion(
        session,
        'topic-1',
        ['Q_001'],
        ['Q_FU_001'],
        1
      );

      // All should produce identical question IDs
      expect(q1!.questionId).toBe(q2!.questionId);
      expect(q2!.questionId).toBe(q3!.questionId);
    });
  });
});
