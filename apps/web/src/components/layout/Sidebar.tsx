/**
 * Sidebar Component
 *
 * Persistent left sidebar with provider context and system status.
 * Never collapses - always visible.
 */

'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { SIDEBAR_NAVIGATION } from '@/lib/constants';
import styles from './Sidebar.module.css';

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
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityIdFromQuery = searchParams.get('facility');
  const statusLabel = useMemo(() => {
    const rating = latestRating?.trim();
    if (rating) return rating;

    const normalizedStatus = status?.trim().toUpperCase();
    if (normalizedStatus === 'ESTABLISHED' || normalizedStatus === 'GOOD') {
      return 'Good';
    }
    if (normalizedStatus === 'OUTSTANDING') {
      return 'Outstanding';
    }
    if (normalizedStatus === 'REQUIRES_IMPROVEMENT') {
      return 'Requires improvement';
    }
    if (normalizedStatus === 'INADEQUATE') {
      return 'Inadequate';
    }

    if (status?.trim()) {
      return status;
    }

    return 'Not yet rated';
  }, [latestRating, status]);
  const [storedFacilityId, setStoredFacilityId] = useState<string | null>(null);

  const facilityIdFromPath = useMemo(() => {
    const match = pathname.match(/^\/facilities\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  useEffect(() => {
    if (!providerId) return;
    const storageKey = `regintel:lastFacility:${providerId}`;
    const knownFacility =
      facilityIdFromQuery || facilityIdFromPath || defaultFacilityId || null;

    if (knownFacility) {
      try {
        window.localStorage.setItem(storageKey, knownFacility);
      } catch {
        // Ignore storage issues and keep runtime behavior.
      }
      setStoredFacilityId(knownFacility);
      return;
    }

    try {
      const persisted = window.localStorage.getItem(storageKey);
      setStoredFacilityId(persisted);
    } catch {
      setStoredFacilityId(null);
    }
  }, [providerId, facilityIdFromQuery, facilityIdFromPath, defaultFacilityId]);

  const resolvedFacilityId =
    facilityIdFromQuery || facilityIdFromPath || defaultFacilityId || storedFacilityId;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.providerName}>{providerName}</div>
        <div className={styles.snapshot}>
          Last updated:{' '}
          {new Date(snapshotDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
        <div className={styles.status}>
          <span className={styles.statusLabel}>CQC Rating</span>
          <span className={styles.statusValue}>{statusLabel}</span>
          <span className={styles.statusSource}>Rated by CQC</span>
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
          if (resolvedFacilityId) {
            query.set('facility', resolvedFacilityId);
          } else if (
            providerId &&
            item.id !== 'providers' &&
            item.id !== 'facilities'
          ) {
            // Without a facility context, route users back to facility selection.
            const facilitiesQuery = new URLSearchParams();
            facilitiesQuery.set('provider', providerId);
            return (
              <Link
                key={item.id}
                href={`/facilities?${facilitiesQuery.toString()}` as any}
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
      </nav>

      <div className={styles.systemStatus}>
        {!isE2EMode && <SignOutButton />}
      </div>
    </aside>
  );
}
