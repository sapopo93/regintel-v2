/**
 * MockBadge Component
 *
 * Displays origin badge for findings (MOCK, CQC, SELF).
 * Uses semantic styling to distinguish mock from official.
 */

import { getOriginBadge } from '@/lib/validators';
import styles from './MockBadge.module.css';

interface MockBadgeProps {
  origin: string;
}

export function MockBadge({ origin }: MockBadgeProps) {
  const badge = getOriginBadge({ origin });

  return (
    <span
      className={styles.badge}
      data-variant={badge.variant}
    >
      {badge.text}
    </span>
  );
}
