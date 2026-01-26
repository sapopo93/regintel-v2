/**
 * TimestampDisplay Component
 *
 * Displays ISO 8601 timestamp for unambiguous temporal reference.
 */

import { formatTimestamp } from '@/lib/format';
import styles from './TimestampDisplay.module.css';

interface TimestampDisplayProps {
  timestamp: string;
  label?: string;
  dateOnly?: boolean;
}

export function TimestampDisplay({
  timestamp,
  label,
  dateOnly = false,
}: TimestampDisplayProps) {
  const formatted = formatTimestamp(timestamp, { dateOnly });

  return (
    <div className={styles.container}>
      {label && <span className={styles.label}>{label}:</span>}
      <time className={styles.timestamp} dateTime={timestamp}>
        {formatted}
      </time>
    </div>
  );
}
