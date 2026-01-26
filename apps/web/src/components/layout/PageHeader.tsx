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
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <MetadataBar {...metadata} compact />
    </header>
  );
}
