/**
 * EvidenceLayer Component
 *
 * Second layer: Why it happened (supporting data).
 */

import styles from './EvidenceLayer.module.css';

interface EvidenceLayerProps {
  required: string[];
  provided: string[];
  missing: string[];
  onShowTrace: () => void;
}

export function EvidenceLayer({
  required,
  provided,
  missing,
  onShowTrace,
}: EvidenceLayerProps) {
  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <h4 className={styles.heading}>Evidence Required</h4>
        <ul className={styles.list}>
          {required.map((item, index) => (
            <li key={index} className={styles.listItem}>{item}</li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <h4 className={styles.heading}>Evidence Provided</h4>
        {provided.length > 0 ? (
          <ul className={styles.list}>
            {provided.map((item, index) => (
              <li key={index} className={styles.listItem}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No evidence provided</p>
        )}
      </div>

      {missing.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.heading}>Missing Evidence</h4>
          <ul className={styles.list}>
            {missing.map((item, index) => (
              <li key={index} className={styles.listItemMissing}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <button className={styles.button} onClick={onShowTrace}>
        Show Trace →
      </button>
    </div>
  );
}
