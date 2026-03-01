'use client';

/**
 * useProviderContext
 *
 * Returns the current provider and facility IDs.
 * Primary source: URL search params (?provider= & ?facility=).
 * Fallback: sessionStorage (persisted from the last page that had them).
 *
 * This keeps provider/facility context alive across navigations to pages
 * that don't carry those params in their URL (e.g. /providers, /facilities).
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'regintel:provider_context';

interface ProviderContext {
  providerId: string | null;
  facilityId: string | null;
}

export function useProviderContext(): ProviderContext {
  const searchParams = useSearchParams();
  const urlProviderId = searchParams.get('provider');
  const urlFacilityId = searchParams.get('facility');

  // Start with URL params — avoids hydration mismatch (server and client see same initial value)
  const [context, setContext] = useState<ProviderContext>({
    providerId: urlProviderId,
    facilityId: urlFacilityId,
  });

  useEffect(() => {
    if (urlProviderId && urlFacilityId) {
      // URL has both IDs — persist and use
      const next = { providerId: urlProviderId, facilityId: urlFacilityId };
      setContext(next);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    } else {
      // URL is missing one or both — restore from sessionStorage
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          setContext(JSON.parse(stored));
          return;
        }
      } catch { /* ignore */ }
      setContext({ providerId: urlProviderId, facilityId: urlFacilityId });
    }
  }, [urlProviderId, urlFacilityId]);

  return context;
}
