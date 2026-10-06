import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Every temp dir a test makes is gone when the run ends (issue #449): the run checks it.
    globalSetup: ['src/__tests__/tmpGuard.ts'],
  },
});
