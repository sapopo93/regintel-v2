/**
 * Sidebar Component
 *
 * Persistent left sidebar with provider context and system status.
 * Never collapses - always visible.
 */

'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { VersionBadge } from '../constitutional/VersionBadge';
import { SIDEBAR_NAVIGATION } from '@/lib/constants';
import styles from './Sidebar.module.css';

const PRS_LABELS: Record<string, string> = {
  NEW_PROVIDER: 'New provider',
  ESTABLISHED: 'No active enforcement',
  SPECIAL_MEASURES: 'Special Measures',
  ENFORCEMENT_ACTION: 'Enforcement action',
  RATING_INADEQUATE: 'Rated: Inadequate',
  RATING_REQUIRES_IMPROVEMENT: 'Rated: Requires Improvement',
  REOPENED_SERVICE: 'Reopened service',
  MERGED_SERVICE: 'Merged service',
  STABLE: 'Standard regulation',
};

function formatSnapshotDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

/** Lazy-loaded so Clerk client code is not bundled into the shared app layout chunk */
const SignOutButton = dynamic(() => import('./SignOutButton'), { ssr: false });

interface SidebarProps {
  providerName: string;
  snapshotDate: string;
  status?: string;
  topicCatalogVersion: string;
  prsLogicVersion: string;
  topicsCompleted?: number;
  totalTopics?: number;
}

export function Sidebar({
  providerName,
  snapshotDate,
  status,
  topicCatalogVersion,
  prsLogicVersion,
  topicsCompleted,
  totalTopics,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');
  const rawStatus = status?.trim() || '';
  const statusLabel = rawStatus ? (PRS_LABELS[rawStatus] ?? rawStatus) : 'STATUS UNAVAILABLE';
  const formattedDate = formatSnapshotDate(snapshotDate);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.providerName}>{providerName}</div>
        <div className={styles.snapshot}>Data recorded: {formattedDate}</div>
        <div className={styles.status}>
          <span className={styles.statusLabel}>Last Recorded Rating</span>
          <span className={styles.statusValue}>{statusLabel}</span>
          <span className={styles.statusSource}>Source: CQC</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {SIDEBAR_NAVIGATION.map((item) => {
          const isActive = pathname === item.href;
          const label =
            item.id === 'topics' && topicsCompleted !== undefined && totalTopics !== undefined
              ? `${item.label} (${topicsCompleted} of ${totalTopics} covered)`
              : item.label;

          const query = new URLSearchParams();
          if (providerId) {
            query.set('provider', providerId);
          }
          if (facilityId) {
            query.set('facility', facilityId);
          }
          const href = query.toString() ? `${item.href}?${query.toString()}` : item.href;

          return (
            <Link
              key={item.id}
              href={href as any}
              className={isActive ? styles.navItemActive : styles.navItem}
              data-testid={`sidebar-link-${item.id}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.systemStatus}>
        <VersionBadge
          label="Inspection Framework"
          version={topicCatalogVersion}
          verified
        />
        <VersionBadge label="Assessment Rules" version={prsLogicVersion} verified />
        <div className={styles.statusItem}>
          <span>Verified</span>
          <span className={styles.checkmark}>✓</span>
        </div>
        {!isE2EMode && <SignOutButton />}
      </div>
    </aside>
  );
}
