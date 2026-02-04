import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * Root page - smart redirect based on auth state
 *
 * - E2E test mode: redirect to /facilities
 * - Signed in: redirect to / (from env) or /facilities
 * - Not signed in: redirect to /sign-in
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
  } else {
    // User is not signed in - go to sign-in
    redirect('/sign-in');
  }
}
