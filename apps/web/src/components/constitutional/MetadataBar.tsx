/**
 * MetadataBar Component
 *
 * Displays constitutional metadata (version, hash, time, domain) at top of views.
 * Every view must include this to satisfy UI constitutional requirements.
 */

import { HashDisplay } from './HashDisplay';
import { VersionBadge } from './VersionBadge';
import { TimestampDisplay } from './TimestampDisplay';
import { DomainBadge } from './DomainBadge';
import type { ConstitutionalMetadata } from '@/lib/api/types';
import styles from './MetadataBar.module.css';

interface MetadataBarProps extends ConstitutionalMetadata {
  compact?: boolean;
}

export function MetadataBar({
  topicCatalogVersion,
  topicCatalogHash,
  prsLogicVersion,
  prsLogicHash,
  snapshotTimestamp,
  domain,
  mode,
  reportSource,
  snapshotId,
  ingestionStatus,
  compact = false,
}: MetadataBarProps) {
  if (compact) {
    return (
      <div className={styles.containerCompact}>
        <DomainBadge domain={domain} />
        <span className={styles.frozenLabel}>• Verified Inspection Record</span>
        <TimestampDisplay timestamp={snapshotTimestamp} label="Data as of" dateOnly />
        <span className={styles.separator}>|</span>
        <span className={styles.version} title={`Topic Catalog: ${topicCatalogHash}\nPRS Logic: ${prsLogicHash}`}>
          Compliance Framework {topicCatalogVersion} · Rules Engine {prsLogicVersion}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <DomainBadge domain={domain} />
        <TimestampDisplay
          timestamp={new Date(snapshotTimestamp).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          label="Data as of"
        />
      </div>
      <div className={styles.row}>
        <VersionBadge label="Compliance Framework" version={topicCatalogVersion} />
        <HashDisplay hash={topicCatalogHash} />
      </div>
      <div className={styles.row}>
        <VersionBadge label="Rules Engine" version={prsLogicVersion} />
        <HashDisplay hash={prsLogicHash} />
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>Inspection Type</span>
        <span className={styles.metaValue}>
          {mode === 'REAL' ? 'Live CQC Data' : mode === 'MOCK' ? 'Practice Inspection' : mode}
        </span>
        <span className={styles.metaLabel}>Import Status</span>
        <span className={styles.metaValue}>
          {ingestionStatus === 'READY'
            ? 'Complete'
            : ingestionStatus === 'INGESTION_INCOMPLETE'
              ? 'In Progress'
              : ingestionStatus === 'NO_SOURCE'
                ? 'No data source'
                : ingestionStatus}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>Record Reference</span>
        <span className={styles.metaValueMono}>{snapshotId}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>Data Source</span>
        <span className={styles.metaValueMono}>{reportSource.type}:{reportSource.id}</span>
      </div>
    </div>
  );
}
