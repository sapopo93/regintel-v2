/**
 * VersionBadge Component
 *
 * Displays a version identifier with verification checkmark.
 * E.g., "Topic Catalog v1 ✓"
 */

import styles from './VersionBadge.module.css';

interface VersionBadgeProps {
  label: string;
  version: string;
  verified?: boolean;
}

export function VersionBadge({ label, version, verified = true }: VersionBadgeProps) {
  return (
    <div className={styles.container}>
      <span className={styles.label}>{label}</span>
      <span className={styles.version}>{version}</span>
      {verified && <span className={styles.checkmark}>✓</span>}
    </div>
  );
}
