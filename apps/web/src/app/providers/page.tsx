'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, RedirectToSignIn } from '@clerk/nextjs';
import { apiClient } from '@/lib/api/client';
import type {
  ProvidersListResponse,
  CreateProviderRequest,
  Provider,
} from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function ProvidersPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  const [data, setData] = useState<ProvidersListResponse | null>(null);
  const [providerName, setProviderName] = useState('');
  const [orgRef, setOrgRef] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  const loadProviders = () => {
    setLoading(true);
    setAuthError(false);
    apiClient.getProviders()
      .then((response) => {
        validateConstitutionalRequirements(response, { strict: true });
        setData(response);
        // If the org already has a provider, skip the setup screen and go straight to their dashboard
        if (response.providers.length === 1) {
          router.replace(`/facilities?provider=${response.providers[0].providerId}`);
        }
      })
      .catch((err) => {
        // Check if it's an auth error (401/403)
        if (err.status === 401 || err.status === 403) {
          setAuthError(true);
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  };

  // Wait for Clerk to load and confirm user is signed in before fetching data
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadProviders();
    } else if (isLoaded && !isSignedIn) {
      // Not signed in - will be handled by RedirectToSignIn below
      setLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  // Show loading while Clerk initializes
  if (!isLoaded) {
    return (
      <div className={styles.layout}>
        <div className={styles.loading}>Initializing...</div>
      </div>
    );
  }

  // If not signed in, redirect to sign-in (using Clerk component, not window.location)
  if (!isSignedIn || authError) {
    return <RedirectToSignIn />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!providerName.trim()) {
      setError('Provider name is required');
      return;
    }

    setSubmitting(true);

    try {
      const request: CreateProviderRequest = {
        providerName: providerName.trim(),
        orgRef: orgRef.trim() || undefined,
      };
      const response = await apiClient.createProvider(request);
      const { provider, ...metadata } = response;
      setProviderName('');
      setOrgRef('');
      setData((prev) => (
        prev
          ? { ...prev, providers: [...prev.providers, provider] }
          : { ...metadata, providers: [provider] }
      ));
      router.push(`/facilities?provider=${provider.providerId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create provider');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenProvider = (provider: Provider) => {
    router.push(`/facilities?provider=${provider.providerId}`);
  };

  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.loading}>Loading providers...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.layout}>
        <div className={styles.error}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Onboarding</p>
            <h1 className={styles.title}>Providers</h1>
            <p className={styles.subtitle}>Create a provider and register facilities.</p>
          </div>
        </div>

        <section className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Create Provider</h2>
          {error && <div className={styles.error}>{error}</div>}
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>
              Provider Name <span className={styles.required}>*</span>
              <input
                value={providerName}
                onChange={(event) => setProviderName(event.target.value)}
                className={styles.input}
                disabled={submitting}
                data-testid="provider-name-input"
              />
            </label>

            <label className={styles.label}>
              Organisation Reference (optional)
              <input
                value={orgRef}
                onChange={(event) => setOrgRef(event.target.value)}
                className={styles.input}
                disabled={submitting}
                data-testid="provider-orgref-input"
              />
            </label>

            <button
              type="submit"
              className={styles.submit}
              disabled={submitting}
              data-testid="primary-create-provider"
            >
              {submitting ? 'Creating...' : 'Create Provider'}
            </button>
          </form>
        </section>

        <section className={styles.list}>
          <h2 className={styles.sectionTitle}>Existing Providers</h2>
          {data && data.providers.length === 0 ? (
            <p className={styles.empty}>No providers yet.</p>
          ) : (
            <div className={styles.grid}>
              {data?.providers.map((provider) => (
                <div key={provider.providerId} className={styles.card}>
                  <div>
                    <h3 className={styles.cardTitle}>{provider.providerName}</h3>
                    <p className={styles.cardMeta}>Provider ID: {provider.providerId}</p>
                    {provider.orgRef && (
                      <p className={styles.cardMeta}>Org ref: {provider.orgRef}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.cardButton}
                    onClick={() => handleOpenProvider(provider)}
                    data-testid={`provider-open-${provider.providerId}`}
                  >
                    Manage Facilities
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
