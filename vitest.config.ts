import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@regintel/domain': resolve(__dirname, 'packages/domain/src'),
      '@regintel/security': resolve(__dirname, 'packages/security/src'),
      '@regintel/queue': resolve(__dirname, 'packages/queue/src'),
      '@regintel/ai-validation': resolve(__dirname, 'packages/ai-validation/src'),
      '@regintel/ai-workers': resolve(__dirname, 'packages/ai-workers/src'),
      '@regintel/storage': resolve(__dirname, 'packages/storage/src'),
    },
  },
  test: {
    include: ['scripts/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts', 'services/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/api/src/**'],
    globals: false,
  },
});
