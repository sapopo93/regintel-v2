# RegIntel v2 — Production Readiness Implementation Plan

**Created:** 2026-03-14
**Scope:** All work required to move from current state to production-ready deployment
**Estimated Timeline:** 4 weeks (P0+P1 in weeks 1-2, P2 in weeks 3-4)

---

## Current State Summary

| Area | Readiness | Notes |
|------|-----------|-------|
| Domain Logic | 95% | Solid: immutability, hash chains, temporal safety, determinism |
| Testing | 90% | 56 test files, integration tests, phase gates, Playwright E2E |
| Authentication | 85% | Clerk JWT + legacy tokens; test tokens blocked in production |
| Database | 95% | PostgreSQL RLS, Prisma migrations, content-addressed blobs |
| Security Headers | 70% | CSP/X-Frame/X-Content-Type in web; missing helmet in API |
| HTTPS/Transport | 0% | No enforcement, no HSTS, no redirect |
| Logging | 10% | Console-only; no structured logging, no request tracing |
| Monitoring | 0% | No APM, no metrics, no alerting |
| Deployment | 40% | PM2 basic config; no Docker, no health check depth |
| Compliance | 50% | Audit trail present; encryption/erasure/incident response missing |

---

## Phase 1: Security Hardening (Week 1)

### 1.1 HTTPS Enforcement & Helmet (P0)

**Why:** Without HTTPS enforcement, all auth tokens and sensitive data traverse the network in plaintext. GDPR Article 32 requires encryption in transit.

**Files to modify:**
- `apps/api/src/app.ts` — Add helmet middleware and HTTPS redirect
- `apps/api/package.json` — Add `helmet` dependency

**Implementation:**

1. Install helmet:
   ```bash
   cd apps/api && pnpm add helmet
   ```

2. Add HTTPS redirect middleware (before CORS, first middleware in stack):
   ```typescript
   // apps/api/src/app.ts — add after imports, before CORS
   import helmet from 'helmet';

   if (process.env.NODE_ENV === 'production') {
     app.use((req, res, next) => {
       if (req.header('x-forwarded-proto') !== 'https') {
         return res.redirect(301, `https://${req.headers.host}${req.url}`);
       }
       next();
     });
   }

   app.use(helmet({
     hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
     contentSecurityPolicy: false, // CSP handled by Next.js for web; API returns JSON only
     crossOriginEmbedderPolicy: false, // Allow cross-origin API calls
   }));
   ```

3. Add test for HTTPS redirect behavior in `apps/api/src/https-enforcement.test.ts`.

**Acceptance criteria:**
- [ ] `helmet` added to API dependencies
- [ ] HTTPS redirect active when `NODE_ENV=production`
- [ ] HSTS header present in all production responses (max-age=31536000)
- [ ] X-Content-Type-Options, X-Frame-Options, X-DNS-Prefetch-Control headers set by helmet
- [ ] Non-production environments unaffected (no redirect on localhost)
- [ ] Unit test validates redirect behavior

**Effort:** 0.5 days

---

### 1.2 Error Handling Hardening (P0)

**Why:** The current global error handler logs full stack traces via `console.error`. In production, stack traces in responses or logs accessible to attackers reveal internal paths, dependencies, and logic.

**Files to modify:**
- `apps/api/src/app.ts` — Update global error handler (bottom of file)
- `apps/api/src/logger.ts` — New file (see 2.1), used here

**Implementation:**

1. Update the global error handler at the bottom of `app.ts`:
   ```typescript
   app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
     const requestId = req.headers['x-request-id'] || crypto.randomUUID();

     // Always log full error internally
     logger.error('Unhandled error', {
       requestId,
       error: error.message,
       stack: error.stack,
       method: req.method,
       path: req.path,
       tenantId: req.auth?.tenantId,
     });

     // Never leak stack traces in production
     const isProduction = process.env.NODE_ENV === 'production';
     res.status(500).json({
       error: isProduction ? 'Internal server error' : error.message,
       ...(isProduction ? {} : { stack: error.stack }),
       requestId,
       ...buildConstitutionalMetadata(/* ... */),
     });
   });
   ```

2. Add request ID propagation middleware (early in stack):
   ```typescript
   app.use((req, _res, next) => {
     req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
     next();
   });
   ```

**Acceptance criteria:**
- [ ] Production responses contain only `"Internal server error"` + requestId (no stack traces)
- [ ] Development responses still include full error details
- [ ] Request IDs propagated for correlation
- [ ] All errors logged with structured context (method, path, tenantId)

**Effort:** 0.5 days

---

### 1.3 Environment Variable Validation (P0)

**Why:** Missing or misconfigured environment variables cause silent failures. A missing `CLERK_SECRET_KEY` in production means auth is silently bypassed.

**Files to create/modify:**
- `apps/api/src/env.ts` — New file: startup validation
- `apps/api/src/server.ts` — Import env validation before app starts
- `apps/api/package.json` — Add `envalid` dependency

**Implementation:**

1. Install envalid:
   ```bash
   cd apps/api && pnpm add envalid
   ```

2. Create `apps/api/src/env.ts`:
   ```typescript
   import { cleanEnv, str, port, bool, url } from 'envalid';

   export const env = cleanEnv(process.env, {
     NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
     PORT: port({ default: 3001 }),

     // Auth — required in production
     CLERK_SECRET_KEY: str({ default: '' }),
     CLERK_WEBHOOK_SECRET: str({ default: '' }),

     // Database — required when USE_DB_STORE=true
     DATABASE_URL: str({ default: '' }),
     USE_DB_STORE: str({ default: 'false' }),

     // Security
     ALLOWED_ORIGINS: str({ default: 'http://localhost:3000' }),

     // Optional services
     REDIS_URL: str({ default: '' }),
     CQC_API_KEY: str({ default: '' }),
     BLOB_STORAGE_PATH: str({ default: '/var/regintel/evidence-blobs' }),
     CLAMAV_ENABLED: str({ default: 'false' }),

     // Feature flags
     ENABLE_AI_INSIGHTS: str({ default: 'false' }),
   });

   // Custom validation for production
   if (env.NODE_ENV === 'production') {
     const missing: string[] = [];
     if (!env.CLERK_SECRET_KEY) missing.push('CLERK_SECRET_KEY');
     if (!env.DATABASE_URL) missing.push('DATABASE_URL');
     if (env.ALLOWED_ORIGINS === 'http://localhost:3000') missing.push('ALLOWED_ORIGINS (still localhost)');
     if (missing.length > 0) {
       throw new Error(`Production environment missing required variables: ${missing.join(', ')}`);
     }
   }
   ```

3. Import in `server.ts` as the first import (fail fast).

**Acceptance criteria:**
- [ ] Server refuses to start in production without `CLERK_SECRET_KEY` and `DATABASE_URL`
- [ ] Warning logged if `ALLOWED_ORIGINS` is still localhost in production
- [ ] Development/test modes work with defaults
- [ ] Clear error messages identify which variables are missing

**Effort:** 0.5 days

---

### 1.4 Security Checklist Update (P0)

**Why:** The existing `PRODUCTION_SECURITY_CHECKLIST.md` has stale entries (e.g., P0 items #1 and #2 reference localStorage tokens and manual JWT, which are now handled by Clerk). The checklist should reflect actual current state.

**Files to modify:**
- `docs/PRODUCTION_SECURITY_CHECKLIST.md` — Update to reflect Clerk auth completion, mark new items

**Implementation:**
- Remove stale references to manual JWT implementation (Clerk handles this)
- Remove localStorage token migration item (Clerk SDK manages tokens)
- Update P0 section to show Clerk auth as complete
- Add new P0/P1 items identified in this plan
- Update compliance section with current status

**Acceptance criteria:**
- [ ] Checklist accurately reflects current implementation state
- [ ] No stale/contradictory instructions remain
- [ ] New gaps from this review are captured as items

**Effort:** 0.5 days

---

## Phase 2: Observability (Week 2)

### 2.1 Structured Logging with Winston (P1)

**Why:** Console.log is ephemeral and unstructured. Production requires JSON-structured logs for aggregation (ELK, CloudWatch, Datadog), alerting, and audit compliance.

**Files to create/modify:**
- `apps/api/src/logger.ts` — New file: Winston logger configuration
- `apps/api/src/app.ts` — Replace all `console.log/warn/error` with logger calls
- `apps/api/src/auth.ts` — Replace console warnings with logger
- `apps/api/package.json` — Add `winston` dependency

**Implementation:**

1. Install winston:
   ```bash
   cd apps/api && pnpm add winston
   ```

2. Create `apps/api/src/logger.ts`:
   ```typescript
   import winston from 'winston';

   const isProduction = process.env.NODE_ENV === 'production';

   export const logger = winston.createLogger({
     level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
     format: winston.format.combine(
       winston.format.timestamp(),
       winston.format.errors({ stack: true }),
       isProduction
         ? winston.format.json()
         : winston.format.combine(winston.format.colorize(), winston.format.simple())
     ),
     defaultMeta: { service: 'regintel-api' },
     transports: [
       new winston.transports.Console(),
     ],
   });

   // Security event logger (separate for audit filtering)
   export const securityLogger = logger.child({ category: 'security' });
   ```

   Note: File transports intentionally omitted — production should use log aggregation services that consume stdout/stderr. PM2 handles log file routing.

3. Add request logging middleware in `app.ts` (after auth, before routes):
   ```typescript
   app.use((req, res, next) => {
     const start = Date.now();
     const requestId = req.headers['x-request-id'] as string;

     res.on('finish', () => {
       logger.info('request', {
         requestId,
         method: req.method,
         path: req.path,
         status: res.statusCode,
         duration: Date.now() - start,
         tenantId: req.auth?.tenantId,
         actorId: req.auth?.actorId,
       });
     });

     next();
   });
   ```

4. Replace `console.log/warn/error` in `app.ts` and `auth.ts` with `logger.info/warn/error`.

5. Log security-relevant events:
   - Auth failures → `securityLogger.warn`
   - Tenant boundary violations → `securityLogger.error`
   - Rate limit hits → `securityLogger.warn`
   - Startup configuration warnings → `logger.warn`

**Acceptance criteria:**
- [ ] All console.log/warn/error replaced with structured logger in `app.ts` and `auth.ts`
- [ ] JSON output in production, human-readable in development
- [ ] Request logging with method, path, status, duration, tenantId
- [ ] Security events logged with `category: 'security'` for filtering
- [ ] Request IDs in all log entries for correlation

**Effort:** 1.5 days

---

### 2.2 Health Check Enhancement (P1)

**Why:** The current `/health` endpoint returns config status but doesn't verify actual connectivity to dependencies. Load balancers and orchestrators need deep health checks.

**Files to modify:**
- `apps/api/src/app.ts` — Enhance health check endpoint

**Implementation:**

Add a `/health/deep` endpoint alongside the existing `/health`:

```typescript
app.get('/health/deep', async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Database check
  if (process.env.USE_DB_STORE === 'true') {
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latency: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'error', latency: Date.now() - dbStart };
    }
  }

  // Redis check (if configured)
  if (process.env.REDIS_URL) {
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'ok', latency: Date.now() - redisStart };
    } catch {
      checks.redis = { status: 'error', latency: Date.now() - redisStart };
    }
  }

  // Blob storage check
  if (process.env.BLOB_STORAGE_PATH) {
    try {
      await fs.access(process.env.BLOB_STORAGE_PATH, fs.constants.W_OK);
      checks.blobStorage = { status: 'ok' };
    } catch {
      checks.blobStorage = { status: 'error' };
    }
  }

  const allHealthy = Object.values(checks).every(c => c.status === 'ok');
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    uptime: process.uptime(),
  });
});
```

**Acceptance criteria:**
- [ ] `/health` remains lightweight (for frequent polling)
- [ ] `/health/deep` verifies database, Redis, blob storage connectivity
- [ ] Returns 503 if any dependency is unreachable
- [ ] Includes latency measurements for each check
- [ ] Load balancer can use `/health` for routing, ops can use `/health/deep` for diagnosis

**Effort:** 0.5 days

---

### 2.3 Request ID Middleware (P1)

**Why:** Without request IDs, correlating a user-reported error to specific log entries is impossible. Essential for production debugging.

**Files to modify:**
- `apps/api/src/app.ts` — Add middleware early in stack

**Implementation:**
```typescript
// Add as first middleware (before CORS, rate limiting)
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});
```

**Acceptance criteria:**
- [ ] Every response includes `x-request-id` header
- [ ] Incoming `x-request-id` is preserved (for distributed tracing)
- [ ] New UUID generated if none provided
- [ ] Request ID appears in all log entries (via logger middleware)

**Effort:** 0.25 days

---

## Phase 3: Infrastructure Hardening (Week 3)

### 3.1 PM2 Configuration Hardening (P1)

**Why:** Current PM2 config has no restart policies, memory limits, log management, or cluster mode. A memory leak or crash will take down the service permanently.

**Files to modify:**
- `ecosystem.config.cjs` — Add production-grade settings

**Implementation:**

```javascript
module.exports = {
  apps: [
    {
      name: 'regintel-api',
      cwd: './apps/api',
      script: 'pnpm',
      args: 'start',
      instances: 1,               // Scale to 'max' for cluster mode when needed
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'regintel-web',
      cwd: './apps/web',
      script: 'pnpm',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
```

Also update `deploy.sh` to create `logs/` directory and set up PM2 log rotation:
```bash
mkdir -p logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
```

**Acceptance criteria:**
- [ ] Both apps auto-restart on crash
- [ ] Memory limit triggers restart at 1GB (prevents OOM)
- [ ] Log files written to `./logs/` with timestamps
- [ ] Log rotation configured (50MB max, 30-day retention)
- [ ] `deploy.sh` creates logs directory

**Effort:** 0.5 days

---

### 3.2 Dockerfile & Docker Compose (P2)

**Why:** Containerization ensures consistent deployments, enables horizontal scaling, and is prerequisite for cloud orchestration (ECS, Kubernetes). Not blocking for initial production (PM2 works), but needed for scaling.

**Files to create:**
- `Dockerfile` — Multi-stage build for API
- `apps/web/Dockerfile` — Multi-stage build for web
- `docker-compose.yml` — Local development and staging
- `.dockerignore` — Exclude unnecessary files

**Implementation:**

1. Create `Dockerfile` (API):
   ```dockerfile
   FROM node:20-slim AS base
   RUN corepack enable && corepack prepare pnpm@latest --activate

   FROM base AS deps
   WORKDIR /app
   COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
   COPY packages/domain/package.json packages/domain/
   COPY packages/security/package.json packages/security/
   COPY packages/queue/package.json packages/queue/
   COPY apps/api/package.json apps/api/
   RUN pnpm install --frozen-lockfile --prod

   FROM base AS build
   WORKDIR /app
   COPY . .
   RUN pnpm install --frozen-lockfile
   RUN pnpm -C apps/api build

   FROM base AS runtime
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY --from=build /app/apps/api/dist ./dist
   COPY --from=build /app/apps/api/prisma ./prisma
   EXPOSE 3001
   CMD ["node", "dist/server.js"]
   ```

2. Create `docker-compose.yml`:
   ```yaml
   version: '3.8'
   services:
     api:
       build: .
       ports: ["3001:3001"]
       env_file: .env
       depends_on: [postgres, redis]
     web:
       build:
         context: .
         dockerfile: apps/web/Dockerfile
       ports: ["3000:3000"]
       env_file: .env
     postgres:
       image: postgres:15
       environment:
         POSTGRES_DB: regintel
         POSTGRES_USER: regintel
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
       volumes: [pgdata:/var/lib/postgresql/data]
     redis:
       image: redis:7-alpine
       ports: ["6379:6379"]
   volumes:
     pgdata:
   ```

**Acceptance criteria:**
- [ ] `docker compose up` starts full stack locally
- [ ] Multi-stage builds minimize image size (<500MB)
- [ ] Non-root user in container
- [ ] Health checks in compose config
- [ ] `.dockerignore` excludes node_modules, .git, .env, logs

**Effort:** 2 days

---

### 3.3 Deploy Script Hardening (P1)

**Why:** Current `deploy.sh` does `git pull origin main` and reloads PM2. No pre-deploy validation, no rollback strategy, no health check after deploy.

**Files to modify:**
- `deploy.sh` — Add validation steps

**Implementation:**

Add the following to `deploy.sh`:

```bash
#!/bin/bash
set -euo pipefail

echo "=== RegIntel v2 Deploy ==="

# Pre-deploy validation
echo "[1/7] Validating environment..."
node -e "require('./apps/api/src/env.ts')" 2>/dev/null || {
  echo "ERROR: Environment validation failed. Check .env"
  exit 1
}

# Pull latest
echo "[2/7] Pulling latest code..."
git pull origin main

# Install dependencies
echo "[3/7] Installing dependencies..."
pnpm install --frozen-lockfile

# Run database migrations
echo "[4/7] Running migrations..."
cd apps/api && pnpm db:deploy && cd ../..

# Build
echo "[5/7] Building..."
pnpm build

# Ensure log directory exists
echo "[6/7] Preparing logs..."
mkdir -p logs

# Reload PM2
echo "[7/7] Reloading services..."
pm2 reload ecosystem.config.cjs

# Post-deploy health check
echo "Waiting for services to start..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)
if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "ERROR: Health check failed (HTTP $HTTP_STATUS). Rolling back..."
  git checkout HEAD~1
  pnpm install --frozen-lockfile
  pnpm build
  pm2 reload ecosystem.config.cjs
  echo "ROLLED BACK. Investigate the failed deploy."
  exit 1
fi

echo "=== Deploy complete. Health check passed. ==="
```

**Acceptance criteria:**
- [ ] Deploy fails fast on environment validation errors
- [ ] Post-deploy health check verifies API is responding
- [ ] Automatic rollback on health check failure
- [ ] `set -euo pipefail` ensures any command failure stops deploy
- [ ] Log directory created before PM2 reload

**Effort:** 0.5 days

---

## Phase 4: Compliance & Documentation (Week 4)

### 4.1 SECURITY.md — Vulnerability Reporting (P2)

**Why:** Required by responsible disclosure best practices and expected by security researchers. GitHub surfaces this file prominently.

**Files to create:**
- `SECURITY.md` — Root-level vulnerability reporting policy

**Content outline:**
- Supported versions
- How to report vulnerabilities (email, not public issue)
- Expected response timeline (48h acknowledgment, 7-day assessment)
- Responsible disclosure policy
- Out-of-scope items

**Effort:** 0.25 days

---

### 4.2 Input Validation Audit (P1)

**Why:** Zod validation exists via `validateRequest()` but is not uniformly applied to all endpoints. Unvalidated endpoints are vulnerable to malformed input causing crashes or unexpected behavior.

**Files to modify:**
- `apps/api/src/app.ts` — Add Zod schemas to endpoints missing validation

**Implementation:**

1. Audit all POST/PUT/PATCH endpoints in `app.ts` for `validateRequest` usage
2. Create missing schemas in a `schemas.ts` file or inline
3. Key endpoints to validate:
   - `POST /v1/providers/:providerId/mock-sessions` — session creation params
   - `POST /v1/evidence/blobs` — metadata validation (file type, size limits)
   - `POST /v1/facilities/onboard` — facility data
   - `POST /v1/facilities/onboard-bulk` — array validation with max length
   - `PUT /v1/providers/:providerId/mock-sessions/:sessionId/respond` — response format
   - All export endpoints — format/type params

4. Add path parameter validation (`:providerId`, `:sessionId`, `:facilityId` formats)

**Acceptance criteria:**
- [ ] Every POST/PUT/PATCH endpoint has Zod validation
- [ ] Path parameters validated for format (no injection via URL params)
- [ ] Query parameters validated where used
- [ ] File upload endpoints validate content-type and size
- [ ] Validation errors return structured 400 responses with field-level details
- [ ] Test coverage for validation rejection cases

**Effort:** 2 days

---

### 4.3 GDPR Right-to-Erasure Endpoint (P2)

**Why:** UK DPA 2018 / GDPR Article 17 requires the ability to delete personal data on request. Care provider data includes staff names, facility details, and inspection findings.

**Files to create/modify:**
- `apps/api/src/app.ts` — Add `DELETE /v1/providers/:providerId/data` endpoint
- `packages/domain/src/data-erasure.ts` — Erasure logic with audit trail

**Implementation outline:**

1. Create erasure function that:
   - Removes all provider-scoped data (findings, evidence, sessions, actions)
   - Preserves anonymized audit log entries (required for regulatory compliance)
   - Creates a final audit entry recording the erasure request
   - Returns confirmation of what was deleted

2. Require FOUNDER role for erasure requests
3. Add confirmation parameter (e.g., `?confirm=true`) to prevent accidental deletion
4. Log erasure event to security logger

**Acceptance criteria:**
- [ ] FOUNDER can request full data erasure for a provider
- [ ] Audit trail preserved with anonymized entries
- [ ] Erasure logged as security event
- [ ] Confirmation required to prevent accidental deletion
- [ ] Integration test validates complete data removal

**Effort:** 2 days

---

### 4.4 Monitoring & Alerting Setup Guide (P2)

**Why:** No monitoring means production issues are discovered by users, not operators. This item creates the integration points; actual alerting configuration depends on chosen provider.

**Files to create:**
- `docs/MONITORING_SETUP.md` — Guide for connecting to monitoring providers
- `apps/api/src/metrics.ts` — Optional Prometheus metrics endpoint

**Implementation:**

1. Create `/metrics` endpoint (behind auth) exposing:
   - `http_requests_total` (method, path, status)
   - `http_request_duration_seconds` (histogram)
   - `active_mock_sessions` (gauge)
   - `background_jobs_total` (queue, status)
   - `health_check_status` (gauge per dependency)

2. Document integration with common providers:
   - Prometheus + Grafana (self-hosted)
   - Datadog (SaaS)
   - CloudWatch (AWS)

3. Document recommended alerts:
   - Error rate > 5% over 5 minutes
   - P99 latency > 5 seconds
   - Health check failures
   - Memory usage > 80%
   - Disk usage > 85%

**Acceptance criteria:**
- [ ] `/metrics` endpoint returns Prometheus-format metrics
- [ ] Documentation covers at least one monitoring provider setup
- [ ] Recommended alerts documented with thresholds
- [ ] Metrics do not expose sensitive data

**Effort:** 1.5 days

---

## Phase 5: Stretch Goals (Post-Launch)

These items improve resilience but are not required for initial production launch.

### 5.1 Automated Security Scanning in CI (P3)

- Add `npm audit` / `pnpm audit` to CI pipeline
- Add OWASP ZAP baseline scan against staging
- Add Snyk or Dependabot for dependency vulnerability alerts
- Add CodeQL for static analysis

**Effort:** 1 day

### 5.2 Database Connection Pooling Configuration (P3)

- Configure Prisma connection pool size (`connection_limit` in DATABASE_URL)
- Add connection pool monitoring
- Document recommended pool sizes for different deployment scales

**Effort:** 0.5 days

### 5.3 Encryption at Rest (P3)

- Enable PostgreSQL TDE or use AWS RDS encryption
- Encrypt evidence blobs before writing to disk
- Document key management strategy

**Effort:** 2 days

### 5.4 Load Testing (P3)

- Create k6 or Artillery load test scripts
- Define baseline performance targets (P50 < 200ms, P99 < 2s)
- Run against staging before production launch
- Document capacity limits

**Effort:** 1 day

### 5.5 Third-Party Security Audit (P3)

- Engage external firm for penetration testing
- Scope: API endpoints, auth flow, tenant isolation, blob storage
- Timeline: 2-4 weeks with external vendor

**Effort:** External vendor

---

## Summary Timeline

| Week | Phase | Items | Effort |
|------|-------|-------|--------|
| 1 | Security Hardening | 1.1 HTTPS/Helmet, 1.2 Error handling, 1.3 Env validation, 1.4 Checklist update | 2 days |
| 2 | Observability | 2.1 Structured logging, 2.2 Health check, 2.3 Request IDs, 3.3 Deploy script | 2.75 days |
| 3 | Infrastructure + Validation | 3.1 PM2 hardening, 3.2 Docker, 4.2 Input validation audit | 4.5 days |
| 4 | Compliance + Monitoring | 4.1 SECURITY.md, 4.3 GDPR erasure, 4.4 Monitoring guide | 3.75 days |
| Post | Stretch | Security scanning, connection pooling, encryption, load testing | As scheduled |

**Total P0+P1:** ~10 days of focused development
**Total P0+P1+P2:** ~15 days

---

## Pre-Launch Checklist

Before flipping the switch to production:

- [ ] **P0 Complete:** HTTPS enforcement, error hardening, env validation
- [ ] **P1 Complete:** Structured logging, health checks, PM2 hardening, deploy script, input validation
- [ ] **CI Green:** All 5 CI jobs passing (version-immutability, tests, integration-db, phase-gates, playwright)
- [ ] **Phase Gates:** `pnpm gate --strict` passes
- [ ] **Environment:** `.env.production` configured with real values (not defaults)
- [ ] **Database:** PostgreSQL provisioned, RLS verified, backup schedule configured
- [ ] **DNS/TLS:** Domain configured, TLS certificate provisioned (Let's Encrypt or commercial)
- [ ] **Reverse Proxy:** Nginx/Caddy configured for HTTPS termination, forwarding to PM2 ports
- [ ] **Monitoring:** At minimum, PM2 log rotation and uptime monitoring configured
- [ ] **Runbook:** Team knows how to deploy, rollback, and check health
- [ ] **Clerk:** Production keys configured, webhook endpoint verified
- [ ] **Backup Tested:** At least one backup + restore cycle completed successfully

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Memory leak in 4,500-line app.ts | Medium | High | PM2 max_memory_restart, monitoring, eventual refactor |
| CQC API rate limiting in production | Medium | Medium | Already handles gracefully; add monitoring |
| Clerk outage blocks all auth | Low | Critical | Legacy token fallback exists; document manual override procedure |
| Evidence blob storage fills disk | Medium | High | Monitoring alert on disk usage; deduplication already in place |
| Stale security checklist misleads team | High | Medium | Updated in Phase 1.4 of this plan |
| Single server failure | Medium | Critical | Docker + cloud deployment enables redundancy (Phase 3.2) |
