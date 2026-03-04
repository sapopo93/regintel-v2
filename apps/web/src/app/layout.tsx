/**
 * Root Layout for RegIntel UI
 *
 * Provides persistent sidebar and constitutional metadata display.
 * Wrapped with Clerk authentication provider.
 */

import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthInitializer } from '@/components/layout/AuthInitializer';
import './globals.css';

export const metadata: Metadata = {
  title: 'RegIntel v2 - Regulatory Compliance Intelligence',
  description: 'Evidence-based compliance for UK CQC-registered care providers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
