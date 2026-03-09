'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/layout/ErrorState';
import { reportError } from '@/lib/reportError';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'app' });
  }, [error]);

  return (
    <div style={{ padding: '2rem' }}>
      <ErrorState
        message={error.message || 'Something went wrong'}
        onRetry={reset}
      />
    </div>
  );
}
