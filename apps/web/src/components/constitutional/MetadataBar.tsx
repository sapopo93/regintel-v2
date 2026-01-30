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
    // Extract first 6 chars of hash for compact display
    const tcHashPrefix = topicCatalogHash.replace('sha256:', '').substring(0, 6);
    const prsHashPrefix = prsLogicHash.replace('sha256:', '').substring(0, 6);

    return (
      <div className={styles.containerCompact}>
        <DomainBadge domain={domain} />
        <span className={styles.frozenLabel}>• Inspection Snapshot (Frozen)</span>
        <TimestampDisplay timestamp={snapshotTimestamp} label="As-of" dateOnly />
        <span className={styles.separator}>|</span>
        <span className={styles.version} title={`Topic Catalog: ${topicCatalogHash}\nPRS Logic: ${prsLogicHash}`}>
          TC {topicCatalogVersion} ({tcHashPrefix}…) · PRS {prsLogicVersion} ({prsHashPrefix}…)
        </span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <DomainBadge domain={domain} />
        <TimestampDisplay timestamp={snapshotTimestamp} label="Snapshot" />
      </div>
      <div className={styles.row}>
        <VersionBadge label="Topic Catalog" version={topicCatalogVersion} />
        <HashDisplay hash={topicCatalogHash} />
      </div>
      <div className={styles.row}>
        <VersionBadge label="PRS Logic" version={prsLogicVersion} />
        <HashDisplay hash={prsLogicHash} />
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>Mode</span>
        <span className={styles.metaValue}>{mode}</span>
        <span className={styles.metaLabel}>Ingestion</span>
        <span className={styles.metaValue}>{ingestionStatus}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>Snapshot ID</span>
        <span className={styles.metaValueMono}>{snapshotId}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>Report Source</span>
        <span className={styles.metaValueMono}>{reportSource.type}:{reportSource.id}</span>
      </div>
    </div>
  );
}
