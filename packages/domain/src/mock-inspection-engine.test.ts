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

describe('mock:replay', () => {
  describe('Event Replay Determinism', () => {
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
