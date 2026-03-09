import { useEffect } from 'react';
import Link from 'next/link';
import { reportError } from '@/lib/reportError';
import styles from './ErrorState.module.css';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  useEffect(() => {
    reportError(message, { component: 'ErrorState' });
  }, [message]);

  return (
    <div className={styles.error} role="alert" aria-live="assertive">
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {onRetry && (
          <button onClick={onRetry} className={styles.retryButton}>
            Retry
          </button>
        )}
        <Link href="/" className={styles.homeLink}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
