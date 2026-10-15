import { defineConfig } from 'vitest/config';
import { workerLimits } from '../../tools/vitest-workers.mjs';

export default defineConfig({
  test: {
    // Worker cap for shared machines: LB_TEST_MAX_WORKERS (tools/vitest-workers.mjs).
    ...workerLimits(),
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Every temp dir a test makes is gone when the run ends (issue #449): the run checks it.
    globalSetup: ['src/__tests__/tmpGuard.ts'],
  },
});
