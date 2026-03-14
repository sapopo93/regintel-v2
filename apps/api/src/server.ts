import 'dotenv/config';
import { createApp } from './app';
import { startAuditWorker, stopAuditWorker } from './audit-worker';
import { logger } from './logger';

const PORT = process.env.PORT || 3001;

// Startup validation — log warnings for dangerous production misconfigurations
function validateStartupConfig() {
  const warnings: string[] = [];

  if (process.env.E2E_TEST_MODE === 'true') {
    warnings.push('E2E_TEST_MODE=true — Clerk authentication is BYPASSED. Disable in production.');
  }

  if (process.env.CLERK_TEST_TOKEN) {
    warnings.push('CLERK_TEST_TOKEN is set — demo auth tokens are active. Remove in production.');
  }

  if (!process.env.CQC_API_KEY) {
    warnings.push('CQC_API_KEY is not set — CQC location lookups may fail (401 errors).');
  }

  if (!process.env.REDIS_URL || process.env.REDIS_URL.includes('localhost')) {
    warnings.push('REDIS_URL points to localhost — background jobs will use in-memory queue (lost on restart).');
  }

  if (process.env.BLOB_STORAGE_PATH?.startsWith('/tmp')) {
    warnings.push('BLOB_STORAGE_PATH is under /tmp — uploaded evidence will be lost on server restart.');
  }

  if (!process.env.DATABASE_URL && process.env.USE_DB_STORE !== 'false') {
    logger.error('DATABASE_URL is not set but USE_DB_STORE is enabled. Set DATABASE_URL or USE_DB_STORE=false.');
  }

  for (const w of warnings) {
    logger.warn(w);
  }

  if (warnings.length === 0) {
    logger.info('Startup configuration looks good');
  }

  logger.info({
    store: process.env.USE_DB_STORE !== 'false' ? 'PrismaStore' : 'InMemoryStore',
    auth: process.env.E2E_TEST_MODE === 'true' ? 'bypassed' : process.env.CLERK_SECRET_KEY ? 'clerk' : 'legacy_tokens',
    nodeEnv: process.env.NODE_ENV || 'development',
  }, 'Startup configuration');
}

validateStartupConfig();
const { app, store } = createApp();

async function start() {
  // Wait for PrismaStore to hydrate providers/facilities from DB before accepting traffic
  if ('waitForReady' in store && typeof (store as any).waitForReady === 'function') {
    await (store as any).waitForReady();
  }
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'RegIntel API server running');
    startAuditWorker();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.fatal({ port: PORT }, 'Port already in use');
    } else {
      logger.fatal({ err }, 'Fatal listen error');
    }
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    stopAuditWorker();
    server.close(() => { logger.info('Server closed'); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', (r) => logger.error({ err: r }, 'Unhandled rejection'));
  process.on('uncaughtException',  (e) => { logger.fatal({ err: e }, 'Uncaught exception'); process.exit(1); });
}

start().catch((err) => {
  logger.fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
