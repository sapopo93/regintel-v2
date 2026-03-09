'use client';

/**
 * useRequireContext
 *
 * Shared redirect hooks that prevent dead-end pages when provider/facility
 * context is missing from URL params or sessionStorage.
 *
 * Waits one tick for useProviderContext to hydrate from sessionStorage before
 * deciding to redirect — prevents false redirects on pages without URL params
 * where context exists in sessionStorage.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderContext } from './useProviderContext';

interface RequiredContext {
  providerId: string | null;
  facilityId: string | null;
  ready: boolean;
}

/**
 * Redirects to `/` if both provider and facility are not available
 * (after sessionStorage hydration).
 */
export function useRequireProviderAndFacility(): RequiredContext {
  const router = useRouter();
  const { providerId, facilityId } = useProviderContext();
  const ready = Boolean(providerId && facilityId);
  const [hydrated, setHydrated] = useState(false);

  // Wait one tick for sessionStorage hydration in useProviderContext
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !providerId && !facilityId) {
      router.replace('/');
    }
  }, [hydrated, providerId, facilityId, router]);

  return { providerId, facilityId, ready };
}

/**
 * Redirects to `/` if provider is not available
 * (after sessionStorage hydration).
 */
export function useRequireProvider(): RequiredContext {
  const router = useRouter();
  const { providerId, facilityId } = useProviderContext();
  const ready = Boolean(providerId);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !providerId) {
      router.replace('/');
    }
  }, [hydrated, providerId, router]);

  return { providerId, facilityId, ready };
}
