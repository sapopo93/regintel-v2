/**
 * TraceLayer Component (The WHY Panel)
 *
 * Third layer: How the conclusion was reached (deterministic reasoning chain).
 * Shows versions, hashes, regulation references, and deterministic hash.
 */

import { HashDisplay } from '../constitutional/HashDisplay';
import { VersionBadge } from '../constitutional/VersionBadge';
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
  topicCatalogVersion,
  topicCatalogHash,
  prsLogicVersion,
  prsLogicHash,
  deterministicHash,
}: TraceLayerProps) {
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>WHY THIS FINDING EXISTS</h3>

      <div className={styles.section}>
        <div className={styles.label}>Regulation Section</div>
        <div className={styles.value}>{regulationSectionId}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Topic Catalog</div>
        <VersionBadge label="" version={topicCatalogVersion} />
        <HashDisplay hash={topicCatalogHash} />
      </div>

      <div className={styles.section}>
        <div className={styles.label}>PRS Logic</div>
        <VersionBadge label="" version={prsLogicVersion} />
        <HashDisplay hash={prsLogicHash} />
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Deterministic Hash</div>
        <code className={styles.deterministicHash}>{deterministicHash}</code>
      </div>

      <div className={styles.notice}>
        This finding was generated deterministically using the versions and
        hashes shown above. The same inputs will always produce the same result.
      </div>
    </div>
  );
}
