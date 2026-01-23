/**
 * Phase 9e Gate Test: ux:report_export
 *
 * Validates readiness export for mock inspections (CSV/PDF).
 *
 * Gate assertions:
 * - CSV export includes session metadata (ID, provider, versions, hashes)
 * - PDF export includes watermark: READINESS (MOCK) — NOT REGULATORY HISTORY
 * - exports are deterministically ordered
 * - exports NEVER include regulatory history findings
 * - every page/row includes Topic Catalog + PRS Logic Profile versions + hashes
 */

import { describe, it, expect } from 'vitest';
import {
  generateCsvExport,
  generatePdfExport,
  serializeCsvExport,
  sortFindingsDeterministic,
  computeCompositeRiskScore,
  validateExportSafety,
  EXPORT_WATERMARK,
  SessionNotCompletedError,
  RegulatoryHistoryExportError,
  type ExportMetadata,
  type CsvExport,
  type PdfExport,
} from './readiness-export.js';
import {
  type MockInspectionSession,
  type DraftFinding,
  SessionStatus,
} from './mock-inspection-engine.js';
import { Domain, Severity } from './types.js';

/**
 * Helper: creates a completed mock session with findings for testing.
 */
function createTestSession(overrides?: Partial<MockInspectionSession>): MockInspectionSession {
  return {
    id: 'session-test-001',
    tenantId: 'tenant-1',
    domain: Domain.CQC,
    contextSnapshotId: 'snapshot-1',
    logicProfileId: 'profile-v1',
    status: SessionStatus.COMPLETED,
    topicStates: new Map(),
    draftFindings: [
      {
        id: 'finding-001',
        sessionId: 'session-test-001',
        topicId: 'topic-safeguarding',
        regulationId: 'reg-1',
        regulationSectionId: 'reg-1-13',
        title: 'Missing safeguarding policy',
        description: 'No formal safeguarding policy in place.',
        severity: Severity.HIGH,
        impactScore: 80,
        likelihoodScore: 70,
        draftedAt: '2024-06-01T10:00:00Z',
        draftedBy: 'user-1',
      },
      {
        id: 'finding-002',
        sessionId: 'session-test-001',
        topicId: 'topic-medication',
        regulationId: 'reg-2',
        regulationSectionId: 'reg-2-12',
        title: 'Incomplete medication records',
        description: 'Medication administration records not up to date.',
        severity: Severity.MEDIUM,
        impactScore: 60,
        likelihoodScore: 50,
        draftedAt: '2024-06-01T10:05:00Z',
        draftedBy: 'user-1',
      },
      {
        id: 'finding-003',
        sessionId: 'session-test-001',
        topicId: 'topic-safeguarding',
        regulationId: 'reg-1',
        regulationSectionId: 'reg-1-14',
        title: 'Staff training gaps',
        description: 'Not all staff completed safeguarding training.',
        severity: Severity.MEDIUM,
        impactScore: 50,
        likelihoodScore: 60,
        draftedAt: '2024-06-01T10:10:00Z',
        draftedBy: 'user-1',
      },
    ],
    events: [],
    totalQuestionsAsked: 5,
    totalFindingsDrafted: 3,
    maxFollowUpsPerTopic: 3,
    maxTotalQuestions: 20,
    startedAt: '2024-06-01T09:00:00Z',
    completedAt: '2024-06-01T11:00:00Z',
    createdBy: 'user-1',
    sessionHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc123de',
    ...overrides,
  };
}

function createTestMetadata(): ExportMetadata {
  return {
    sessionId: 'session-test-001',
    providerId: 'provider-care-home-1',
    topicCatalogVersion: 'v1',
    topicCatalogSha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    prsLogicProfilesVersion: 'v1',
    prsLogicProfilesSha256: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
  };
}

describe('ux:report_export', () => {
  describe('CSV export includes session metadata (ID, provider, versions, hashes)', () => {
    it('every CSV row contains sessionId and providerId', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      expect(csvExport.rows.length).toBe(3);

      for (const row of csvExport.rows) {
        expect(row.sessionId).toBe('session-test-001');
        expect(row.providerId).toBe('provider-care-home-1');
      }
    });

    it('every CSV row contains Topic Catalog version and SHA-256', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      for (const row of csvExport.rows) {
        expect(row.topicCatalogVersion).toBe('v1');
        expect(row.topicCatalogSha256).toBe(metadata.topicCatalogSha256);
      }
    });

    it('every CSV row contains PRS Logic Profiles version and SHA-256', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      for (const row of csvExport.rows) {
        expect(row.prsLogicProfilesVersion).toBe('v1');
        expect(row.prsLogicProfilesSha256).toBe(metadata.prsLogicProfilesSha256);
      }
    });

    it('CSV headers include all metadata columns', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      expect(csvExport.headers).toContain('sessionId');
      expect(csvExport.headers).toContain('providerId');
      expect(csvExport.headers).toContain('topicCatalogVersion');
      expect(csvExport.headers).toContain('topicCatalogSha256');
      expect(csvExport.headers).toContain('prsLogicProfilesVersion');
      expect(csvExport.headers).toContain('prsLogicProfilesSha256');
    });

    it('serialized CSV includes watermark as header comment', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);
      const serialized = serializeCsvExport(csvExport);

      expect(serialized.startsWith(`# ${EXPORT_WATERMARK}`)).toBe(true);
    });

    it('serialized CSV contains metadata values in every data row', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);
      const serialized = serializeCsvExport(csvExport);
      const lines = serialized.split('\n');

      // Skip watermark comment and header row
      const dataLines = lines.slice(2);
      expect(dataLines.length).toBe(3);

      for (const line of dataLines) {
        expect(line).toContain('session-test-001');
        expect(line).toContain('provider-care-home-1');
        expect(line).toContain('v1');
        expect(line).toContain(metadata.topicCatalogSha256);
        expect(line).toContain(metadata.prsLogicProfilesSha256);
      }
    });
  });

  describe('PDF export includes watermark: READINESS (MOCK) — NOT REGULATORY HISTORY', () => {
    it('PDF export has top-level watermark field', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      expect(pdfExport.watermark).toBe('READINESS (MOCK) — NOT REGULATORY HISTORY');
    });

    it('every PDF page has watermark field', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      expect(pdfExport.pages.length).toBeGreaterThan(0);
      for (const page of pdfExport.pages) {
        expect(page.watermark).toBe('READINESS (MOCK) — NOT REGULATORY HISTORY');
      }
    });

    it('watermark constant matches exact required text', () => {
      expect(EXPORT_WATERMARK).toBe('READINESS (MOCK) — NOT REGULATORY HISTORY');
    });
  });

  describe('exports are deterministically ordered', () => {
    it('findings are sorted by compositeRiskScore DESC', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      // finding-001: impact=80, likelihood=70 → composite=56
      // finding-002: impact=60, likelihood=50 → composite=30
      // finding-003: impact=50, likelihood=60 → composite=30
      expect(csvExport.rows[0].findingId).toBe('finding-001');
      expect(csvExport.rows[0].compositeRiskScore).toBe(56);
    });

    it('equal compositeRiskScore ties broken by topicId ASC', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      // finding-002 (topic-medication) and finding-003 (topic-safeguarding)
      // both have composite=30, so topic-medication < topic-safeguarding
      expect(csvExport.rows[1].findingId).toBe('finding-002');
      expect(csvExport.rows[1].topicId).toBe('topic-medication');
      expect(csvExport.rows[2].findingId).toBe('finding-003');
      expect(csvExport.rows[2].topicId).toBe('topic-safeguarding');
    });

    it('same inputs produce same ordering every time', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();

      const export1 = generateCsvExport(session, metadata);
      const export2 = generateCsvExport(session, metadata);

      expect(export1.rows.map((r) => r.findingId)).toEqual(
        export2.rows.map((r) => r.findingId)
      );
    });

    it('PDF pages use same deterministic ordering as CSV', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);
      const pdfExport = generatePdfExport(session, metadata);

      const csvFindingIds = csvExport.rows.map((r) => r.findingId);
      const pdfFindingIds = pdfExport.pages.flatMap((p) => p.findings.map((f) => f.findingId));

      expect(pdfFindingIds).toEqual(csvFindingIds);
    });

    it('sortFindingsDeterministic is a pure function', () => {
      const findings: DraftFinding[] = [
        {
          id: 'f-b', sessionId: 's-1', topicId: 'topic-z',
          regulationId: 'r-1', regulationSectionId: 'r-1-1',
          title: 'B', description: 'B', severity: Severity.LOW,
          impactScore: 30, likelihoodScore: 30,
          draftedAt: '2024-01-01T00:00:00Z', draftedBy: 'u-1',
        },
        {
          id: 'f-a', sessionId: 's-1', topicId: 'topic-a',
          regulationId: 'r-1', regulationSectionId: 'r-1-1',
          title: 'A', description: 'A', severity: Severity.HIGH,
          impactScore: 90, likelihoodScore: 80,
          draftedAt: '2024-01-01T00:00:00Z', draftedBy: 'u-1',
        },
      ];

      const sorted1 = sortFindingsDeterministic(findings);
      const sorted2 = sortFindingsDeterministic(findings);

      expect(sorted1.map((f) => f.id)).toEqual(['f-a', 'f-b']);
      expect(sorted2.map((f) => f.id)).toEqual(['f-a', 'f-b']);
    });

    it('compositeRiskScore is deterministic', () => {
      expect(computeCompositeRiskScore(80, 70)).toBe(56);
      expect(computeCompositeRiskScore(60, 50)).toBe(30);
      expect(computeCompositeRiskScore(50, 60)).toBe(30);
      expect(computeCompositeRiskScore(100, 100)).toBe(100);
      expect(computeCompositeRiskScore(0, 0)).toBe(0);
    });
  });

  describe('exports NEVER include regulatory history findings', () => {
    it('validateExportSafety rejects findings from different session', () => {
      const session = createTestSession();
      const foreignFindings: DraftFinding[] = [
        {
          id: 'finding-foreign',
          sessionId: 'session-OTHER', // Different session
          topicId: 'topic-1',
          regulationId: 'reg-1',
          regulationSectionId: 'reg-1-1',
          title: 'Foreign finding',
          description: 'Not from this session',
          severity: Severity.HIGH,
          impactScore: 80,
          likelihoodScore: 70,
          draftedAt: '2024-01-01T00:00:00Z',
          draftedBy: 'user-1',
        },
      ];

      expect(() => validateExportSafety(foreignFindings, session)).toThrow(
        RegulatoryHistoryExportError
      );
    });

    it('generateCsvExport only exports mock session draft findings', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      // All findings come from the session's draftFindings
      for (const row of csvExport.rows) {
        const finding = session.draftFindings.find((f) => f.id === row.findingId);
        expect(finding).toBeDefined();
        expect(finding!.sessionId).toBe(session.id);
      }
    });

    it('generatePdfExport only exports mock session draft findings', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      const allFindingIds = pdfExport.pages.flatMap((p) => p.findings.map((f) => f.findingId));
      for (const findingId of allFindingIds) {
        const finding = session.draftFindings.find((f) => f.id === findingId);
        expect(finding).toBeDefined();
        expect(finding!.sessionId).toBe(session.id);
      }
    });

    it('cannot export findings from non-COMPLETED session', () => {
      const activeSession = createTestSession({ status: SessionStatus.ACTIVE });
      const metadata = createTestMetadata();

      expect(() => generateCsvExport(activeSession, metadata)).toThrow(
        SessionNotCompletedError
      );
      expect(() => generatePdfExport(activeSession, metadata)).toThrow(
        SessionNotCompletedError
      );
    });

    it('cannot export findings from ABANDONED session', () => {
      const abandonedSession = createTestSession({ status: SessionStatus.ABANDONED });
      const metadata = createTestMetadata();

      expect(() => generateCsvExport(abandonedSession, metadata)).toThrow(
        SessionNotCompletedError
      );
      expect(() => generatePdfExport(abandonedSession, metadata)).toThrow(
        SessionNotCompletedError
      );
    });
  });

  describe('every page/row includes Topic Catalog + PRS Logic Profile versions + hashes', () => {
    it('every CSV row has topicCatalogVersion and topicCatalogSha256', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      for (const row of csvExport.rows) {
        expect(row.topicCatalogVersion).toBe('v1');
        expect(row.topicCatalogSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('every CSV row has prsLogicProfilesVersion and prsLogicProfilesSha256', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      for (const row of csvExport.rows) {
        expect(row.prsLogicProfilesVersion).toBe('v1');
        expect(row.prsLogicProfilesSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('every PDF page has topicCatalogVersion and topicCatalogSha256', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      for (const page of pdfExport.pages) {
        expect(page.topicCatalogVersion).toBe('v1');
        expect(page.topicCatalogSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('every PDF page has prsLogicProfilesVersion and prsLogicProfilesSha256', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      for (const page of pdfExport.pages) {
        expect(page.prsLogicProfilesVersion).toBe('v1');
        expect(page.prsLogicProfilesSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('every PDF page has sessionId and providerId', () => {
      const session = createTestSession();
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      for (const page of pdfExport.pages) {
        expect(page.sessionId).toBe('session-test-001');
        expect(page.providerId).toBe('provider-care-home-1');
      }
    });

    it('PDF with many findings paginates correctly with metadata on every page', () => {
      // Create session with 12 findings (should produce 3 pages at 5 per page)
      const manyFindings: DraftFinding[] = Array.from({ length: 12 }, (_, i) => ({
        id: `finding-${String(i).padStart(3, '0')}`,
        sessionId: 'session-test-001',
        topicId: `topic-${String(i % 4).padStart(2, '0')}`,
        regulationId: 'reg-1',
        regulationSectionId: `reg-1-${i}`,
        title: `Finding ${i}`,
        description: `Description ${i}`,
        severity: Severity.MEDIUM,
        impactScore: 50 + i,
        likelihoodScore: 40 + i,
        draftedAt: '2024-06-01T10:00:00Z',
        draftedBy: 'user-1',
      }));

      const session = createTestSession({ draftFindings: manyFindings });
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      expect(pdfExport.pages.length).toBe(3);
      expect(pdfExport.pages[0].findings.length).toBe(5);
      expect(pdfExport.pages[1].findings.length).toBe(5);
      expect(pdfExport.pages[2].findings.length).toBe(2);

      // Every page has metadata
      for (const page of pdfExport.pages) {
        expect(page.sessionId).toBe(metadata.sessionId);
        expect(page.providerId).toBe(metadata.providerId);
        expect(page.topicCatalogVersion).toBe(metadata.topicCatalogVersion);
        expect(page.topicCatalogSha256).toBe(metadata.topicCatalogSha256);
        expect(page.prsLogicProfilesVersion).toBe(metadata.prsLogicProfilesVersion);
        expect(page.prsLogicProfilesSha256).toBe(metadata.prsLogicProfilesSha256);
        expect(page.watermark).toBe(EXPORT_WATERMARK);
      }
    });

    it('empty session (no findings) produces single page with metadata', () => {
      const session = createTestSession({ draftFindings: [] });
      const metadata = createTestMetadata();
      const pdfExport = generatePdfExport(session, metadata);

      expect(pdfExport.pages.length).toBe(1);
      expect(pdfExport.pages[0].findings.length).toBe(0);
      expect(pdfExport.pages[0].sessionId).toBe(metadata.sessionId);
      expect(pdfExport.pages[0].providerId).toBe(metadata.providerId);
      expect(pdfExport.pages[0].topicCatalogVersion).toBe(metadata.topicCatalogVersion);
      expect(pdfExport.pages[0].watermark).toBe(EXPORT_WATERMARK);
    });

    it('empty session CSV produces zero rows but retains metadata', () => {
      const session = createTestSession({ draftFindings: [] });
      const metadata = createTestMetadata();
      const csvExport = generateCsvExport(session, metadata);

      expect(csvExport.rows.length).toBe(0);
      expect(csvExport.metadata.sessionId).toBe(metadata.sessionId);
      expect(csvExport.metadata.providerId).toBe(metadata.providerId);
      expect(csvExport.metadata.topicCatalogVersion).toBe(metadata.topicCatalogVersion);
      expect(csvExport.metadata.topicCatalogSha256).toBe(metadata.topicCatalogSha256);
      expect(csvExport.watermark).toBe(EXPORT_WATERMARK);
    });
  });
});
