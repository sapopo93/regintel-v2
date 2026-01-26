/**
 * Root Layout for RegIntel UI
 *
 * Provides persistent sidebar and constitutional metadata display.
 */

import type { Metadata } from 'next';
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
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
