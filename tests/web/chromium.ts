import { existsSync } from 'node:fs';

// The sandbox ships Chromium at /opt/pw-browsers; CI uses Playwright's own download.
// One place for the rule, so a spec that sets its own launch options does not hard-code
// the sandbox path and fail to launch in CI (PR #304).
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';

export const CHROMIUM: string | undefined =
  process.env.LB_CHROMIUM ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
