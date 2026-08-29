import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test-integration/**/*.test.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    pool: 'forks',
    fileParallelism: false,
  },
});
