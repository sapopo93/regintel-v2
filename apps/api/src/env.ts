import { cleanEnv, str, port } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: port({ default: 3001 }),

  // Auth
  CLERK_SECRET_KEY: str({ default: '' }),
  CLERK_WEBHOOK_SECRET: str({ default: '' }),

  // Database
  DATABASE_URL: str({ default: '' }),
  USE_DB_STORE: str({ default: '' }),

  // Security
  ALLOWED_ORIGINS: str({ default: '' }),

  // Optional services
  REDIS_URL: str({ default: '' }),
  CQC_API_KEY: str({ default: '' }),
  BLOB_STORAGE_PATH: str({ default: '/var/regintel/evidence-blobs' }),
  CLAMAV_ENABLED: str({ default: 'false' }),

  // Feature flags
  ENABLE_AI_INSIGHTS: str({ default: 'false' }),
});

// Strict production checks — fail fast on critical misconfigurations
if (env.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!env.CLERK_SECRET_KEY) missing.push('CLERK_SECRET_KEY');
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.ALLOWED_ORIGINS || env.ALLOWED_ORIGINS.includes('localhost')) {
    missing.push('ALLOWED_ORIGINS (must not include localhost in production)');
  }
  if (missing.length > 0) {
    throw new Error(
      `[ENV] Production environment missing or misconfigured variables:\n  - ${missing.join('\n  - ')}`
    );
  }
}
