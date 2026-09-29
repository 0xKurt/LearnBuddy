import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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
