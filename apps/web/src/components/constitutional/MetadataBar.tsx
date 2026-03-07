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
import { toCqcIngestionStatus, toCqcMode, toCqcLabel, LABEL_KEYS } from '@/lib/cqcLanguage';
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
  const ingestionLabel = toCqcIngestionStatus(ingestionStatus);
  const modeLabel = toCqcMode(mode);
  if (compact) {
    // Extract first 6 chars of hash for compact display
    const tcHashPrefix = topicCatalogHash.replace('sha256:', '').substring(0, 6);
    const prsHashPrefix = prsLogicHash.replace('sha256:', '').substring(0, 6);
    const snapshotDate = new Date(snapshotTimestamp).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <div className={styles.containerCompact}>
        <DomainBadge domain={domain} />
        <span className={styles.frozenLabel}>• {toCqcLabel(LABEL_KEYS.INSPECTION_SUMMARY, { date: snapshotDate })}</span>
        <TimestampDisplay timestamp={snapshotTimestamp} label="As-of" dateOnly />
        <span className={styles.separator}>|</span>
        <span
          className={styles.version}
          title={`${toCqcLabel(LABEL_KEYS.QUALITY_STATEMENTS)}: ${topicCatalogHash}\n${toCqcLabel(LABEL_KEYS.RISK_PROFILE)}: ${prsLogicHash}`}
        >
          TC {topicCatalogVersion} ({tcHashPrefix}…) · PRS {prsLogicVersion} ({prsHashPrefix}…)
        </span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <DomainBadge domain={domain} />
        <TimestampDisplay timestamp={snapshotTimestamp} label={toCqcLabel(LABEL_KEYS.INSPECTION_RECORD)} />
      </div>
      <div className={styles.row}>
        <VersionBadge label={toCqcLabel(LABEL_KEYS.QUALITY_STATEMENTS)} version={topicCatalogVersion} />
        <HashDisplay hash={topicCatalogHash} />
      </div>
      <div className={styles.row}>
        <VersionBadge label={toCqcLabel(LABEL_KEYS.RISK_PROFILE)} version={prsLogicVersion} />
        <HashDisplay hash={prsLogicHash} />
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>{toCqcLabel(LABEL_KEYS.DATA_MODE)}</span>
        <span className={styles.metaValue}>{modeLabel}</span>
        <span className={styles.metaLabel}>{toCqcLabel(LABEL_KEYS.CQC_REPORT_STATUS)}</span>
        <span className={styles.metaValue}>{ingestionLabel}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>{toCqcLabel(LABEL_KEYS.RECORD_ID)}</span>
        <span className={styles.metaValueMono}>{snapshotId}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>{toCqcLabel(LABEL_KEYS.CQC_SOURCE)}</span>
        <span className={styles.metaValueMono}>{reportSource.type}:{reportSource.id}</span>
      </div>
    </div>
  );
}
