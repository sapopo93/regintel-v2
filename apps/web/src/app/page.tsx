import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  if (process.env.E2E_TEST_MODE === "true") {
    const userId = "e2e-user";
    const providerId = `${userId}:provider-1`;
    const facilityId = `${userId}:facility-1`;
    redirect(`/overview?provider=${providerId}&facility=${facilityId}`);
  }

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // IDs follow predictable pattern based on userId
  const providerId = `${userId}:provider-1`;
  const facilityId = `${userId}:facility-1`;

  redirect(`/overview?provider=${providerId}&facility=${facilityId}`);
}
