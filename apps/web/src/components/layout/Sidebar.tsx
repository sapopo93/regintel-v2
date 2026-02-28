/**
 * Sidebar Component
 *
 * Persistent left sidebar with provider context and system status.
 * Never collapses - always visible.
 */

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { VersionBadge } from '../constitutional/VersionBadge';
import { SIDEBAR_NAVIGATION } from '@/lib/constants';
import styles from './Sidebar.module.css';

const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

/** Isolated so useClerk() is only called when ClerkProvider is mounted */
function SignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      className={styles.signOutButton}
      onClick={() => signOut({ redirectUrl: '/sign-in' })}
      data-testid="sidebar-sign-out"
    >
      Sign Out
    </button>
  );
}

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
  const statusLabel = status?.trim() ? status : 'STATUS UNAVAILABLE';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.providerName}>{providerName}</div>
        <div className={styles.snapshot}>Snapshot: {snapshotDate}</div>
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
              ? `${item.label} (${topicsCompleted}/${totalTopics} complete)`
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
          label="Topic Catalog"
          version={topicCatalogVersion}
          verified
        />
        <VersionBadge label="PRS Logic" version={prsLogicVersion} verified />
        <div className={styles.statusItem}>
          <span>Deterministic</span>
          <span className={styles.checkmark}>✓</span>
        </div>
        {!isE2EMode && <SignOutButton />}
      </div>
    </aside>
  );
}
