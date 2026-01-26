'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { setAuthToken, getAuthToken, type AuthRole } from '@/lib/auth';
import styles from './page.module.css';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextPath = searchParams.get('next') || '/providers';

  const [role, setRole] = useState<AuthRole>('FOUNDER');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = getAuthToken();
    if (existing) {
      router.replace(nextPath as any);
    }
  }, [nextPath, router]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError('Token is required');
      return;
    }

    setAuthToken(token.trim(), role);
    router.replace(nextPath as any);
  };

  const handleUseDemo = (demoToken?: string, demoRole?: AuthRole) => {
    // Fallback to hardcoded tokens if env vars not available
    const founderToken = process.env.NEXT_PUBLIC_FOUNDER_TOKEN || 'demo-founder-token-12345';
    const providerToken = process.env.NEXT_PUBLIC_PROVIDER_TOKEN || 'demo-provider-token-12345';

    const tokenToUse = demoRole === 'PROVIDER' ? providerToken : founderToken;
    const roleToUse = demoRole || 'FOUNDER';

    if (!tokenToUse) {
      setError('Demo token is not configured');
      return;
    }

    setError(null);
    setToken(tokenToUse);
    setRole(roleToUse);
    // Auto-submit after setting token
    setAuthToken(tokenToUse.trim(), roleToUse);
    router.replace(nextPath as any);
  };

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.header}>
          <p className={styles.kicker}>RegIntel v2</p>
          <h1 className={styles.title}>Sign In</h1>
          <p className={styles.subtitle}>Use your demo token to access the system.</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AuthRole)}
              className={styles.select}
              data-testid="login-role"
            >
              <option value="FOUNDER">Founder</option>
              <option value="PROVIDER">Provider</option>
            </select>
          </label>

          <label className={styles.label}>
            Bearer Token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className={styles.input}
              placeholder="Paste token from .env"
              data-testid="login-token"
            />
          </label>

          <button type="submit" className={styles.submit} data-testid="login-submit">
            Sign In
          </button>
        </form>

        <div className={styles.demoRow}>
          <button
            type="button"
            className={styles.demoButton}
            onClick={() => handleUseDemo(undefined, 'FOUNDER')}
            data-testid="login-demo-founder"
          >
            Use Founder Demo Token
          </button>
          <button
            type="button"
            className={styles.demoButton}
            onClick={() => handleUseDemo(undefined, 'PROVIDER')}
            data-testid="login-demo-provider"
          >
            Use Provider Demo Token
          </button>
        </div>
      </main>
    </div>
  );
}
