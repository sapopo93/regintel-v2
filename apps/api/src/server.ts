import 'dotenv/config';
import { createApp } from './app';

const PORT = process.env.PORT || 3001;

// Startup validation — log warnings for dangerous production misconfigurations
function validateStartupConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];
  const errors: string[] = [];

  if (process.env.E2E_TEST_MODE === 'true') {
    warnings.push('E2E_TEST_MODE=true — Clerk authentication is BYPASSED. Disable in production.');
  }

  if (process.env.CLERK_TEST_TOKEN) {
    warnings.push('CLERK_TEST_TOKEN is set — demo auth tokens are active. Remove in production.');
  }

  if (!process.env.CQC_API_KEY) {
    warnings.push('CQC_API_KEY is not set — CQC location lookups may fail (401 errors).');
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost')) {
    if (isProduction) {
      errors.push('DATABASE_URL points to localhost in production — data will not persist.');
    }
  }

  if (!process.env.REDIS_URL || process.env.REDIS_URL.includes('localhost')) {
    warnings.push('REDIS_URL points to localhost — background jobs will use in-memory queue (lost on restart).');
  }

  if (process.env.BLOB_STORAGE_PATH?.startsWith('/tmp')) {
    warnings.push('BLOB_STORAGE_PATH is under /tmp — uploaded evidence will be lost on server restart.');
  }

  if (warnings.length > 0) {
    console.warn('\n[STARTUP] Configuration warnings:');
    warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
  }

  if (errors.length > 0) {
    console.error('\n[STARTUP] Configuration errors:');
    errors.forEach(e => console.error(`  ❌  ${e}`));
  }

  if (warnings.length === 0 && errors.length === 0) {
    console.log('[STARTUP] Configuration looks good.');
  }

  console.log(`[STARTUP] Store: ${process.env.USE_DB_STORE !== 'false' ? 'PrismaStore (PostgreSQL)' : 'InMemoryStore'}`);
  console.log(`[STARTUP] Auth: ${process.env.E2E_TEST_MODE === 'true' ? 'BYPASSED (E2E mode)' : process.env.CLERK_SECRET_KEY ? 'Clerk JWT' : 'Legacy tokens only'}`);
  console.log(`[STARTUP] NODE_ENV: ${process.env.NODE_ENV || 'not set (defaulting to development)'}`);
}

validateStartupConfig();
const { app, store } = createApp();

async function start() {
  // Wait for PrismaStore to hydrate providers/facilities from DB before accepting traffic
  if ('waitForReady' in store && typeof (store as any).waitForReady === 'function') {
    await (store as any).waitForReady();
  }
  app.listen(PORT, () => {
    console.log(`\nRegIntel API server running on http://localhost:${PORT}\n`);
  });
}

start().catch((err) => {
  console.error('[STARTUP] Fatal error during startup:', err);
  process.exit(1);
});
