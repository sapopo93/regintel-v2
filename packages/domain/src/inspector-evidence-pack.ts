/**
 * Inspector Evidence Pack (Feature 2)
 *
 * Generates a pre-inspection evidence pack organized by SAF34 quality statement.
 * Two-tier evidence-to-QS mapping: audit SAF ratings (Tier 1) → evidence type heuristic (Tier 2).
 * Includes Outstanding Readiness Indicators with audit-verified and keyword-matched signals.
 *
 * Pure functions — no side effects, no external calls.
 */

import {
  SAF_34_QUALITY_STATEMENTS,
  KEY_QUESTION_LABELS,
  type KeyQuestion,
  type QualityStatement,
} from './saf34';

// ── Types ────────────────────────────────────────────────────────────

export type AuditStatus = 'PASS' | 'NEEDS_IMPROVEMENT' | 'CRITICAL_GAPS' | 'PENDING' | 'NOT_AUDITED';
export type SAFRating = 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'NOT_APPLICABLE';
export type MappingSource = 'audit-verified' | 'type-inferred';

export interface EvidenceItem {
  evidenceId: string;
  fileName: string;
  evidenceType: string;
  uploadedAt: string;
  description?: string;
  auditStatus: AuditStatus;
  complianceScore: number | null;
  safRating: SAFRating | null;
  mappingSource: MappingSource;
  expiresAt: string | null;
}

export interface QualityStatementEvidence {
  id: string;
  title: string;
  covered: boolean;
  evidenceItems: EvidenceItem[];
  awaitingAuditItems: EvidenceItem[];
  gaps: string[];
}

export interface KeyQuestionSection {
  keyQuestion: KeyQuestion;
  label: string;
  coverageSummary: { total: number; covered: number; percentage: number };
  qualityStatements: QualityStatementEvidence[];
}

export interface OutstandingIndicator {
  id: string;
  label: string;
  description: string;
  hasEvidence: boolean;
  evidenceCount: number;
  evidenceItems: Array<{ fileName: string; evidenceType: string; signalType: 'audit-verified' | 'keyword-matched' }>;
}

export interface OutstandingReadinessSection {
  indicators: OutstandingIndicator[];
  overallScore: number;
}

export interface InspectorEvidencePack {
  facilityName: string;
  facilityId: string;
  generatedAt: string;
  inspectionStatus: string;
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
  watermark: string | null;
  overallCoverage: { total: number; covered: number; percentage: number };
  keyQuestionSections: KeyQuestionSection[];
  outstandingReadiness: OutstandingReadinessSection;
  metadata: {
    topicCatalogVersion: string;
    topicCatalogHash: string;
    prsLogicProfilesVersion: string;
    prsLogicProfilesHash: string;
  };
}

// ── Evidence-to-QS Mapping ──────────────────────────────────────────

/**
 * Tier 2 fallback: static mapping from evidence type to quality statements.
 */
export const EVIDENCE_TYPE_TO_QS: Record<string, string[]> = {
  // Original mappings (improved)
  POLICY:        ['W1', 'W4'],
  TRAINING:      ['S6', 'E8', 'W6'],
  AUDIT:         ['W4', 'W6', 'E5'],
  ROTA:          ['S6', 'E3'],
  SKILLS_MATRIX: ['S6', 'E8'],
  SUPERVISION:   ['E8', 'S6', 'W3'],
  CERTIFICATE:   ['S6', 'E8'],
  CQC_REPORT:    [],
  // Clinical records
  CARE_PLAN:           ['E1', 'R1', 'C2', 'E6'],
  MAR_CHART:           ['S8', 'S1', 'S9'],
  RISK_ASSESSMENT:     ['S4', 'S1', 'E1'],
  INCIDENT_REPORT:     ['S1', 'S3', 'W4', 'W6'],
  DAILY_NOTES:         ['R1', 'C1', 'C4'],
  HANDOVER_NOTES:      ['S2', 'S8', 'E3'],
  MEDICATION_PROTOCOL: ['S8', 'S1', 'W4'],
  // Legal/Safeguarding
  DOLS_MCA_ASSESSMENT:  ['E6', 'E7'],
  SAFEGUARDING_RECORD:  ['S3', 'S1', 'W4'],
  COMPLAINTS_LOG:       ['R4', 'W4', 'W6'],
  // Governance
  STAFF_MEETING_MINUTES: ['W1', 'W3', 'W6'],
  RECRUITMENT_FILE:      ['S6'],
  // Safety & Environment
  FIRE_SAFETY_CHECK:          ['S5'],
  INFECTION_CONTROL_AUDIT:    ['S7', 'S5'],
  EQUIPMENT_MAINTENANCE_LOG:  ['S5'],
  // Clinical Monitoring
  NUTRITIONAL_ASSESSMENT: ['E2', 'E4'],
  WOUND_CARE_RECORD:      ['E2', 'E5'],
  BODY_MAP:               ['S3'],
  FLUID_FOOD_CHART:       ['E2'],
  // Person-Centred
  ACTIVITY_PROGRAMME:       ['C3'],
  SERVICE_USER_AGREEMENT:   ['R3'],
  RESIDENT_SURVEY:          ['R4'],
  OTHER:         [],
};

/**
 * Input shape for evidence items passed to the pack generator.
 */
export interface EvidenceInput {
  evidenceId: string;
  fileName: string;
  evidenceType: string;
  description?: string;
  uploadedAt: string;
  expiresAt?: string | null;
  audit?: {
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
    overallResult?: 'PASS' | 'NEEDS_IMPROVEMENT' | 'CRITICAL_GAPS';
    complianceScore?: number;
    safStatements?: Array<{
      statementId: string;
      statementName: string;
      rating: SAFRating;
      evidence: string;
    }>;
  } | null;
}

/**
 * Map evidence items to quality statements using two-tier strategy.
 *
 * Tier 1: Completed audit with SAF statement ratings (MET/PARTIALLY_MET → mapped)
 * Tier 2: For unaudited evidence, use EVIDENCE_TYPE_TO_QS fallback
 *
 * Returns a map from QS id to array of EvidenceItems.
 */
export function mapEvidenceToQualityStatements(
  evidenceInputs: EvidenceInput[]
): { qsMap: Map<string, EvidenceItem[]>; awaitingAuditMap: Map<string, EvidenceItem[]> } {
  const qsMap = new Map<string, EvidenceItem[]>();
  const awaitingAuditMap = new Map<string, EvidenceItem[]>();

  // Initialize maps for all QS
  for (const qs of SAF_34_QUALITY_STATEMENTS) {
    qsMap.set(qs.id, []);
    awaitingAuditMap.set(qs.id, []);
  }

  for (const evidence of evidenceInputs) {
    const hasCompletedAudit = evidence.audit?.status === 'COMPLETED' && evidence.audit.safStatements;
    const isPendingAudit = evidence.audit?.status === 'PENDING';

    if (hasCompletedAudit && evidence.audit?.safStatements) {
      // Tier 1: Audit SAF ratings
      for (const safStmt of evidence.audit.safStatements) {
        if (safStmt.rating === 'MET' || safStmt.rating === 'PARTIALLY_MET') {
          const items = qsMap.get(safStmt.statementId);
          if (items) {
            items.push({
              evidenceId: evidence.evidenceId,
              fileName: evidence.fileName,
              evidenceType: evidence.evidenceType,
              uploadedAt: evidence.uploadedAt,
              description: evidence.description,
              auditStatus: evidence.audit!.overallResult ?? 'PASS',
              complianceScore: evidence.audit!.complianceScore ?? null,
              safRating: safStmt.rating,
              mappingSource: 'audit-verified',
              expiresAt: evidence.expiresAt ?? null,
            });
          }
        }
      }
    } else if (isPendingAudit) {
      // Pending audit: show in "Awaiting Audit" subsection
      const qsIds = EVIDENCE_TYPE_TO_QS[evidence.evidenceType] ?? [];
      for (const qsId of qsIds) {
        const items = awaitingAuditMap.get(qsId);
        if (items) {
          items.push({
            evidenceId: evidence.evidenceId,
            fileName: evidence.fileName,
            evidenceType: evidence.evidenceType,
            uploadedAt: evidence.uploadedAt,
            description: evidence.description,
            auditStatus: 'PENDING',
            complianceScore: null,
            safRating: null,
            mappingSource: 'type-inferred',
            expiresAt: evidence.expiresAt ?? null,
          });
        }
      }
    } else {
      // Tier 2: Evidence type heuristic (no audit, failed audit, or skipped)
      const qsIds = EVIDENCE_TYPE_TO_QS[evidence.evidenceType] ?? [];
      const auditStatus: AuditStatus = evidence.audit?.status === 'FAILED' ? 'NOT_AUDITED' : 'NOT_AUDITED';
      for (const qsId of qsIds) {
        const items = qsMap.get(qsId);
        if (items) {
          items.push({
            evidenceId: evidence.evidenceId,
            fileName: evidence.fileName,
            evidenceType: evidence.evidenceType,
            uploadedAt: evidence.uploadedAt,
            description: evidence.description,
            auditStatus,
            complianceScore: null,
            safRating: null,
            mappingSource: 'type-inferred',
            expiresAt: evidence.expiresAt ?? null,
          });
        }
      }
    }
  }

  return { qsMap, awaitingAuditMap };
}

// ── Outstanding Readiness Indicators ────────────────────────────────

export interface OutstandingIndicatorDef {
  id: string;
  label: string;
  description: string;
  matchPatterns: RegExp[];
  safStatementIds?: string[];
  evidenceTypes?: string[];
}

export const OUTSTANDING_INDICATORS: OutstandingIndicatorDef[] = [
  {
    id: 'leadership',
    label: 'Leadership & Governance Evidence',
    description: 'Evidence of strong governance structures, board oversight, and strategic planning.',
    safStatementIds: ['W1', 'W2', 'W4'],
    evidenceTypes: ['AUDIT', 'POLICY'],
    matchPatterns: [/governance/i, /leadership/i, /board\s*minutes/i, /strateg/i],
  },
  {
    id: 'innovation',
    label: 'Innovation & Best Practice',
    description: 'Evidence of innovative approaches, research participation, or sector-leading practice.',
    matchPatterns: [/innovat/i, /pilot/i, /improvement\s*project/i, /research/i, /best\s*practice/i],
  },
  {
    id: 'community',
    label: 'Community Engagement',
    description: 'Evidence of community partnerships, resident involvement, and stakeholder feedback.',
    safStatementIds: ['R1', 'R4'],
    matchPatterns: [/communit/i, /partnership/i, /engag/i, /volunteer/i, /feedback/i, /survey/i, /resident\s*meet/i],
  },
  {
    id: 'improvement',
    label: 'Continuous Improvement',
    description: 'Evidence of systematic quality improvement, lessons learned, and action planning.',
    evidenceTypes: ['AUDIT'],
    matchPatterns: [/action\s*plan/i, /improvement/i, /lessons?\s*learn/i, /quality\s*improv/i, /qip/i],
  },
  {
    id: 'learning-culture',
    label: 'Embedded Learning Culture',
    description: 'Evidence of incident → learning → improvement cycles, not just incident recording.',
    safStatementIds: ['S1', 'W6'],
    evidenceTypes: ['INCIDENT_REPORT', 'AUDIT'],
    matchPatterns: [/lessons?\s*learn/i, /root\s*cause/i, /learning\s*from/i, /improvement\s*cycle/i, /after\s*action/i],
  },
  {
    id: 'mdt-integration',
    label: 'MDT Integration',
    description: 'Evidence of multi-disciplinary team coordination and collaborative working.',
    safStatementIds: ['E3', 'R2'],
    matchPatterns: [/multi.?disciplin/i, /mdt/i, /joint\s*working/i, /team\s*around/i, /collaborative/i],
  },
  {
    id: 'carer-engagement',
    label: 'Carer & Family Engagement',
    description: 'Evidence of carer support programmes, family feedback mechanisms, and involvement in care planning.',
    safStatementIds: ['R4', 'C1'],
    evidenceTypes: ['RESIDENT_SURVEY'],
    matchPatterns: [/carer/i, /family\s*(meeting|forum|feedback|survey)/i, /relative/i, /next\s*of\s*kin/i],
  },
  {
    id: 'proactive-risk',
    label: 'Proactive Risk Management',
    description: 'Evidence of risk assessments that involve the person, positive risk-taking, and person-centred safety.',
    safStatementIds: ['S4', 'W4'],
    evidenceTypes: ['RISK_ASSESSMENT'],
    matchPatterns: [/positive\s*risk/i, /person.?centred\s*risk/i, /involve.*risk/i, /proactive/i],
  },
  {
    id: 'health-equity',
    label: 'Health Inequalities Awareness',
    description: 'Evidence addressing equity in access and outcomes for diverse populations.',
    safStatementIds: ['E9'],
    matchPatterns: [/health\s*inequalit/i, /equity/i, /divers/i, /inclusion/i, /accessible\s*information/i, /easy\s*read/i],
  },
];

/**
 * Detect outstanding readiness indicators from evidence.
 *
 * Tier 1: Audit SAF statement ratings (strong signal)
 * Tier 2: Filename/description keyword matching (weak signal, fallback)
 */
export function detectOutstandingIndicators(
  evidenceInputs: EvidenceInput[]
): OutstandingReadinessSection {
  const indicators: OutstandingIndicator[] = OUTSTANDING_INDICATORS.map((def) => {
    const matchedItems: OutstandingIndicator['evidenceItems'] = [];

    for (const evidence of evidenceInputs) {
      let matched = false;
      let signalType: 'audit-verified' | 'keyword-matched' = 'keyword-matched';

      // Tier 1: Audit SAF statement ratings
      if (def.safStatementIds && evidence.audit?.status === 'COMPLETED' && evidence.audit.safStatements) {
        const hasMatchingSaf = evidence.audit.safStatements.some(
          (stmt) => def.safStatementIds!.includes(stmt.statementId) && stmt.rating === 'MET'
        );
        if (hasMatchingSaf) {
          // Also check evidence type filter if specified
          if (!def.evidenceTypes || def.evidenceTypes.includes(evidence.evidenceType)) {
            matched = true;
            signalType = 'audit-verified';
          }
        }
      }

      // Tier 1 also: evidence type AUDIT with overall PASS for improvement indicator
      if (!matched && def.evidenceTypes && evidence.audit?.status === 'COMPLETED') {
        if (def.evidenceTypes.includes(evidence.evidenceType) && evidence.audit.overallResult === 'PASS') {
          matched = true;
          signalType = 'audit-verified';
        }
      }

      // Tier 2: Filename/description keyword matching (only if not already matched by Tier 1)
      if (!matched) {
        const searchText = `${evidence.fileName} ${evidence.description ?? ''}`;
        const hasKeywordMatch = def.matchPatterns.some((pattern) => pattern.test(searchText));
        if (hasKeywordMatch) {
          matched = true;
          signalType = 'keyword-matched';
        }
      }

      if (matched) {
        matchedItems.push({
          fileName: evidence.fileName,
          evidenceType: evidence.evidenceType,
          signalType,
        });
      }
    }

    return {
      id: def.id,
      label: def.label,
      description: def.description,
      hasEvidence: matchedItems.length > 0,
      evidenceCount: matchedItems.length,
      evidenceItems: matchedItems,
    };
  });

  const withEvidence = indicators.filter((i) => i.hasEvidence).length;
  const overallScore = indicators.length > 0
    ? Math.round((withEvidence / indicators.length) * 100)
    : 0;

  return { indicators, overallScore };
}

// ── Pack Assembly ───────────────────────────────────────────────────

export interface GeneratePackInput {
  facilityName: string;
  facilityId: string;
  inspectionStatus: string;
  evidenceInputs: EvidenceInput[];
  metadata: {
    topicCatalogVersion: string;
    topicCatalogHash: string;
    prsLogicProfilesVersion: string;
    prsLogicProfilesHash: string;
  };
  watermark?: string | null;
}

/**
 * Assemble an InspectorEvidencePack from evidence data.
 */
export function generateInspectorEvidencePack(input: GeneratePackInput): InspectorEvidencePack {
  const { qsMap, awaitingAuditMap } = mapEvidenceToQualityStatements(input.evidenceInputs);
  const outstandingReadiness = detectOutstandingIndicators(input.evidenceInputs);

  const keyQuestionOrder: KeyQuestion[] = ['SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL_LED'];
  const keyQuestionSections: KeyQuestionSection[] = keyQuestionOrder.map((kq) => {
    const qsForKq = SAF_34_QUALITY_STATEMENTS.filter((qs) => qs.keyQuestion === kq);

    const qualityStatements: QualityStatementEvidence[] = qsForKq.map((qs) => {
      const evidenceItems = qsMap.get(qs.id) ?? [];
      const awaitingAuditItems = awaitingAuditMap.get(qs.id) ?? [];
      const covered = evidenceItems.length > 0;

      const gaps: string[] = [];
      if (!covered && awaitingAuditItems.length === 0) {
        gaps.push(`No evidence mapped to ${qs.id}: ${qs.title}`);
      }

      return {
        id: qs.id,
        title: qs.title,
        covered,
        evidenceItems,
        awaitingAuditItems,
        gaps,
      };
    });

    const coveredCount = qualityStatements.filter((qs) => qs.covered).length;
    return {
      keyQuestion: kq,
      label: KEY_QUESTION_LABELS[kq],
      coverageSummary: {
        total: qsForKq.length,
        covered: coveredCount,
        percentage: qsForKq.length > 0 ? Math.round((coveredCount / qsForKq.length) * 100) : 0,
      },
      qualityStatements,
    };
  });

  const totalQs = SAF_34_QUALITY_STATEMENTS.length;
  const coveredQs = keyQuestionSections.reduce(
    (sum, section) => sum + section.coverageSummary.covered, 0
  );

  return {
    facilityName: input.facilityName,
    facilityId: input.facilityId,
    generatedAt: new Date().toISOString(),
    inspectionStatus: input.inspectionStatus,
    reportingDomain: 'MOCK_SIMULATION',
    watermark: input.watermark ?? null,
    overallCoverage: {
      total: totalQs,
      covered: coveredQs,
      percentage: totalQs > 0 ? Math.round((coveredQs / totalQs) * 100) : 0,
    },
    keyQuestionSections,
    outstandingReadiness,
    metadata: input.metadata,
  };
}

// ── Markdown Renderer ───────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Serialize an InspectorEvidencePack to markdown.
 */
export function serializeInspectorPackMarkdown(pack: InspectorEvidencePack): string {
  const lines: string[] = [];
  const isNeverInspected = pack.inspectionStatus === 'NEVER_INSPECTED' || pack.inspectionStatus === 'PENDING_FIRST_INSPECTION';
  const lowCoverage = pack.overallCoverage.percentage < 30;

  // 1. Header
  lines.push(`# Inspector Evidence Pack`);
  lines.push('');
  lines.push(`**Facility:** ${pack.facilityName}`);
  lines.push(`**Generated:** ${formatDate(pack.generatedAt)}`);
  if (pack.watermark) {
    lines.push(`**Watermark:** ${pack.watermark}`);
  }
  lines.push('');

  // 2. Overall Coverage Summary
  lines.push(`## Coverage Summary`);
  lines.push('');
  lines.push(`**${pack.overallCoverage.covered}/${pack.overallCoverage.total}** quality statements covered (**${pack.overallCoverage.percentage}%**)`);
  lines.push('');

  for (const section of pack.keyQuestionSections) {
    lines.push(`- ${section.label}: ${section.coverageSummary.covered}/${section.coverageSummary.total} (${section.coverageSummary.percentage}%)`);
  }
  lines.push('');

  // 3. Getting Started preamble (if low coverage)
  if (lowCoverage) {
    lines.push(`> **Getting Started:** This facility is in the early stages of evidence collection. The gaps identified below represent opportunities to strengthen your inspection readiness. Focus on the Recommended Next actions in your Readiness Journey.`);
    lines.push('');
  }

  // 3b. Never-inspected preamble
  if (isNeverInspected) {
    lines.push(`> Your facility has not yet been inspected by CQC. This evidence pack shows your current readiness position and highlights evidence that high-performing services typically maintain.`);
    lines.push('');
  }

  // For never-inspected facilities, show Outstanding Readiness Indicators before per-QS detail
  if (isNeverInspected) {
    renderOutstandingSection(lines, pack.outstandingReadiness);
  }

  // 4. Per Key Question sections
  for (const section of pack.keyQuestionSections) {
    lines.push(`## ${section.label}`);
    lines.push('');
    lines.push(`Coverage: ${section.coverageSummary.covered}/${section.coverageSummary.total} statements (${section.coverageSummary.percentage}%)`);
    lines.push('');

    for (const qs of section.qualityStatements) {
      const status = qs.covered ? 'Covered' : (qs.awaitingAuditItems.length > 0 ? 'Partial' : 'Gap');
      lines.push(`### ${qs.id}: ${qs.title} — ${status}`);
      lines.push('');

      if (qs.evidenceItems.length > 0) {
        lines.push(`| File | Type | Audit Result | Mapping | Expiry |`);
        lines.push(`|------|------|-------------|---------|--------|`);
        for (const item of qs.evidenceItems) {
          const expiry = item.expiresAt ? formatDate(item.expiresAt) : '—';
          const auditLabel = item.auditStatus === 'NOT_AUDITED' ? '—' :
            `${item.auditStatus}${item.complianceScore !== null ? ` (${item.complianceScore}%)` : ''}`;
          lines.push(`| ${item.fileName} | ${item.evidenceType} | ${auditLabel} | (${item.mappingSource}) | ${expiry} |`);
        }
        lines.push('');
      }

      if (qs.awaitingAuditItems.length > 0) {
        lines.push(`**Awaiting Audit:**`);
        lines.push('');
        for (const item of qs.awaitingAuditItems) {
          lines.push(`- ${item.fileName} (${item.evidenceType}) — audit pending`);
        }
        lines.push('');
      }

      if (qs.gaps.length > 0) {
        lines.push(`**Gaps:**`);
        lines.push('');
        for (const gap of qs.gaps) {
          lines.push(`- ${gap}`);
        }
        lines.push('');
      }
    }
  }

  // 5. Outstanding Readiness Indicators (for inspected facilities — after per-QS detail)
  if (!isNeverInspected) {
    renderOutstandingSection(lines, pack.outstandingReadiness);
  }

  // 6. Footer: Constitutional metadata
  lines.push(`---`);
  lines.push('');
  lines.push(`## Metadata`);
  lines.push('');
  lines.push(`- Topic Catalog: ${pack.metadata.topicCatalogVersion} (${pack.metadata.topicCatalogHash})`);
  lines.push(`- PRS Logic Profiles: ${pack.metadata.prsLogicProfilesVersion} (${pack.metadata.prsLogicProfilesHash})`);
  lines.push(`- Generated: ${pack.generatedAt}`);
  if (pack.watermark) {
    lines.push(`- Watermark: ${pack.watermark}`);
  }
  lines.push('');

  return lines.join('\n');
}

function renderOutstandingSection(lines: string[], outstanding: OutstandingReadinessSection): void {
  lines.push(`## Outstanding Readiness Indicators`);
  lines.push('');
  lines.push(`> *These indicators show evidence presence typically associated with high-performing services. They do not predict CQC ratings.*`);
  lines.push('');
  lines.push(`Overall indicator coverage: **${outstanding.overallScore}%** (${outstanding.indicators.filter((i) => i.hasEvidence).length}/${outstanding.indicators.length} indicators with evidence)`);
  lines.push('');

  for (const indicator of outstanding.indicators) {
    const badge = indicator.hasEvidence ? 'Present' : 'Missing';
    lines.push(`### ${indicator.label} — ${badge}`);
    lines.push('');
    lines.push(indicator.description);
    lines.push('');

    if (indicator.evidenceItems.length > 0) {
      for (const item of indicator.evidenceItems) {
        lines.push(`- ${item.fileName} (${item.evidenceType}) — (${item.signalType})`);
      }
      lines.push('');
    } else {
      lines.push(`*No matching evidence found.*`);
      lines.push('');
    }
  }
}
