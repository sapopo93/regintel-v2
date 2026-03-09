'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/reportError';

export default function RootError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'root' });
  }, [error]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
      <p style={{ color: '#dc2626', marginBottom: '1rem' }}>
        {error.message || 'Something went wrong'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          background: '#fff',
          cursor: 'pointer',
          fontSize: '0.875rem',
        }}
      >
        Retry
      </button>
    </div>
  );
}
