import { defineConfig } from 'vitest/config';

// Mobile workspace test runner. Pure-logic modules (lib/camera/*, lib/auth/pin
// etc.) run under Node — no React Native bridge, no Expo runtime. Screens and
// components that depend on RN modules are not under test here yet; that lands
// when the device-test infra slice arrives.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    globals: false,
  },
});
