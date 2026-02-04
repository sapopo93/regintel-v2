import { SignIn } from '@clerk/nextjs';

/**
 * Sign-In Page
 *
 * Uses Clerk's SignIn component with minimal configuration.
 * All redirect URLs come from environment variables.
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <SignIn
        appearance={{
          elements: {
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
          }
        }}
      />
    </div>
  );
}
