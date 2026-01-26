/**
 * DomainBadge Component
 *
 * Displays the regulatory domain (CQC or IMMIGRATION).
 */

import styles from './DomainBadge.module.css';

interface DomainBadgeProps {
  domain: 'CQC' | 'IMMIGRATION';
}

export function DomainBadge({ domain }: DomainBadgeProps) {
  return (
    <span className={styles.badge} data-domain={domain}>
      {domain}
    </span>
  );
}
