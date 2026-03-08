/**
 * CQC Language Adapter
 * Maps internal state/enum values to plain CQC/SAF34 language.
 * All customer-facing labels must flow through this module.
 */

export const PRS_LABELS: Record<string, string> = {
  NEW_PROVIDER: 'New provider',
  ESTABLISHED: 'No active enforcement',
  SPECIAL_MEASURES: 'Special Measures',
  ENFORCEMENT_ACTION: 'Enforcement action',
  RATING_INADEQUATE: 'Rated: Inadequate',
  RATING_REQUIRES_IMPROVEMENT: 'Rated: Requires Improvement',
  REOPENED_SERVICE: 'Reopened service',
  MERGED_SERVICE: 'Merged service',
  STABLE: 'Standard regulation',
};

const CQC_LABEL_MAP: Record<string, string> = {
  // UI section labels
  Snapshot: 'Inspection Record',
  'Topic Catalog': 'Quality Statements',
  'PRS Logic': 'Risk Profile',
  Mode: 'Data Mode',
  'Data Status': 'CQC Report Status',
  'Snapshot ID': 'Record ID',
  'Report Source': 'CQC Source',
  'Compliance Record (Locked)': 'Inspection Summary (locked)',

  // IngestionStatus enum values
  NO_SOURCE: 'Awaiting CQC report link',
  INGESTION_INCOMPLETE: 'Loading CQC data...',
  READY: 'CQC data loaded',

  // ReportMode enum values
  MOCK: 'Demonstration data (not live CQC)',
  REAL: 'Live CQC data',

  // Sentinels
  STATUS_UNAVAILABLE: 'Rating not yet available',
  'mock:mock:uninitialized': 'No CQC report linked yet',
  uninitialized: 'Not yet assessed',
};

export function toCqcLabel(key: string, ctx?: { date?: string }): string {
  if (ctx?.date && key === 'Compliance Record (Locked)') {
    return `Inspection Summary (as at ${ctx.date})`;
  }
  return CQC_LABEL_MAP[key] ?? key;
}

export const toCqcStatus = toCqcLabel;

export function toCqcIngestionStatus(status: string): string {
  return CQC_LABEL_MAP[status] ?? status;
}

export function toCqcMode(mode: string): string {
  return CQC_LABEL_MAP[mode] ?? mode;
}

export function toCqcPrsStatus(raw: string | undefined): string {
  if (!raw?.trim()) return CQC_LABEL_MAP['STATUS_UNAVAILABLE'];
  return PRS_LABELS[raw] ?? raw;
}
