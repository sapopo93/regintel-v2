/**
 * Root page - redirect to Clerk sign-in
 *
 * Users are redirected to /sign-in for Clerk authentication.
 * Clerk middleware handles unauthenticated access and redirects
 * authenticated users to /providers.
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/sign-in');
}
