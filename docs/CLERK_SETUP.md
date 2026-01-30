# Clerk Authentication Setup Guide

RegIntel v2 uses [Clerk](https://clerk.com) for production authentication, replacing demo tokens with secure, enterprise-grade user management.

## Overview

**Status:** ✅ **IMPLEMENTED**

- **Frontend:** `@clerk/nextjs` v6.37.0
- **Backend:** `@clerk/express` v1.7.66
- **Webhooks:** Integrated with audit log

## Quick Start

### 1. Create Clerk Application

1. Sign up at [clerk.com](https://clerk.com)
2. Create new application: "RegIntel v2"
3. Select authentication methods:
   - ✅ Email + Password (required)
   - ✅ Google OAuth (recommended)
   - ✅ Microsoft OAuth (for enterprise)

### 2. Configure Environment Variables

Add to `.env` (root directory):

```bash
# Clerk Configuration
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx  # From Clerk Dashboard
CLERK_SECRET_KEY=sk_test_xxx                    # From Clerk Dashboard
CLERK_WEBHOOK_SECRET=whsec_xxx                  # From Webhook configuration

# Optional: EU Data Residency (GDPR compliance)
CLERK_API_URL=https://api.clerk.com/eu
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### 3. Configure User Metadata Schema

In Clerk Dashboard → Configure → User & Authentication → Metadata:

```json
{
  "role": {
    "type": "string",
    "enum": ["FOUNDER", "PROVIDER"],
    "default": "PROVIDER",
    "description": "RegIntel user role"
  }
}
```

### 4. Configure Webhooks

1. Go to Clerk Dashboard → Webhooks → Add Endpoint
2. Endpoint URL:
   - **Development:** `https://your-ngrok-url/webhooks/clerk`
   - **Production:** `https://api.regintel.com/webhooks/clerk`
3. Subscribe to events:
   - ✅ `user.created`
   - ✅ `session.created`
   - ✅ `session.ended`
4. Copy Webhook Secret → Add to `.env` as `CLERK_WEBHOOK_SECRET`

### 5. Test Authentication

Start both servers:

```bash
# Terminal 1: API
pnpm api:dev

# Terminal 2: Web
pnpm web:dev
```

Visit `http://localhost:3000`:
1. Should redirect to `/sign-in`
2. Create test account
3. Verify redirect to `/providers` after sign-in
4. Check browser DevTools → Application → Cookies for Clerk session

## Architecture

### Frontend (Next.js 14)

**Root Layout:** `apps/web/src/app/layout.tsx`
```typescript
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

**Middleware:** `apps/web/middleware.ts`
```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/clerk',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});
```

**Sign-In Page:** `apps/web/src/app/(app)/sign-in/[[...sign-in]]/page.tsx`
```typescript
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <SignIn />
    </div>
  );
}
```

### Backend (Express)

**Auth Middleware:** `apps/api/src/auth.ts`
```typescript
import { clerkClient } from '@clerk/express';

export async function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify Clerk JWT
    const session = await clerkClient.sessions.verifyToken(token);
    const user = await clerkClient.users.getUser(session.userId);

    req.auth = {
      tenantId: user.organizationMemberships[0]?.organization.id || user.id,
      role: user.publicMetadata.role || 'PROVIDER',
      actorId: user.id,
      userId: user.id,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Webhook Handler:** `apps/api/src/webhooks/clerk.ts`
```typescript
import { Webhook } from 'svix';
import { store } from './store';

export async function handleClerkWebhook(req, res) {
  const payload = JSON.stringify(req.body);
  const headers = {
    'svix-id': req.header('svix-id'),
    'svix-timestamp': req.header('svix-timestamp'),
    'svix-signature': req.header('svix-signature'),
  };

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
  const event = wh.verify(payload, headers);

  const tenantId = event.data.organization_id || event.data.id;
  const ctx = { tenantId, actorId: 'SYSTEM' };

  switch (event.type) {
    case 'user.created':
      store.appendAuditEvent(ctx, tenantId, 'USER_CREATED', {
        userId: event.data.id,
        email: event.data.email_addresses[0]?.email_address,
      });
      break;
    // ... other events
  }

  res.status(200).json({ received: true });
}
```

## Security Features

### ✅ Implemented

- **httpOnly Cookies:** Session tokens stored in httpOnly cookies (XSS-safe)
- **JWT Verification:** Backend verifies Clerk JWTs on every request
- **Row-Level Security:** Tenant isolation enforced at DB layer
- **Audit Logging:** All auth events logged to immutable audit chain
- **Role-Based Access:** FOUNDER vs PROVIDER roles

### 🚧 Roadmap

- **MFA (Multi-Factor Authentication):** Available via Clerk (requires upgrade)
- **SSO (Single Sign-On):** SAML 2.0 for enterprise customers
- **Session Management:** Custom session duration, force logout
- **IP Allowlisting:** Restrict access by IP range

## Production Deployment

### Checklist

- [ ] Clerk production keys configured (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- [ ] Webhook endpoint accessible from internet (use ngrok for dev)
- [ ] HTTPS enforced (Clerk requires HTTPS in production)
- [ ] EU data residency enabled (if required for GDPR)
- [ ] Backup webhook endpoint configured (failover)
- [ ] User metadata schema deployed
- [ ] Test account created and verified

### Environment Variables

**Production `.env`:**
```bash
# Clerk Production Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Data Residency (Optional)
CLERK_API_URL=https://api.clerk.com/eu

# Remove demo tokens (security risk)
# FOUNDER_TOKEN=...  # DELETE IN PRODUCTION
# PROVIDER_TOKEN=... # DELETE IN PRODUCTION
```

### Rate Limits

**Clerk Free Tier:**
- 5,000 Monthly Active Users (MAU)
- Unlimited API requests
- Email + password + social SSO included

**Clerk Pro Tier ($25/mo):**
- 10,000 MAU (additional users $0.02/user)
- MFA, SSO, advanced roles
- 99.95% uptime SLA

## Troubleshooting

### Issue: "Unauthorized: Invalid token"

**Cause:** Clerk JWT verification failed

**Solutions:**
1. Check `CLERK_SECRET_KEY` is set correctly
2. Verify API server can reach Clerk API (`api.clerk.com`)
3. Check browser sends `Authorization: Bearer <token>` header
4. Verify Clerk middleware is before API routes in `apps/api/src/app.ts`

### Issue: Webhook verification failed

**Cause:** Svix signature mismatch

**Solutions:**
1. Check `CLERK_WEBHOOK_SECRET` matches Clerk Dashboard
2. Verify webhook endpoint receives raw JSON (not parsed)
3. Check Svix headers are passed correctly (`svix-id`, `svix-timestamp`, `svix-signature`)

### Issue: User role not set

**Cause:** Public metadata not configured

**Solutions:**
1. Go to Clerk Dashboard → User & Authentication → Metadata
2. Add `role` field with enum `["FOUNDER", "PROVIDER"]`
3. Set default to `"PROVIDER"`
4. Update existing users manually or via Clerk API

## Migration from Demo Tokens

### Before (Legacy)

```typescript
// ❌ INSECURE: Hardcoded tokens, localStorage
const token = localStorage.getItem('regintel.auth.token');
if (token === 'demo-founder-token-12345') {
  // Authenticate
}
```

### After (Clerk)

```typescript
// ✅ SECURE: JWT verification, httpOnly cookies
import { useAuth } from '@clerk/nextjs';

const { isSignedIn, userId } = useAuth();
if (isSignedIn) {
  // Authenticated
}
```

### Rollout Strategy

1. **Week 1:** Deploy Clerk alongside demo tokens (dual auth)
2. **Week 2:** Notify users to migrate to Clerk accounts
3. **Week 3:** Disable demo token login (force Clerk)
4. **Week 4:** Remove demo token code entirely

## Support

- **Clerk Documentation:** https://clerk.com/docs
- **Clerk Support:** https://clerk.com/support (Pro tier only)
- **RegIntel Issues:** https://github.com/yourusername/regintel-v2/issues

