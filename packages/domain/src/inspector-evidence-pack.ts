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
export type MappingSource = 'audit-verified' | 'type-inferred' | 'finding-inferred';

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
  // General evidence types
  POLICY:        ['W1', 'W2', 'W5', 'W6'],
  TRAINING:      ['S6', 'C5', 'W7'],
  AUDIT:         ['W5', 'W7', 'W8', 'E5'],
  ROTA:          ['S6', 'E3'],
  SKILLS_MATRIX: ['S6', 'C5'],
  SUPERVISION:   ['C5', 'S6', 'W3'],
  // Domiciliary Care
  VISIT_LOG:              ['S2', 'S6', 'R1', 'C1'],
  MISSED_VISIT_RECORD:    ['S2', 'S3', 'W5', 'R4'],
  CERTIFICATE:   ['S6', 'C5'],
  CQC_REPORT:    ['S1', 'S3', 'E1', 'R1', 'W1', 'W5'],
  // Clinical records
  CARE_PLAN:           ['E1', 'R1', 'C2', 'E6'],
  MAR_CHART:           ['S8', 'S1'],
  RISK_ASSESSMENT:     ['S4', 'S1', 'E1'],
  INCIDENT_REPORT:     ['S1', 'S3', 'W5', 'W7'],
  DAILY_NOTES:         ['R1', 'C1', 'C4'],
  HANDOVER_NOTES:      ['S2', 'S8', 'E3'],
  MEDICATION_PROTOCOL: ['S8', 'S1', 'W5'],
  // Legal/Safeguarding
  DOLS_MCA_ASSESSMENT:  ['E6'],
  SAFEGUARDING_RECORD:  ['S3', 'S1', 'W5'],
  COMPLAINTS_LOG:       ['R4', 'W5', 'W7'],
  // Governance
  STAFF_MEETING_MINUTES: ['W1', 'W3', 'W7'],
  RECRUITMENT_FILE:      ['S6'],
  EQUALITY_ASSESSMENT:   ['R5'],
  BUSINESS_CONTINUITY_PLAN: ['W5'],
  ENVIRONMENTAL_AUDIT:   ['W8'],
  WORKFORCE_PLAN:        ['W4'],
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
 * Tier 3 keyword-based fallback mapping for OTHER-typed evidence.
 * Scans filename + description for patterns to infer QS relevance.
 */
export const QS_KEYWORD_PATTERNS: Record<string, RegExp[]> = {
  // SAFE (S1–S8)
  S1: [/safe/i, /incident/i, /learning/i, /near\s*miss/i, /root\s*cause/i],
  S2: [/transition/i, /discharge/i, /transfer/i, /handover/i, /pathway/i],
  S3: [/safeguard/i, /abuse/i, /concern/i, /allegation/i],
  S4: [/risk\s*assess/i, /risk\s*manage/i, /positive\s*risk/i],
  S5: [/fire/i, /environment/i, /premises/i, /maintenance/i, /health\s*and\s*safety/i],
  S6: [/training/i, /recruit/i, /staff/i, /induction/i, /DBS/i, /supervision/i, /rota/i],
  S7: [/infection/i, /hygiene/i, /cleaning/i, /IPC/i],
  S8: [/medic/i, /MAR/i, /prescri/i, /pharmacy/i, /controlled\s*drug/i],
  // EFFECTIVE (E1–E6)
  E1: [/assess/i, /care\s*plan/i, /needs\s*assess/i],
  E2: [/evidence.?based/i, /NICE/i, /guideline/i, /clinical\s*pathway/i, /best\s*practice/i],
  E3: [/handover/i, /multi.?disciplin/i, /MDT/i, /team\s*work/i],
  E4: [/nutri/i, /hydrat/i, /diet/i, /wellbeing/i, /health\s*promot/i],
  E5: [/monitor/i, /outcome/i, /wound/i, /clinical/i, /benchmark/i],
  E6: [/consent/i, /MCA/i, /capacity/i, /best\s*interest/i, /DoLS/i, /deprivation/i, /liberty/i],
  // CARING (C1–C5)
  C1: [/dignity/i, /privacy/i, /respect/i, /kind/i, /compassion/i],
  C2: [/individual/i, /cultural/i, /religio/i, /protected\s*characteristic/i],
  C3: [/independen/i, /choice/i, /control/i, /autonom/i, /advocacy/i],
  C4: [/immediate/i, /distress/i, /pain/i, /call\s*bell/i, /respond/i],
  C5: [/staff\s*wellbeing/i, /competenc/i, /supervis/i, /appraisal/i, /burnout/i],
  // RESPONSIVE (R1–R7)
  R1: [/person.?centred/i, /care\s*plan/i, /preference/i],
  R2: [/continuit/i, /integrat/i, /joined.?up/i, /coordinat/i],
  R3: [/information/i, /accessible/i, /easy.?read/i, /translat/i],
  R4: [/complaint/i, /feedback/i, /survey/i, /involve/i, /particip/i],
  R5: [/access/i, /barrier/i, /equit/i, /reasonable\s*adjust/i],
  R6: [/equal/i, /diversit/i, /inclus/i, /disparit/i, /inequalit/i],
  R7: [/end\s*of\s*life/i, /palliative/i, /bereave/i, /advance\s*care/i, /future/i],
  // WELL-LED (W1–W8)
  W1: [/vision/i, /culture/i, /values/i, /strateg/i],
  W2: [/leadership/i, /fit\s*proper/i, /capable/i, /compassionate\s*leader/i],
  W3: [/speak\s*up/i, /whistleblow/i, /candour/i, /openness/i],
  W4: [/workforce/i, /EDI/i, /staff\s*equal/i, /staff\s*divers/i],
  W5: [/governance/i, /audit/i, /quality\s*assurance/i, /compliance/i, /financial/i, /record/i, /notification/i],
  W6: [/partnership/i, /communit/i, /collaborat/i, /external/i],
  W7: [/improve/i, /lesson/i, /learning/i, /action\s*plan/i, /innovat/i],
  W8: [/environment\s*sustain/i, /carbon/i, /waste/i, /energy/i, /green/i],
};

/**
 * Topic-to-Quality-Statement mapping.
 * Maps mock inspection topic IDs to the SAF34 quality statements they cover.
 * Used to infer QS coverage from mock inspection findings.
 */
export const TOPIC_TO_QS: Record<string, string[]> = {
  // SAFE (S1–S8)
  'learning-culture':                    ['S1'],
  'safe-systems-pathways-transitions':   ['S2'],
  'safeguarding':                        ['S3'],
  'involving-people-manage-risks':       ['S4'],
  'safe-environments':                   ['S5'],
  'safe-effective-staffing':             ['S6'],
  'infection-prevention-control':        ['S7'],
  'medicines-optimisation':              ['S8'],
  // EFFECTIVE (E1–E6)
  'assessing-needs':                     ['E1'],
  'evidence-based-care':                 ['E2'],
  'staff-teams-work-together':           ['E3'],
  'supporting-healthier-lives':          ['E4'],
  'monitoring-improving-outcomes':       ['E5'],
  'consent-to-care':                     ['E6'],
  // CARING (C1–C5)
  'kindness-compassion-dignity':         ['C1'],
  'treating-people-as-individuals':      ['C2'],
  'independence-choice-control':         ['C3'],
  'responding-immediate-needs':          ['C4'],
  'workforce-wellbeing-enablement':      ['C5'],
  // RESPONSIVE (R1–R7)
  'person-centred-care':                 ['R1'],
  'care-continuity-integration':         ['R2'],
  'providing-information':               ['R3'],
  'listening-involving-people':          ['R4'],
  'equity-in-access':                    ['R5'],
  'equity-experiences-outcomes':         ['R6'],
  'planning-for-future':                 ['R7'],
  // WELL-LED (W1–W8)
  'shared-direction-culture':            ['W1'],
  'capable-compassionate-leaders':       ['W2'],
  'freedom-to-speak-up':                 ['W3'],
  'workforce-edi':                       ['W4'],
  'governance-management-sustainability': ['W5'],
  'partnerships-communities':            ['W6'],
  'learning-improvement-innovation':     ['W7'],
  'environmental-sustainability':        ['W8'],
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
 * Input shape for mock inspection findings passed to the pack generator.
 * Findings map to quality statements via their topicId.
 */
export interface FindingInput {
  findingId: string;
  topicId: string;
  topicTitle: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  createdAt: string;
}

/**
 * Map evidence items and findings to quality statements.
 *
 * Evidence mapping (three tiers):
 *   Tier 1: Completed audit with SAF statement ratings (MET/PARTIALLY_MET → mapped)
 *   Tier 2: For unaudited evidence, use EVIDENCE_TYPE_TO_QS fallback
 *   Tier 3: Keyword fallback for types with no QS mapping
 *
 * Findings mapping:
 *   Maps findings to QS via TOPIC_TO_QS (topic ID → quality statement IDs)
 *
 * Returns a map from QS id to array of EvidenceItems.
 */
export function mapEvidenceToQualityStatements(
  evidenceInputs: EvidenceInput[],
  findingInputs?: FindingInput[]
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
      let qsIds = EVIDENCE_TYPE_TO_QS[evidence.evidenceType] ?? [];

      // Tier 3: Keyword fallback for types with no QS mapping (e.g. OTHER, CQC_REPORT with empty mapping)
      if (qsIds.length === 0) {
        const searchText = `${evidence.fileName} ${evidence.description ?? ''}`;
        const matchedQs: string[] = [];
        for (const [qsId, patterns] of Object.entries(QS_KEYWORD_PATTERNS)) {
          if (patterns.some((p) => p.test(searchText))) {
            matchedQs.push(qsId);
          }
        }
        qsIds = matchedQs;
      }

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

  // Map findings to quality statements via topic → QS mapping
  if (findingInputs) {
    for (const finding of findingInputs) {
      const qsIds = TOPIC_TO_QS[finding.topicId] ?? [];
      for (const qsId of qsIds) {
        const items = qsMap.get(qsId);
        if (items) {
          items.push({
            evidenceId: finding.findingId,
            fileName: `Mock Inspection: ${finding.topicTitle}`,
            evidenceType: 'MOCK_FINDING',
            uploadedAt: finding.createdAt,
            description: `[${finding.severity}] ${finding.title}`,
            auditStatus: 'NOT_AUDITED',
            complianceScore: null,
            safRating: null,
            mappingSource: 'finding-inferred',
            expiresAt: null,
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
    safStatementIds: ['W1', 'W2', 'W5'],
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
    safStatementIds: ['S1', 'W7'],
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
    safStatementIds: ['S4', 'W5'],
    evidenceTypes: ['RISK_ASSESSMENT'],
    matchPatterns: [/positive\s*risk/i, /person.?centred\s*risk/i, /involve.*risk/i, /proactive/i],
  },
  {
    id: 'health-equity',
    label: 'Health Inequalities Awareness',
    description: 'Evidence addressing equity in access and outcomes for diverse populations.',
    safStatementIds: ['R5', 'R6'],
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
  findingInputs?: FindingInput[];
  metadata: {
    topicCatalogVersion: string;
    topicCatalogHash: string;
    prsLogicProfilesVersion: string;
    prsLogicProfilesHash: string;
  };
  watermark?: string | null;
}

/**
 * Assemble an InspectorEvidencePack from evidence and findings data.
 */
export function generateInspectorEvidencePack(input: GeneratePackInput): InspectorEvidencePack {
  const { qsMap, awaitingAuditMap } = mapEvidenceToQualityStatements(input.evidenceInputs, input.findingInputs);
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
