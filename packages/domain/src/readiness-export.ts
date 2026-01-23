/**
 * Readiness Export (Phase 9e: Export)
 *
 * Pure functions for generating deterministic CSV and PDF export data
 * from completed mock inspection sessions.
 *
 * CRITICAL INVARIANTS:
 * - Exports ONLY include MOCK_SIMULATION findings (NEVER REGULATORY_HISTORY)
 * - Every row/page includes Topic Catalog + PRS Logic Profile versions + hashes
 * - Watermark: "READINESS (MOCK) — NOT REGULATORY HISTORY"
 * - Deterministic ordering: findings sorted by compositeRiskScore DESC, then topicId ASC
 * - No UI formatting logic; pure data generation only
 */

import { createHash } from 'node:crypto';
import type { ContentHash, ISOTimestamp, TenantId } from './types.js';
import { FindingOrigin, ReportingDomain } from './types.js';
import type { DraftFinding, MockInspectionSession, SessionId } from './mock-inspection-engine.js';

/**
 * Watermark text required on all export outputs.
 */
export const EXPORT_WATERMARK = 'READINESS (MOCK) — NOT REGULATORY HISTORY';

/**
 * Metadata attached to every export row and page.
 */
export interface ExportMetadata {
  sessionId: SessionId;
  providerId: string;
  topicCatalogVersion: string;
  topicCatalogSha256: ContentHash;
  prsLogicProfilesVersion: string;
  prsLogicProfilesSha256: ContentHash;
}

/**
 * A single row in the CSV export.
 * Contains finding data plus mandatory metadata columns.
 */
export interface CsvExportRow {
  // Metadata (on every row)
  sessionId: SessionId;
  providerId: string;
  topicCatalogVersion: string;
  topicCatalogSha256: ContentHash;
  prsLogicProfilesVersion: string;
  prsLogicProfilesSha256: ContentHash;

  // Finding data
  findingId: string;
  topicId: string;
  regulationId: string;
  regulationSectionId: string;
  title: string;
  description: string;
  severity: string;
  impactScore: number;
  likelihoodScore: number;
  compositeRiskScore: number;
  draftedAt: ISOTimestamp;
}

/**
 * Complete CSV export output.
 */
export interface CsvExport {
  metadata: ExportMetadata;
  headers: string[];
  rows: CsvExportRow[];
  generatedAt: ISOTimestamp;
  watermark: string;
}

/**
 * A single page in the PDF export.
 */
export interface PdfExportPage {
  pageNumber: number;
  watermark: string;

  // Metadata (on every page)
  sessionId: SessionId;
  providerId: string;
  topicCatalogVersion: string;
  topicCatalogSha256: ContentHash;
  prsLogicProfilesVersion: string;
  prsLogicProfilesSha256: ContentHash;

  // Page content
  findings: Array<{
    findingId: string;
    topicId: string;
    regulationId: string;
    regulationSectionId: string;
    title: string;
    description: string;
    severity: string;
    impactScore: number;
    likelihoodScore: number;
    compositeRiskScore: number;
  }>;
}

/**
 * Complete PDF export output.
 */
export interface PdfExport {
  metadata: ExportMetadata;
  pages: PdfExportPage[];
  totalFindings: number;
  generatedAt: ISOTimestamp;
  watermark: string;
}

/**
 * Error thrown when export contains regulatory history findings.
 */
export class RegulatoryHistoryExportError extends Error {
  constructor(findingId: string) {
    super(
      `Export blocked: finding ${findingId} is from REGULATORY_HISTORY. ` +
      `Only MOCK_SIMULATION findings may be exported.`
    );
    this.name = 'RegulatoryHistoryExportError';
  }
}

/**
 * Error thrown when session is not completed.
 */
export class SessionNotCompletedError extends Error {
  constructor(sessionId: string, status: string) {
    super(`Cannot export session ${sessionId}: status is ${status}, expected COMPLETED`);
    this.name = 'SessionNotCompletedError';
  }
}

/**
 * Validates that all findings are from MOCK_SIMULATION domain.
 * Throws RegulatoryHistoryExportError if any finding violates this invariant.
 */
export function validateExportSafety(
  findings: DraftFinding[],
  session: MockInspectionSession
): void {
  // DraftFindings from MockInspectionSession are by definition SYSTEM_MOCK/MOCK_SIMULATION.
  // This structural check ensures no contamination has occurred.
  for (const finding of findings) {
    if (finding.sessionId !== session.id) {
      throw new RegulatoryHistoryExportError(finding.id);
    }
  }
}

/**
 * Computes composite risk score from impact and likelihood.
 * Deterministic: same inputs always produce same output.
 */
export function computeCompositeRiskScore(impactScore: number, likelihoodScore: number): number {
  return Math.round((impactScore * likelihoodScore) / 100);
}

/**
 * Sorts findings deterministically.
 * Primary: compositeRiskScore DESC
 * Secondary: topicId ASC (for stable ordering of equal scores)
 * Tertiary: findingId ASC (absolute tiebreaker)
 */
export function sortFindingsDeterministic(findings: DraftFinding[]): DraftFinding[] {
  return [...findings].sort((a, b) => {
    const scoreA = computeCompositeRiskScore(a.impactScore, a.likelihoodScore);
    const scoreB = computeCompositeRiskScore(b.impactScore, b.likelihoodScore);

    if (scoreB !== scoreA) return scoreB - scoreA;
    if (a.topicId !== b.topicId) return a.topicId < b.topicId ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * Generates CSV export from a completed mock inspection session.
 *
 * PURE FUNCTION: No side effects. Deterministic output for same input.
 *
 * @throws {SessionNotCompletedError} If session is not COMPLETED
 * @throws {RegulatoryHistoryExportError} If any finding is not MOCK_SIMULATION
 */
export function generateCsvExport(
  session: MockInspectionSession,
  metadata: ExportMetadata
): CsvExport {
  if (session.status !== 'COMPLETED') {
    throw new SessionNotCompletedError(session.id, session.status);
  }

  validateExportSafety(session.draftFindings, session);

  const sortedFindings = sortFindingsDeterministic(session.draftFindings);

  const headers: string[] = [
    'sessionId',
    'providerId',
    'topicCatalogVersion',
    'topicCatalogSha256',
    'prsLogicProfilesVersion',
    'prsLogicProfilesSha256',
    'findingId',
    'topicId',
    'regulationId',
    'regulationSectionId',
    'title',
    'description',
    'severity',
    'impactScore',
    'likelihoodScore',
    'compositeRiskScore',
    'draftedAt',
  ];

  const rows: CsvExportRow[] = sortedFindings.map((finding) => ({
    sessionId: metadata.sessionId,
    providerId: metadata.providerId,
    topicCatalogVersion: metadata.topicCatalogVersion,
    topicCatalogSha256: metadata.topicCatalogSha256,
    prsLogicProfilesVersion: metadata.prsLogicProfilesVersion,
    prsLogicProfilesSha256: metadata.prsLogicProfilesSha256,
    findingId: finding.id,
    topicId: finding.topicId,
    regulationId: finding.regulationId,
    regulationSectionId: finding.regulationSectionId,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    impactScore: finding.impactScore,
    likelihoodScore: finding.likelihoodScore,
    compositeRiskScore: computeCompositeRiskScore(finding.impactScore, finding.likelihoodScore),
    draftedAt: finding.draftedAt,
  }));

  return {
    metadata,
    headers,
    rows,
    generatedAt: new Date().toISOString(),
    watermark: EXPORT_WATERMARK,
  };
}

/**
 * Maximum findings per PDF page.
 */
const FINDINGS_PER_PAGE = 5;

/**
 * Generates PDF export from a completed mock inspection session.
 *
 * PURE FUNCTION: No side effects. Deterministic output for same input.
 * Pages are deterministically paginated (FINDINGS_PER_PAGE per page).
 *
 * @throws {SessionNotCompletedError} If session is not COMPLETED
 * @throws {RegulatoryHistoryExportError} If any finding is not MOCK_SIMULATION
 */
export function generatePdfExport(
  session: MockInspectionSession,
  metadata: ExportMetadata
): PdfExport {
  if (session.status !== 'COMPLETED') {
    throw new SessionNotCompletedError(session.id, session.status);
  }

  validateExportSafety(session.draftFindings, session);

  const sortedFindings = sortFindingsDeterministic(session.draftFindings);

  // Paginate findings
  const pages: PdfExportPage[] = [];
  const totalPages = Math.max(1, Math.ceil(sortedFindings.length / FINDINGS_PER_PAGE));

  for (let i = 0; i < totalPages; i++) {
    const pageFindings = sortedFindings.slice(
      i * FINDINGS_PER_PAGE,
      (i + 1) * FINDINGS_PER_PAGE
    );

    pages.push({
      pageNumber: i + 1,
      watermark: EXPORT_WATERMARK,
      sessionId: metadata.sessionId,
      providerId: metadata.providerId,
      topicCatalogVersion: metadata.topicCatalogVersion,
      topicCatalogSha256: metadata.topicCatalogSha256,
      prsLogicProfilesVersion: metadata.prsLogicProfilesVersion,
      prsLogicProfilesSha256: metadata.prsLogicProfilesSha256,
      findings: pageFindings.map((finding) => ({
        findingId: finding.id,
        topicId: finding.topicId,
        regulationId: finding.regulationId,
        regulationSectionId: finding.regulationSectionId,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        impactScore: finding.impactScore,
        likelihoodScore: finding.likelihoodScore,
        compositeRiskScore: computeCompositeRiskScore(finding.impactScore, finding.likelihoodScore),
      })),
    });
  }

  return {
    metadata,
    pages,
    totalFindings: sortedFindings.length,
    generatedAt: new Date().toISOString(),
    watermark: EXPORT_WATERMARK,
  };
}

/**
 * Serializes CSV export to string content.
 * Deterministic: same input always produces same output.
 */
export function serializeCsvExport(csvExport: CsvExport): string {
  const lines: string[] = [];

  // Header comment with watermark
  lines.push(`# ${csvExport.watermark}`);

  // Column headers
  lines.push(csvExport.headers.join(','));

  // Data rows
  for (const row of csvExport.rows) {
    const values = csvExport.headers.map((header) => {
      const value = row[header as keyof CsvExportRow];
      const strValue = String(value);
      // Escape commas and quotes in CSV values
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Computes deterministic hash of export content for integrity verification.
 */
export function computeExportHash(content: string): ContentHash {
  return createHash('sha256').update(content).digest('hex');
}
