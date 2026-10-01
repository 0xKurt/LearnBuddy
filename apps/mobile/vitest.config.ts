import { defineConfig } from 'vitest/config';

// Pure-logic modules (lib/camera/*, lib/auth/pin etc.) run under Node — no React Native
// bridge, no Expo runtime. Components and screens are a project of their own
// (vitest.components.config.ts, listed together in vitest.workspace.ts): they render
// through react-native-web under jsdom and need different module resolution, which must
// not leak into the resolution these tests have today.
export default defineConfig({
  test: {
    name: 'lib',
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    globals: false,
    // `pnpm test:coverage` measures the number instead of guessing it (issue #102).
    // Only what these tests can reach is counted: `lib/**` without the files that are
    // a seam to Expo or React (they are a device test, issue #37) — a screen or a
    // component in the total would only make the figure look worse than it is and say
    // nothing about the logic. No threshold: this is a look, not a gate.
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'lib/**/__tests__/**', 'lib/**/*.web.ts'],
    },
  },
});
