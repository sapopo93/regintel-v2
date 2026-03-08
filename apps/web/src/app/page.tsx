import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import LandingPage from '@/components/marketing/LandingPage';

/**
 * Root page - shows landing page or redirects authenticated users
 *
 * - E2E test mode: redirect to /providers
 * - Signed in + has facility: redirect to /overview with real provider/facility IDs
 * - Signed in + no facility: redirect to /providers to create one
 * - Not signed in: show landing page
 */
export default async function HomePage() {
  if (process.env.E2E_TEST_MODE === "true") {
    const userId = "e2e-user";
    const providerId = `${userId}:provider-1`;
    const facilityId = `${userId}:facility-1`;
    redirect(`/overview?provider=${providerId}&facility=${facilityId}`);
  }

  const { userId, getToken } = await auth();

  if (userId) {
    try {
      const token = await getToken();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

      const res = await fetch(`${apiBase}/v1/facilities`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        const facilities: Array<{ id: string; providerId: string }> = data.facilities || [];

        if (facilities.length > 0) {
          const facility = facilities[0];
          const pid = encodeURIComponent(facility.providerId);
          const fid = encodeURIComponent(facility.id);
          redirect(`/overview?provider=${pid}&facility=${fid}`);
        }
      }
    } catch {
      // API unreachable — fall through to /providers
    }

    // No facilities found (new user) — go create a provider/facility first
    redirect('/providers');
  }

  return <LandingPage />;
}
