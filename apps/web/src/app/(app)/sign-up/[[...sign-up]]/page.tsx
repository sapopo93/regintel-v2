'use client';

import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  // In E2E mode, this page won't be reached (middleware bypasses)
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignUp />
    </div>
  );
}
