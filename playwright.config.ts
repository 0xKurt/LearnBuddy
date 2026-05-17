// Playwright E2E config. Targets the fake-backed dev server so the entire
// suite runs offline (no Supabase, no Vertex). Tests use the @playwright/test
// `request` fixture — same surface the mobile app hits over HTTP.

import { defineConfig } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:6101';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  reporter: [['list']],
  workers: 1, // The fake-server holds one in-memory store; serialize.
  use: {
    baseURL: BASE,
    extraHTTPHeaders: { 'content-type': 'application/json' },
  },
  webServer: {
    command: 'pnpm -F @learnbuddy/api dev:fake',
    url: `${BASE}/health`,
    timeout: 30_000,
    reuseExistingServer: true,
    env: { PORT: '6101' },
  },
});
