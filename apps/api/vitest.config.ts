import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@regintel/domain': resolve(__dirname, '../../packages/domain/src'),
      '@regintel/security': resolve(__dirname, '../../packages/security/src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: false,
  },
});
