import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@regintel/domain': path.resolve(__dirname, '../../packages/domain/src'),
      '@regintel/security': path.resolve(__dirname, '../../packages/security/src'),
    },
  },
});
