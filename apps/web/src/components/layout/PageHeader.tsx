/**
 * PageHeader Component
 *
 * Page title and constitutional metadata display.
 * Used at the top of every page.
 */

import type { ConstitutionalMetadata } from '@/lib/api/types';
import styles from './PageHeader.module.css';

interface PageHeaderProps extends ConstitutionalMetadata {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  hasReport?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  hasReport,
  ...metadata
}: PageHeaderProps) {
  const showIngestionBanner =
    metadata.mode === 'REAL' &&
    metadata.ingestionStatus !== 'READY' &&
    !hasReport;

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
          <strong>CQC data import in progress.</strong>
          <span>
            Your CQC inspection data is being imported. Some information may not yet be available.
          </span>
        </div>
      )}
    </header>
  );
}
