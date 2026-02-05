import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import LandingPage from '@/components/marketing/LandingPage';

/**
 * Root page - shows landing page or redirects authenticated users
 *
 * - E2E test mode: redirect to /facilities
 * - Signed in: redirect to /facilities
 * - Not signed in: show landing page
 */
export default async function HomePage() {
  const isE2EMode = process.env.E2E_TEST_MODE === 'true';

  if (isE2EMode) {
    redirect('/facilities');
  }

  // Check if user is already signed in
  const { userId } = await auth();

  if (userId) {
    // User is signed in - go to main app
    redirect('/facilities');
  }

  // User is not signed in - show landing page
  return <LandingPage />;
}
