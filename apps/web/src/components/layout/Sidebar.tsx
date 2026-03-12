/**
 * Sidebar Component
 *
 * Persistent left sidebar with provider context and system status.
 * Never collapses - always visible.
 */

'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { VersionBadge } from '../constitutional/VersionBadge';
import { SIDEBAR_GROUPS } from '@/lib/constants';
import { useProviderContext } from '@/lib/hooks/useProviderContext';
import { toCqcPrsStatus } from '@/lib/cqcLanguage';
import styles from './Sidebar.module.css';

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
  latestRating?: string;
  topicCatalogVersion: string;
  prsLogicVersion: string;
  topicsCompleted?: number;
  totalTopics?: number;
  defaultFacilityId?: string;
}

export function Sidebar({
  providerName,
  snapshotDate,
  status,
  latestRating,
  topicCatalogVersion,
  prsLogicVersion,
  topicsCompleted,
  totalTopics,
  defaultFacilityId,
}: SidebarProps) {
  const pathname = usePathname();
  const { providerId, facilityId } = useProviderContext();
  const resolvedFacilityId = facilityId || defaultFacilityId;
  const rawStatus = status?.trim() || '';
  const statusLabel = toCqcPrsStatus(rawStatus || undefined);
  const formattedDate = formatSnapshotDate(snapshotDate);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.providerName}>{providerName}</div>
        <div className={styles.snapshot}>Data recorded: {formattedDate}</div>
        <div className={styles.status}>
          <span className={styles.statusLabel}>CQC Rating</span>
          <span className={styles.statusValue}>{statusLabel}</span>
          <span className={styles.statusSource}>Rated by CQC</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label} className={styles.navGroup}>
            <div className={styles.groupLabel}>{group.label}</div>
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const label =
                item.id === 'topics' && topicsCompleted !== undefined && totalTopics !== undefined
                  ? `${item.label} (${topicsCompleted} of ${totalTopics} covered)`
                  : item.label;

              const query = new URLSearchParams();
              if (providerId) {
                query.set('provider', providerId);
              }
              if (resolvedFacilityId) {
                query.set('facility', resolvedFacilityId);
              } else if (
                providerId &&
                item.id !== 'providers' &&
                item.id !== 'locations' &&
                item.id !== 'dashboard' &&
                item.id !== 'intelligence'
              ) {
                const facilitiesQuery = new URLSearchParams();
                facilitiesQuery.set('provider', providerId);
                return (
                  <Link
                    key={item.id}
                    href={`/locations?${facilitiesQuery.toString()}` as any}
                    className={isActive ? styles.navItemActive : styles.navItem}
                    data-testid={`sidebar-link-${item.id}`}
                  >
                    {label}
                  </Link>
                );
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
          </div>
        ))}
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
