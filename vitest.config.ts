import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    globals: false,
  },
});
