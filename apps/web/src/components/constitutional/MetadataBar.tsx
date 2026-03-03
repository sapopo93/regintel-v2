/**
 * MetadataBar Component
 *
 * Displays plain-language CQC record context for users.
 */

import { TimestampDisplay } from './TimestampDisplay';
import { DomainBadge } from './DomainBadge';
import type { ConstitutionalMetadata } from '@/lib/api/types';
import { toCqcIngestionStatus, toCqcMode } from '@/lib/cqcLanguage';
import styles from './MetadataBar.module.css';

interface MetadataBarProps extends ConstitutionalMetadata {
  compact?: boolean;
}

export function MetadataBar({
  snapshotTimestamp,
  domain,
  mode,
  ingestionStatus,
  compact = false,
}: MetadataBarProps) {
  const ingestionLabel = toCqcIngestionStatus(ingestionStatus);
  const modeLabel = toCqcMode(mode);
  if (compact) {
    return (
      <div className={styles.containerCompact}>
        <DomainBadge domain={domain} />
        <span className={styles.frozenLabel}>• Inspection Summary</span>
        <TimestampDisplay timestamp={snapshotTimestamp} label="As-of" dateOnly />
        <span className={styles.separator}>|</span>
        <span className={styles.version}>{ingestionLabel}</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <DomainBadge domain={domain} />
        <TimestampDisplay timestamp={snapshotTimestamp} label="Inspection Record" />
      </div>
      <div className={styles.row}>
        <span className={styles.metaLabel}>Data Type</span>
        <span className={styles.metaValue}>{modeLabel}</span>
        <span className={styles.metaLabel}>CQC Report Status</span>
        <span className={styles.metaValue}>{ingestionLabel}</span>
      </div>
    </div>
  );
}
