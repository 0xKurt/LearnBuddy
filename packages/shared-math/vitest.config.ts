import { defineConfig } from 'vitest/config';
import { workerLimits } from '../../tools/vitest-workers.mjs';

export default defineConfig({
  test: {
    // Worker cap for shared machines: LB_TEST_MAX_WORKERS (tools/vitest-workers.mjs).
    ...workerLimits(),
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
});
