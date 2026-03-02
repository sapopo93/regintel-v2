/**
 * CQC Language Adapter
 * Maps internal enum/key values to plain CQC/SAF34 language.
 * All customer-facing labels must flow through this module.
 * Components MUST use LABEL_KEYS constants, not raw string keys.
 */

/** Stable keys for UI section labels — use these in component code, not raw strings */
export const LABEL_KEYS = {
  INSPECTION_RECORD: 'INSPECTION_RECORD',
  QUALITY_STATEMENTS: 'QUALITY_STATEMENTS',
  RISK_PROFILE: 'RISK_PROFILE',
  DATA_MODE: 'DATA_MODE',
  CQC_REPORT_STATUS: 'CQC_REPORT_STATUS',
  RECORD_ID: 'RECORD_ID',
  CQC_SOURCE: 'CQC_SOURCE',
  INSPECTION_SUMMARY: 'INSPECTION_SUMMARY',
} as const;

// Section/UI label mappings (keyed by LABEL_KEYS constants)
const SECTION_LABELS: Record<string, string> = {
  [LABEL_KEYS.INSPECTION_RECORD]: 'Inspection Record',
  [LABEL_KEYS.QUALITY_STATEMENTS]: 'Quality Statements',
  [LABEL_KEYS.RISK_PROFILE]: 'Risk Profile',
  [LABEL_KEYS.DATA_MODE]: 'Data Mode',
  [LABEL_KEYS.CQC_REPORT_STATUS]: 'CQC Report Status',
  [LABEL_KEYS.RECORD_ID]: 'Record ID',
  [LABEL_KEYS.CQC_SOURCE]: 'CQC Source',
  [LABEL_KEYS.INSPECTION_SUMMARY]: 'Inspection Summary',
};

// IngestionStatus enum values → CQC plain language
const INGESTION_STATUS_LABELS: Record<string, string> = {
  NO_SOURCE: 'Awaiting CQC report link',
  INGESTION_INCOMPLETE: 'Loading CQC data...',
  READY: 'CQC data loaded',
};

// ReportMode enum values → CQC plain language
const REPORT_MODE_LABELS: Record<string, string> = {
  MOCK: 'Demonstration data (not live CQC)',
  REAL: 'Live CQC data',
};

// QuestionMode enum values → CQC plain language
const QUESTION_MODE_LABELS: Record<string, string> = {
  evidence_first: 'Evidence-led review',
  narrative_first: 'Statement-led review',
  contradiction_hunt: 'Verification review',
  EVIDENCE_FIRST: 'Evidence-led review',
  NARRATIVE_FIRST: 'Statement-led review',
  CONTRADICTION_HUNT: 'Verification review',
  VERIFICATION_ONLY: 'Verification only',
};

/**
 * PRS (Provider Regulatory State) labels.
 * RegIntel-derived assessment — NOT an official CQC classification.
 * STABLE is a sentinel value not in the domain enum; treated same as ESTABLISHED.
 */
export const PRS_LABELS: Record<string, string> = {
  NEW_PROVIDER: 'Newly registered service',
  ESTABLISHED: 'No current enforcement',
  SPECIAL_MEASURES: 'Special measures',
  ENFORCEMENT_ACTION: 'Enforcement action recorded',
  RATING_INADEQUATE: 'Rated: Inadequate',
  RATING_REQUIRES_IMPROVEMENT: 'Rated: Requires Improvement',
  REOPENED_SERVICE: 'Reopened service',
  MERGED_SERVICE: 'Merged service',
  STABLE: 'No current enforcement',
};

/** Map a stable LABEL_KEYS constant to its customer-facing CQC label */
export function toCqcLabel(key: string, ctx?: { date?: string }): string {
  if (key === LABEL_KEYS.INSPECTION_SUMMARY && ctx?.date) {
    return `Inspection Summary (as at ${ctx.date})`;
  }
  return SECTION_LABELS[key] ?? key;
}

export function toCqcIngestionStatus(status: string): string {
  return INGESTION_STATUS_LABELS[status] ?? status;
}

export function toCqcMode(mode: string): string {
  return REPORT_MODE_LABELS[mode] ?? mode;
}

export function toCqcQuestionMode(mode: string): string {
  return QUESTION_MODE_LABELS[mode] ?? mode;
}

/**
 * Convert a ProviderRegulatoryState enum value to CQC-native plain language.
 * Falls back to "No rating shown for this location yet" when empty/unknown.
 */
export function toCqcPrsStatus(raw: string | undefined): string {
  if (!raw?.trim()) return 'No rating shown for this location yet';
  return PRS_LABELS[raw] ?? raw;
}
