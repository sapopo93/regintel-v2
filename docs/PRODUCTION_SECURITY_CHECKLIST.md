# RegIntel v2 Production Security Checklist

This document outlines the security requirements that must be addressed before deploying RegIntel v2 to production.

## Status: ✅ P0+P1 REQUIREMENTS COMPLETE

**Last Updated:** 2026-03-14

**P0 Completion:** 100% (7/7 critical items complete)
**P1 Completion:** 100% (3/3 high priority items complete)

### ✅ P0 Critical Items (Completed 2026-01-29, updated 2026-03-14)

1. **Clerk Authentication** - Production JWT-based auth system
   - Frontend: ClerkProvider, middleware, SignIn component
   - Backend: JWT verification, webhook audit logging
   - Documentation: `docs/CLERK_SETUP.md`

2. **Phase 8 Integration Tests** - All 5 missing tests implemented
   - 21 tests passing (mock-separation, audit-chain, mock-session, evidence, reports)
   - Validates core architectural invariants
   - Files: `apps/api/src/*.integration.test.ts`

3. **Evidence Blob Storage** - Content-addressed filesystem storage
   - Deduplication, malware scanning stub, quarantine system
   - 9 unit tests passing
   - Documentation: `docs/BLOB_STORAGE.md`

4. **Backup & Restore System** - Automated PostgreSQL backups
   - Scripts: backup-db.sh, restore-db.sh, validate-backup.sh
   - Encryption support, checksum verification, retention policy
   - Documentation: `docs/BACKUP_RESTORE.md`

5. **HTTPS Enforcement** (Added 2026-03-14)
   - HTTP→HTTPS redirect in production (via x-forwarded-proto)
   - Helmet middleware with HSTS (1 year, includeSubDomains, preload)
   - Security headers: X-Content-Type-Options, X-Frame-Options, X-DNS-Prefetch-Control
   - File: `apps/api/src/app.ts`

6. **Error Handling Hardening** (Added 2026-03-14)
   - Stack traces suppressed in production responses
   - Request IDs in all error responses for correlation
   - Structured error logging with Winston
   - File: `apps/api/src/app.ts` (global error handler)

7. **Environment Variable Validation** (Added 2026-03-14)
   - Fail-fast on missing CLERK_SECRET_KEY or DATABASE_URL in production
   - Warning on localhost ALLOWED_ORIGINS in production
   - Validated via `envalid` on startup
   - File: `apps/api/src/env.ts`

### ✅ P1 High Priority Items (Completed 2026-03-14)

1. **Structured Logging** - Winston logger with JSON output in production
   - All console.log/warn/error replaced with structured logger
   - Security event logging via dedicated securityLogger
   - Request logging middleware (method, path, status, duration, tenantId)
   - Files: `apps/api/src/logger.ts`, `apps/api/src/app.ts`, `apps/api/src/auth.ts`

2. **Request ID Middleware** - Correlation IDs for debugging
   - x-request-id header propagated or generated (crypto.randomUUID)
   - Present in all responses, logs, and error messages
   - File: `apps/api/src/app.ts`

3. **Deep Health Check** - Dependency connectivity verification
   - `/health/deep` endpoint checks database and blob storage
   - Returns 503 if any dependency unreachable
   - Latency measurements per dependency
   - File: `apps/api/src/app.ts`

---

## ✅ Completed Security Improvements

### 1. Security Headers (DONE)
- ✅ Content Security Policy (CSP)
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection
- ✅ Referrer-Policy
- ✅ Permissions-Policy

**File:** `apps/web/next.config.js`

### 2. CORS Configuration (DONE)
- ✅ Restricted to allowed origins (configurable via `ALLOWED_ORIGINS` env var)
- ✅ Credentials support enabled
- ✅ Explicit methods and headers whitelist

**File:** `apps/api/src/app.ts`

### 3. Rate Limiting (DONE)
- ✅ 100 requests per 15-minute window per IP
- ✅ Standard rate limit headers
- ✅ Applied to all API routes

**File:** `apps/api/src/app.ts`

### 4. Existing Security Features
- ✅ Multi-tenant isolation with boundary violation detection
- ✅ Hash-chained immutable audit log (tamper-proof)
- ✅ Secrets scanning in CI (prevents credential leaks)
- ✅ React auto-escaping (XSS protection)
- ✅ No SQL injection risk (in-memory store, no SQL)

---

## ✅ Former Critical Blockers (P0 - Now Resolved)

> The items below were originally listed as P0 blockers. Items #1 (JWT auth) and #2 (httpOnly cookies) are now handled by Clerk. Item #3 (HTTPS) has been implemented.

### 1. ~~Replace Demo Authentication with Production Auth System~~ → DONE (Clerk)

**Resolved:** Production auth uses Clerk JWTs. Legacy tokens are security-hardened and blocked in production via `isTestAuthAllowed()`.

**Original State:** Hardcoded demo tokens in `apps/api/src/auth.ts`

```typescript
// ❌ INSECURE: Static tokens, no expiration, no rotation
const FOUNDER_TOKEN = process.env.FOUNDER_TOKEN || 'demo-founder-token-12345';
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN || 'demo-provider-token-12345';
```

**Required Changes:**

#### Option A: JWT-Based Authentication (Recommended)

1. Install dependencies:
```bash
cd apps/api
pnpm add jsonwebtoken bcrypt
pnpm add -D @types/jsonwebtoken @types/bcrypt
```

2. Create user management system:
```typescript
// apps/api/src/users.ts
interface User {
  userId: string;
  email: string;
  passwordHash: string;
  role: 'FOUNDER' | 'PROVIDER';
  tenantId: string;
  createdAt: string;
}

// Store users in TenantIsolatedStore
```

3. Implement JWT generation:
```typescript
// apps/api/src/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '1h';

export function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.userId,
      role: user.role,
      tenantId: user.tenantId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
```

4. Add login endpoint:
```typescript
app.post('/v1/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticateUser(email, password);

  if (!user) {
    return sendError(res, 401, 'Invalid credentials');
  }

  const token = generateToken(user);

  // Use httpOnly cookie instead of returning token
  res.cookie('auth_token', token, {
    httpOnly: true, // Prevents XSS access
    secure: true,   // HTTPS only
    sameSite: 'strict', // CSRF protection
    maxAge: 3600000, // 1 hour
  });

  res.json({ user: { userId: user.userId, role: user.role } });
});
```

5. Update auth middleware to verify JWT:
```typescript
// apps/api/src/auth.ts
export const authMiddleware: express.RequestHandler = (req, res, next) => {
  const token = req.cookies.auth_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = verifyToken(token);
    req.auth = {
      tenantId: payload.tenantId,
      actorId: payload.userId,
      role: payload.role,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

**Environment Variables Required:**
```bash
JWT_SECRET=<generate-secure-random-string-min-32-chars>
```

**Priority:** 🔴 **CRITICAL** - Cannot deploy without fixing

**Estimated Effort:** 2-3 days

---

### 2. Move Tokens from localStorage to httpOnly Cookies

**Current State:** `apps/web/src/lib/auth.ts` stores tokens in localStorage

```typescript
// ❌ VULNERABLE TO XSS
localStorage.setItem('regintel_auth_token', token);
```

**Required Changes:**

1. Remove localStorage usage:
```typescript
// apps/web/src/lib/auth.ts
export function login(token: string) {
  // ❌ Remove this
  // localStorage.setItem('regintel_auth_token', token);

  // ✅ Use httpOnly cookie set by API instead
  // Cookie is automatically sent with requests
}
```

2. Update API client to use credentials:
```typescript
// apps/web/src/lib/api/client.ts
const response = await fetch(url, {
  ...options,
  credentials: 'include', // Send cookies with requests
});
```

3. Update CORS to allow credentials:
```typescript
// Already done in apps/api/src/app.ts
credentials: true
```

**Priority:** 🔴 **CRITICAL** - XSS vulnerability

**Estimated Effort:** 1 day

---

### 3. HTTPS Enforcement in Production

**Current State:** No HTTPS enforcement or redirection

**Required Changes:**

1. Add HTTPS redirect middleware:
```typescript
// apps/api/src/app.ts (add before other middleware)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}
```

2. Enable HSTS (HTTP Strict Transport Security):
```bash
cd apps/api
pnpm add helmet
```

```typescript
import helmet from 'helmet';

app.use(helmet.hsts({
  maxAge: 31536000, // 1 year
  includeSubDomains: true,
  preload: true,
}));
```

3. Update cookie configuration for production:
```typescript
res.cookie('auth_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict',
  maxAge: 3600000,
});
```

**Environment Variables Required:**
```bash
NODE_ENV=production
```

**Priority:** 🔴 **CRITICAL** - Man-in-the-middle attack prevention

**Estimated Effort:** 1 day

---

## 🟡 High Priority (P1 - Fix Before Public Launch)

### 4. Input Validation with Zod

**Current State:** No runtime input validation

**Required Changes:**

1. Install Zod:
```bash
cd apps/api
pnpm add zod
```

2. Define schemas for all API endpoints:
```typescript
// apps/api/src/schemas.ts
import { z } from 'zod';

export const CreateFacilitySchema = z.object({
  facilityId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  address: z.string().min(1),
  cqcLocationId: z.string().regex(/^1-\d{9,11}$/),
  serviceType: z.enum(['residential', 'nursing', 'domiciliary', 'supported_living', 'hospice']),
});

export const CreateSessionSchema = z.object({
  sessionName: z.string().min(1).max(200),
  scope: z.enum(['FULL', 'TARGETED']),
  topicIds: z.array(z.string()).min(1),
});
```

3. Add validation middleware:
```typescript
function validate(schema: z.ZodSchema) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Validation error', error.errors);
      }
      next(error);
    }
  };
}

// Usage
app.post('/v1/facilities', validate(CreateFacilitySchema), (req, res) => {
  // req.body is now validated and typed
});
```

**Priority:** 🟡 **HIGH**

**Estimated Effort:** 2-3 days

---

### 5. Structured Logging and Monitoring

**Current State:** No logging or monitoring

**Required Changes:**

1. Install Winston logger:
```bash
cd apps/api
pnpm add winston
```

2. Configure structured logging:
```typescript
// apps/api/src/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

3. Add request logging middleware:
```typescript
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('API Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.auth?.actorId,
      tenantId: req.auth?.tenantId,
    });
  });

  next();
});
```

4. Log security events:
```typescript
// Log failed auth attempts
logger.warn('Authentication failed', {
  ip: req.ip,
  path: req.path,
  reason: 'Invalid token',
});

// Log tenant boundary violations
logger.error('Tenant boundary violation', {
  tenantId: ctx.tenantId,
  attemptedResource: resourceId,
});
```

**Priority:** 🟡 **HIGH**

**Estimated Effort:** 2 days

---

### 6. Environment Variable Validation

**Current State:** No validation of required environment variables

**Required Changes:**

1. Install envalid:
```bash
cd apps/api
pnpm add envalid
```

2. Validate environment on startup:
```typescript
// apps/api/src/env.ts
import { cleanEnv, str, url } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  JWT_SECRET: str({ desc: 'Secret for signing JWT tokens (min 32 chars)' }),
  ALLOWED_ORIGINS: str({ desc: 'Comma-separated list of allowed CORS origins' }),
  CQC_API_KEY: str({ default: '', desc: 'CQC API key for facility onboarding' }),
  LOG_LEVEL: str({ default: 'info', choices: ['error', 'warn', 'info', 'debug'] }),
});

// Usage in app
import { env } from './env';
const jwtSecret = env.JWT_SECRET;
```

**Priority:** 🟡 **HIGH**

**Estimated Effort:** 1 day

---

## 🟢 Medium Priority (P2 - Recommended Before Launch)

### 7. Error Handling Improvements

**Current State:** Error responses may leak internal details

**Required Changes:**

1. Global error handler:
```typescript
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
  });

  // Don't leak stack traces in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});
```

**Priority:** 🟢 **MEDIUM**

**Estimated Effort:** 1 day

---

### 8. Database Migration Plan

**Current State:** In-memory store (data lost on restart)

**Required Changes:**

1. Choose database: PostgreSQL (recommended for multi-tenant, RBAC)
2. Design schema with Row-Level Security (RLS)
3. Implement connection pooling
4. Add database backups
5. Implement migration system (Prisma/Drizzle)

**Priority:** 🟢 **MEDIUM** (critical for production data persistence)

**Estimated Effort:** 2 weeks

---

### 9. Automated Security Testing

**Current State:** Manual security review only

**Required Changes:**

1. Add OWASP ZAP or similar security scanner to CI
2. Add dependency vulnerability scanning (npm audit, Snyk)
3. Add secrets detection in pre-commit hook (already in CI)
4. Add penetration testing to release checklist

**Priority:** 🟢 **MEDIUM**

**Estimated Effort:** 1 week

---

## 🔵 Low Priority (P3 - Best Practices)

### 10. Security Incident Response Plan

Create `SECURITY.md` with:
- Vulnerability reporting process
- Security contact email
- Expected response times
- Responsible disclosure policy

**Priority:** 🔵 **LOW**

**Estimated Effort:** 1 day

---

### 11. Third-Party Security Audit

Hire external security firm to conduct:
- Penetration testing
- Code review
- Architecture review
- Compliance assessment (GDPR/CQC)

**Priority:** 🔵 **LOW** (but highly recommended)

**Estimated Effort:** External vendor, 2-4 weeks

---

## Production Deployment Checklist

Before deploying to production, ensure:

- [ ] All P0 (Critical) items completed
- [ ] All P1 (High Priority) items completed
- [ ] JWT_SECRET generated (min 32 chars, cryptographically random)
- [ ] NODE_ENV=production set
- [ ] ALLOWED_ORIGINS configured for production domains
- [ ] HTTPS certificate configured (Let's Encrypt or commercial)
- [ ] Database backups configured
- [ ] Monitoring and alerting configured
- [ ] Error tracking configured (Sentry, Rollbar, etc.)
- [ ] Load testing completed
- [ ] Security scan passed
- [ ] Incident response plan documented
- [ ] All tests passing (309/309)
- [ ] E2E tests passing

---

## Compliance Notes (CQC/GDPR)

RegIntel v2 serves UK CQC-regulated care providers handling sensitive data:

### GDPR/UK DPA 2018 Requirements
- ✅ Audit trail (Article 30: Records of processing activities)
- ✅ Encryption in transit (HTTPS enforcement + HSTS implemented 2026-03-14)
- ✅ Access controls (Clerk JWT auth + RBAC implemented)
- ❌ Data minimization (Review data retention policies)
- ❌ Right to erasure (Implement user deletion workflow)

### CQC Regulation 17 (Good Governance)
- ✅ Data integrity (immutable audit log)
- ✅ Tamper detection (hash-chain verification)
- ✅ Security incident logging (structured logging + security logger implemented 2026-03-14)
- ❌ Regular security reviews (penetration testing needed)

**Compliance Risk:** **MEDIUM** - Most security requirements met. Remaining: data retention policy, right-to-erasure endpoint, penetration testing

---

## Estimated Total Effort

| Priority | Tasks | Effort |
|----------|-------|--------|
| P0 (Critical) | 3 tasks | 4-5 days |
| P1 (High) | 3 tasks | 5-6 days |
| P2 (Medium) | 3 tasks | 3-4 weeks |
| P3 (Low) | 2 tasks | External vendor |

**Total for P0+P1:** ~2 weeks of focused development

---

## Next Steps

1. **Install dependencies:**
```bash
cd apps/api
pnpm install
```

2. **Run tests to verify nothing broke:**
```bash
pnpm test
```

3. **Build to verify TypeScript compiles:**
```bash
pnpm -C apps/web build
```

4. **Start implementing P0 items** (JWT auth, httpOnly cookies, HTTPS enforcement)

5. **Create GitHub issues** for tracking each security improvement

---

## Questions?

Contact the security team or create an issue in the repository.

**Last Reviewed:** 2026-03-14
