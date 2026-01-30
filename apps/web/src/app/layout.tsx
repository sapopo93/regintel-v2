/**
 * Root Layout for RegIntel UI
 *
 * Provides persistent sidebar and constitutional metadata display.
 * Wrapped with Clerk authentication provider.
 */

import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
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
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
