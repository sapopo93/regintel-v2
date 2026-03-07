/**
 * SimulationModeBadge Component
 *
 * Inline badge indicating simulation mode is active.
 * Reassures users that mock findings cannot enter regulatory history.
 */

import styles from './SimulationModeBadge.module.css';

interface SimulationModeBadgeProps {
  reportingDomain: string;
}

export function SimulationModeBadge({ reportingDomain }: SimulationModeBadgeProps) {
  // Only show for MOCK_SIMULATION domain
  if (reportingDomain !== 'MOCK_SIMULATION') {
    return null;
  }

  return (
    <div className={styles.badge}>
      <span className={styles.indicator}>🟥</span>
      <span className={styles.text}>
        <strong>Practice Mode</strong>
        <span className={styles.subtext}>
          Results from this practice session are not part of your official CQC record
        </span>
      </span>
    </div>
  );
}
