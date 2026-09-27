// Browser walkthrough of the real app (web build) against the dev stack:
// real API, scheduler and schema; stand-ins for Supabase Auth, storage and
// a scripted model. Build the web app first: scripts/web-walkthrough.sh.

import { existsSync } from 'node:fs';

import { defineConfig } from '@playwright/test';

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
    baseURL: 'http://localhost:8081',
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
      command: 'pnpm --filter @learnbuddy/api dev:stack',
      url: 'http://localhost:8787/v1/me',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node tests/web/serve.mjs apps/mobile/dist-web 8081',
      url: 'http://localhost:8081/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
