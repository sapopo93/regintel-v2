import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@regintel/domain': resolve(__dirname, 'packages/domain/src'),
      '@regintel/security': resolve(__dirname, 'packages/security/src'),
    },
  },
  test: {
    include: ['scripts/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/api/src/**'],
    globals: false,
  },
});
