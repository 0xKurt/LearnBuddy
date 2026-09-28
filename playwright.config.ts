// Browser walkthrough of the real app (web build) against the dev stack:
// real API, scheduler and schema; stand-ins for Supabase Auth, storage and
// a scripted model. Build the web app first: scripts/web-walkthrough.sh.

import { existsSync } from 'node:fs';

import { defineConfig } from '@playwright/test';

// The web build is served on 8081 by default — the port Metro uses while a phone is
// connected to the dev server. `LB_WEB_PORT` moves the walkthrough out of the way instead
// of silently timing out ("port already used") and skipping the visual check (issue #42).
const WEB_PORT = process.env.LB_WEB_PORT ?? '8081';
// Same for the API (8787 may belong to another local server): the web build must then be
// exported with EXPO_PUBLIC_API_URL on that port — scripts/web-walkthrough.sh does it.
const API_PORT = process.env.LB_API_PORT ?? '8787';

// The sandbox ships Chromium at /opt/pw-browsers; CI uses Playwright's own download.
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './tests/web',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/web',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath:
        process.env.LB_CHROMIUM ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined),
      // A fake microphone (a tone) so the conversation loop can run end to end.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `PORT=${API_PORT} pnpm --filter @learnbuddy/api dev:stack`,
      url: `http://localhost:${API_PORT}/v1/me`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `node tests/web/serve.mjs apps/mobile/dist-web ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
