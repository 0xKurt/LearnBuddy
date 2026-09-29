import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Evals run live and are not tests, but their pure tooling (the run comparison,
    // issue #80) is proven like any other unit under evals/**/__tests__.
    include: ['src/**/*.test.ts', 'evals/**/*.test.ts'],
    globals: false,
    // Integration tests run on a real Postgres (CLAUDE.md rule 8) that all files share:
    // template copies, database create/drop and the advisory lock wait on real IO, and on
    // a loaded machine single tests drift past vitest's 5 s unit-test default — a flake,
    // not a finding. The suite stays honest at 30 s: a genuinely hung test still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/dev-server.ts'],
    },
  },
});
