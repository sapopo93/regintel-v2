/**
 * Clerk Sign-In Page
 *
 * Production authentication using Clerk.
 * Replaces demo token authentication.
 */

import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#f5f5f5',
    }}>
      <div>
        <div style={{
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: '0.875rem',
            fontWeight: '600',
            color: '#666',
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            RegIntel v2
          </p>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#111',
            margin: 0,
          }}>
            Sign In
          </h1>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: 'shadow-xl',
            },
          }}
        />
      </div>
    </div>
  );
}
