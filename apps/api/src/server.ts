import 'dotenv/config';
import './env'; // Validate environment variables (fail-fast on misconfiguration)
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

  if (warnings.length > 0) {
    warnings.forEach(w => logger.warn(w, { context: 'startup' }));
  } else {
    logger.info('Configuration looks good', { context: 'startup' });
  }

  logger.info('Startup config', {
    context: 'startup',
    store: process.env.USE_DB_STORE !== 'false' ? 'PrismaStore' : 'InMemoryStore',
    auth: process.env.E2E_TEST_MODE === 'true' ? 'BYPASSED' : process.env.CLERK_SECRET_KEY ? 'Clerk JWT' : 'Legacy tokens',
    nodeEnv: process.env.NODE_ENV || 'not set',
  });
}

validateStartupConfig();
const { app, store } = createApp();

async function start() {
  // Wait for PrismaStore to hydrate providers/facilities from DB before accepting traffic
  if ('waitForReady' in store && typeof (store as any).waitForReady === 'function') {
    await (store as any).waitForReady();
  }
  const server = app.listen(PORT, () => {
    logger.info(`RegIntel API server running on port ${PORT}`, { context: 'startup' });
    startAuditWorker();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} already in use`, { context: 'startup' });
    } else {
      logger.error('Fatal listen error', { context: 'startup', error: err.message });
    }
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} — graceful shutdown`, { context: 'shutdown' });
    stopAuditWorker();
    server.close(() => { logger.info('Server closed', { context: 'shutdown' }); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', (r) => logger.error('Unhandled rejection', { context: 'process', error: String(r) }));
  process.on('uncaughtException',  (e) => { logger.error('Uncaught exception', { context: 'process', error: e.message, stack: e.stack }); process.exit(1); });
}

start().catch((err) => {
  logger.error('Fatal error during startup', { context: 'startup', error: err.message, stack: err.stack });
  process.exit(1);
});
