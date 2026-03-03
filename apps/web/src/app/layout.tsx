/**
 * Root Layout for RegIntel UI
 *
 * Provides persistent sidebar and constitutional metadata display.
 * Wrapped with Clerk authentication provider (disabled in E2E test mode).
 */

import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthInitializer } from '@/components/layout/AuthInitializer';
import './globals.css';

export const metadata: Metadata = {
  title: 'RegIntel v2 - Regulatory Compliance Intelligence',
  description: 'Evidence-based compliance for UK CQC-registered care providers',
};

// E2E bypass mode must be enabled on BOTH server and client env flags.
// This prevents skipping ClerkProvider when only the server flag is set.
const isE2EMode =
  process.env.E2E_TEST_MODE === 'true' &&
  process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // In E2E test mode, skip ClerkProvider entirely to avoid client-side Clerk initialization
  if (isE2EMode) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <ClerkProvider
      appearance={{
        // Minimal appearance to reduce potential issues
        elements: {
          formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
        }
      }}
    >
      <html lang="en">
        <body>
          <AuthInitializer />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
