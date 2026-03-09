import { ReactNode } from 'react';
import { ToastProvider } from '@/components/toast/ToastProvider';

// Force all authenticated routes to use dynamic rendering
// This prevents Next.js 14 from trying to statically prerender pages that use useSearchParams()
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
