/**
 * SummaryLayer Component
 *
 * First layer: What happened (facts only).
 */

import styles from './SummaryLayer.module.css';

interface SummaryLayerProps {
  title: string;
  severity: string;
  description: string;
  onShowEvidence: () => void;
}

export function SummaryLayer({
  title,
  severity,
  description,
  onShowEvidence,
}: SummaryLayerProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <span className={styles.severity}>{severity}</span>
      </div>
      <p className={styles.description}>{description}</p>
      <button className={styles.button} onClick={onShowEvidence}>
        Show Evidence →
      </button>
    </div>
  );
}
