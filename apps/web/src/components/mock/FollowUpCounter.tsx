/**
 * FollowUpCounter Component
 *
 * Displays follow-up usage counter for mock inspection sessions.
 * E.g., "Follow-ups used: 2 / 4"
 */

import { formatFollowUpCounter } from '@/lib/format';
import styles from './FollowUpCounter.module.css';

interface FollowUpCounterProps {
  used: number;
  limit: number;
}

export function FollowUpCounter({ used, limit }: FollowUpCounterProps) {
  const formatted = formatFollowUpCounter(used, limit);
  const exhausted = used >= limit;

  return (
    <div className={styles.container} data-exhausted={exhausted}>
      <span className={styles.label}>{formatted}</span>
      {exhausted && (
        <span className={styles.warning}>Limit reached</span>
      )}
    </div>
  );
}
