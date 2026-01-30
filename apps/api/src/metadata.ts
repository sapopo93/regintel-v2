import { getPRSLogicProfilesV1, getTopicCatalogV1 } from '@regintel/domain/frozen-registries';

export type ReportMode = 'REAL' | 'MOCK';
export type IngestionStatus = 'NO_SOURCE' | 'INGESTION_INCOMPLETE' | 'READY';
export type ReportSourceType = 'cqc_upload' | 'mock';

export interface ReportSource {
  type: ReportSourceType;
  id: string;
  asOf: string;
}

export interface ConstitutionalMetadata {
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicVersion: string;
  prsLogicHash: string;
  snapshotTimestamp: string;
  domain: 'CQC' | 'IMMIGRATION';
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
  mode: ReportMode;
  reportSource: ReportSource;
  snapshotId: string;
  ingestionStatus: IngestionStatus;
}

export interface ReportContext {
  reportingDomain: ConstitutionalMetadata['reportingDomain'];
  mode: ReportMode;
  reportSource: ReportSource;
  snapshotId: string;
  snapshotTimestamp: string;
  ingestionStatus: IngestionStatus;
}

export function buildConstitutionalMetadata(
  overrides: Partial<ConstitutionalMetadata> = {}
): ConstitutionalMetadata {
  const topicCatalog = getTopicCatalogV1();
  const prsLogic = getPRSLogicProfilesV1();
  const now = new Date().toISOString();

  const reportSource: ReportSource = overrides.reportSource ?? {
    type: 'mock',
    id: 'system',
    asOf: now,
  };

  const reportingDomain =
    overrides.reportingDomain ??
    (reportSource.type === 'cqc_upload' ? 'REGULATORY_HISTORY' : 'MOCK_SIMULATION');

  const mode: ReportMode =
    overrides.mode ?? (reportingDomain === 'REGULATORY_HISTORY' ? 'REAL' : 'MOCK');

  const snapshotTimestamp = overrides.snapshotTimestamp ?? reportSource.asOf ?? now;
  const snapshotId = overrides.snapshotId ?? `snapshot:${reportSource.type}:${reportSource.id}`;
  const ingestionStatus = overrides.ingestionStatus ?? 'NO_SOURCE';

  return {
    topicCatalogVersion: topicCatalog.version,
    topicCatalogHash: `sha256:${topicCatalog.sha256}`,
    prsLogicVersion: prsLogic.version,
    prsLogicHash: `sha256:${prsLogic.sha256}`,
    snapshotTimestamp,
    domain: overrides.domain ?? 'CQC',
    reportingDomain,
    mode,
    reportSource,
    snapshotId,
    ingestionStatus,
  };
}
