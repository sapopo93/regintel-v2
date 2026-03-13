import { describe, it, expect } from 'vitest';
import {
  mapEvidenceToQualityStatements,
  detectOutstandingIndicators,
  generateInspectorEvidencePack,
  serializeInspectorPackMarkdown,
  EVIDENCE_TYPE_TO_QS,
  type EvidenceInput,
} from './inspector-evidence-pack';

const METADATA = {
  topicCatalogVersion: 'v1',
  topicCatalogHash: 'sha256:abc123',
  prsLogicProfilesVersion: 'v1',
  prsLogicProfilesHash: 'sha256:def456',
};

function makeEvidence(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    evidenceId: 'test:ev-1',
    fileName: 'test-document.pdf',
    evidenceType: 'POLICY',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    audit: null,
    ...overrides,
  };
}

describe('inspector-evidence-pack', () => {
  describe('mapEvidenceToQualityStatements', () => {
    it('maps evidence with completed audit via SAF statements (Tier 1)', () => {
      const evidence = makeEvidence({
        audit: {
          status: 'COMPLETED',
          overallResult: 'PASS',
          complianceScore: 85,
          safStatements: [
            { statementId: 'W1', statementName: 'Shared direction', rating: 'MET', evidence: 'Good governance' },
            { statementId: 'S1', statementName: 'Learning culture', rating: 'NOT_MET', evidence: 'Gaps found' },
          ],
        },
      });

      const { qsMap } = mapEvidenceToQualityStatements([evidence]);

      // W1 should have the evidence (MET rating)
      expect(qsMap.get('W1')!.length).toBe(1);
      expect(qsMap.get('W1')![0].mappingSource).toBe('audit-verified');
      expect(qsMap.get('W1')![0].auditStatus).toBe('PASS');

      // S1 should NOT have the evidence (NOT_MET rating)
      expect(qsMap.get('S1')!.length).toBe(0);
    });

    it('maps evidence without audit via type heuristic (Tier 2)', () => {
      const evidence = makeEvidence({
        evidenceType: 'TRAINING',
        audit: null,
      });

      const { qsMap } = mapEvidenceToQualityStatements([evidence]);

      // TRAINING maps to S6, C5, W7
      const expectedQs = EVIDENCE_TYPE_TO_QS['TRAINING'];
      for (const qsId of expectedQs) {
        expect(qsMap.get(qsId)!.length).toBe(1);
        expect(qsMap.get(qsId)![0].mappingSource).toBe('type-inferred');
      }
    });

    it('maps evidence with failed audit via type heuristic fallback', () => {
      const evidence = makeEvidence({
        evidenceType: 'AUDIT',
        audit: { status: 'FAILED' },
      });

      const { qsMap } = mapEvidenceToQualityStatements([evidence]);

      // AUDIT maps to W5, W7, W8, E5
      expect(qsMap.get('W5')!.length).toBe(1);
      expect(qsMap.get('W5')![0].mappingSource).toBe('type-inferred');
    });

    it('places pending audit items in awaiting audit map', () => {
      const evidence = makeEvidence({
        evidenceType: 'ROTA',
        audit: { status: 'PENDING' },
      });

      const { qsMap, awaitingAuditMap } = mapEvidenceToQualityStatements([evidence]);

      // ROTA maps to S6, E3 — should be in awaiting audit, not main map
      expect(qsMap.get('S6')!.length).toBe(0);
      expect(awaitingAuditMap.get('S6')!.length).toBe(1);
      expect(awaitingAuditMap.get('S6')![0].auditStatus).toBe('PENDING');
    });
  });

  describe('detectOutstandingIndicators', () => {
    it('detects leadership via audit SAF ratings (Tier 1)', () => {
      const evidence = makeEvidence({
        evidenceType: 'POLICY',
        audit: {
          status: 'COMPLETED',
          overallResult: 'PASS',
          complianceScore: 90,
          safStatements: [
            { statementId: 'W1', statementName: 'Shared direction', rating: 'MET', evidence: 'Good' },
          ],
        },
      });

      const result = detectOutstandingIndicators([evidence]);
      const leadership = result.indicators.find((i) => i.id === 'leadership');

      expect(leadership!.hasEvidence).toBe(true);
      expect(leadership!.evidenceItems[0].signalType).toBe('audit-verified');
    });

    it('detects leadership via filename keyword (Tier 2)', () => {
      const evidence = makeEvidence({
        fileName: 'governance-framework-2026.pdf',
        audit: null,
      });

      const result = detectOutstandingIndicators([evidence]);
      const leadership = result.indicators.find((i) => i.id === 'leadership');

      expect(leadership!.hasEvidence).toBe(true);
      expect(leadership!.evidenceItems[0].signalType).toBe('keyword-matched');
    });

    it('Tier 1 takes precedence over Tier 2', () => {
      const evidence = makeEvidence({
        fileName: 'governance-policy.pdf',
        evidenceType: 'POLICY',
        audit: {
          status: 'COMPLETED',
          overallResult: 'PASS',
          complianceScore: 85,
          safStatements: [
            { statementId: 'W1', statementName: 'Shared direction', rating: 'MET', evidence: 'Good' },
          ],
        },
      });

      const result = detectOutstandingIndicators([evidence]);
      const leadership = result.indicators.find((i) => i.id === 'leadership');

      // Should be audit-verified (Tier 1), not keyword-matched (Tier 2)
      expect(leadership!.evidenceItems.length).toBe(1);
      expect(leadership!.evidenceItems[0].signalType).toBe('audit-verified');
    });

    it('computes overall score correctly', () => {
      // No evidence at all → 0%
      const empty = detectOutstandingIndicators([]);
      expect(empty.overallScore).toBe(0);

      // Evidence matching 2 of 9 indicators → 22%
      const twoMatches = detectOutstandingIndicators([
        makeEvidence({ fileName: 'governance-report.pdf' }), // leadership
        makeEvidence({ fileName: 'community-survey.pdf' }),  // community
      ]);
      expect(twoMatches.overallScore).toBe(22);
    });
  });

  describe('generateInspectorEvidencePack', () => {
    it('assembles a complete pack with coverage stats', () => {
      const pack = generateInspectorEvidencePack({
        facilityName: 'Test Care Home',
        facilityId: 'test:fac-1',
        inspectionStatus: 'INSPECTED',
        evidenceInputs: [
          makeEvidence({
            evidenceType: 'POLICY',
            audit: {
              status: 'COMPLETED',
              overallResult: 'PASS',
              complianceScore: 90,
              safStatements: [
                { statementId: 'W1', statementName: 'Shared direction', rating: 'MET', evidence: 'Good' },
              ],
            },
          }),
        ],
        metadata: METADATA,
      });

      expect(pack.facilityName).toBe('Test Care Home');
      expect(pack.keyQuestionSections.length).toBe(5);
      expect(pack.overallCoverage.total).toBe(34);
      expect(pack.overallCoverage.covered).toBeGreaterThan(0);
      expect(pack.outstandingReadiness.indicators.length).toBe(9);
      expect(pack.metadata).toEqual(METADATA);
    });
  });

  describe('serializeInspectorPackMarkdown', () => {
    it('renders all 5 key question sections', () => {
      const pack = generateInspectorEvidencePack({
        facilityName: 'Test Home',
        facilityId: 'test:fac-1',
        inspectionStatus: 'INSPECTED',
        evidenceInputs: [],
        metadata: METADATA,
      });

      const md = serializeInspectorPackMarkdown(pack);

      expect(md).toContain('## Safe');
      expect(md).toContain('## Effective');
      expect(md).toContain('## Caring');
      expect(md).toContain('## Responsive');
      expect(md).toContain('## Well-Led');
    });

    it('includes outstanding section with disclaimer', () => {
      const pack = generateInspectorEvidencePack({
        facilityName: 'Test Home',
        facilityId: 'test:fac-1',
        inspectionStatus: 'INSPECTED',
        evidenceInputs: [],
        metadata: METADATA,
      });

      const md = serializeInspectorPackMarkdown(pack);

      expect(md).toContain('Outstanding Readiness Indicators');
      expect(md).toContain('do not predict CQC ratings');
    });

    it('shows Awaiting Audit subsection for pending evidence', () => {
      const pack = generateInspectorEvidencePack({
        facilityName: 'Test Home',
        facilityId: 'test:fac-1',
        inspectionStatus: 'INSPECTED',
        evidenceInputs: [
          makeEvidence({
            evidenceType: 'ROTA',
            audit: { status: 'PENDING' },
          }),
        ],
        metadata: METADATA,
      });

      const md = serializeInspectorPackMarkdown(pack);
      expect(md).toContain('Awaiting Audit');
    });

    it('shows Getting Started preamble when coverage < 30%', () => {
      const pack = generateInspectorEvidencePack({
        facilityName: 'Test Home',
        facilityId: 'test:fac-1',
        inspectionStatus: 'INSPECTED',
        evidenceInputs: [], // 0% coverage
        metadata: METADATA,
      });

      const md = serializeInspectorPackMarkdown(pack);
      expect(md).toContain('Getting Started');
      expect(md).toContain('early stages of evidence collection');
    });

    it('never-inspected facility: outstanding section before per-QS detail', () => {
      const pack = generateInspectorEvidencePack({
        facilityName: 'New Home',
        facilityId: 'test:fac-1',
        inspectionStatus: 'NEVER_INSPECTED',
        evidenceInputs: [],
        metadata: METADATA,
      });

      const md = serializeInspectorPackMarkdown(pack);

      // Outstanding should appear before Safe (first key question)
      const outstandingIdx = md.indexOf('Outstanding Readiness Indicators');
      const safeIdx = md.indexOf('## Safe');
      expect(outstandingIdx).toBeLessThan(safeIdx);

      // Should have never-inspected preamble
      expect(md).toContain('not yet been inspected by CQC');
    });

    it('includes constitutional metadata in footer', () => {
      const pack = generateInspectorEvidencePack({
        facilityName: 'Test Home',
        facilityId: 'test:fac-1',
        inspectionStatus: 'INSPECTED',
        evidenceInputs: [],
        metadata: METADATA,
      });

      const md = serializeInspectorPackMarkdown(pack);
      expect(md).toContain('Topic Catalog: v1');
      expect(md).toContain('PRS Logic Profiles: v1');
    });
  });
});
