import { getPRSLogicProfilesV1, getTopicCatalogV1 } from '@regintel/domain/frozen-registries';

export interface ConstitutionalMetadata {
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicVersion: string;
  prsLogicHash: string;
  snapshotTimestamp: string;
  domain: 'CQC' | 'IMMIGRATION';
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
}

export function buildConstitutionalMetadata(): ConstitutionalMetadata {
  const topicCatalog = getTopicCatalogV1();
  const prsLogic = getPRSLogicProfilesV1();

  return {
    topicCatalogVersion: topicCatalog.version,
    topicCatalogHash: `sha256:${topicCatalog.sha256}`,
    prsLogicVersion: prsLogic.version,
    prsLogicHash: `sha256:${prsLogic.sha256}`,
    snapshotTimestamp: new Date().toISOString(),
    domain: 'CQC',
    reportingDomain: 'MOCK_SIMULATION',
  };
}
