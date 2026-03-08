/**
 * TraceLayer Component (The WHY Panel)
 *
 * Third layer: plain-language context for how the finding was reached.
 */

import styles from './TraceLayer.module.css';

interface TraceLayerProps {
  regulationSectionId: string;
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicVersion: string;
  prsLogicHash: string;
  deterministicHash: string;
}

export function TraceLayer({
  regulationSectionId,
}: TraceLayerProps) {
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>HOW THIS FINDING WAS REVIEWED</h3>

      <div className={styles.section}>
        <div className={styles.label}>Regulation Section</div>
        <div className={styles.value}>{regulationSectionId}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Quality Statements</div>
        <div className={styles.value}>Reviewed against CQC quality statements</div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Risk Profile</div>
        <div className={styles.value}>Applied consistent risk rules to the available evidence</div>
      </div>

      <div className={styles.notice}>
        This finding is produced using a consistent review method so similar evidence is handled the same way.
      </div>
    </div>
  );
}
