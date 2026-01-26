# Deploy Notes

## Environment
- Copy `.env.example` to `.env` and set tokens.
- Required: `FOUNDER_TOKEN`, `PROVIDER_TOKEN`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_FOUNDER_TOKEN`, `NEXT_PUBLIC_PROVIDER_TOKEN`.

## Local run
1. Install dependencies:
   - `pnpm install`
   - `pnpm --dir apps/api install`
   - `pnpm --dir apps/web install`
2. Start API:
   - `pnpm --dir apps/api dev`
3. Start web:
   - `pnpm --dir apps/web dev`
4. Open `http://localhost:3000` and log in with the token from `.env`.

## Auth
- API uses Bearer tokens from `FOUNDER_TOKEN` and `PROVIDER_TOKEN`.
- UI login accepts tokens and stores them in localStorage.
- Export download links append `?token=...` from stored auth token.

## CI/Test commands
- `pnpm test`
- `pnpm gate --strict`
- `pnpm playwright test`
