# Deploy Notes

## Environment
- Copy `.env.example` to `.env` and set Clerk keys.
- Required: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_BASE_URL`.
- For local/E2E tests: set `CLERK_TEST_TOKEN`, `NEXT_PUBLIC_CLERK_TEST_TOKEN`, and optional `CLERK_TEST_ROLE`.

## Local run
1. Install dependencies:
   - `pnpm install`
   - `pnpm --dir apps/api install`
   - `pnpm --dir apps/web install`
2. Start API:
   - `pnpm --dir apps/api dev`
3. Start web:
   - `pnpm --dir apps/web dev`
4. Open `http://localhost:3000` and sign in via Clerk.

## Auth
- API expects a Clerk JWT in `Authorization: Bearer <token>` or `?token=...` for downloads.
- UI uses Clerk `getToken()` for all API requests.
- Export download links append `?token=...` using the Clerk token.

## CI/Test commands
- `pnpm test`
- `pnpm gate --strict`
- `pnpm playwright test`
