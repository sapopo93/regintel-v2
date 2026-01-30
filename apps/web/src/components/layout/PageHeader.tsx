/**
 * PageHeader Component
 *
 * Page title and constitutional metadata display.
 * Used at the top of every page.
 */

import { MetadataBar } from '../constitutional/MetadataBar';
import type { ConstitutionalMetadata } from '@/lib/api/types';
import styles from './PageHeader.module.css';

interface PageHeaderProps extends ConstitutionalMetadata {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  ...metadata
}: PageHeaderProps) {
  const showIngestionBanner =
    metadata.mode === 'REAL' && metadata.ingestionStatus !== 'READY';

  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {showIngestionBanner && (
        <div className={styles.ingestionBanner} data-testid="ingestion-status-banner">
          <strong>Ingestion incomplete.</strong>
          <span>
            Source {metadata.reportSource.type}:{metadata.reportSource.id} · Snapshot {metadata.snapshotId}.
            Mock fallback disabled.
          </span>
        </div>
      )}
      <MetadataBar {...metadata} compact />
    </header>
  );
}
