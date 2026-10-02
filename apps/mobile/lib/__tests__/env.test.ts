// A release build refuses to start without the configuration it needs (issue #130).
//
// The three technical variables were already guarded: without them the app would quietly talk
// to localhost and a fake key. The two legal ones were not, and their absence is INVISIBLE —
// `lib/about.ts` renders nothing rather than a placeholder, so a build without them simply has
// no privacy link on the consent screen and no imprint row in settings. Invisible is exactly
// how it would reach the store, for an app children use.
//
// `__DEV__` is a Metro global, so each case loads the module fresh with the globals and the
// environment it wants.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FULL = {
  EXPO_PUBLIC_API_URL: 'https://api.example.org',
  EXPO_PUBLIC_SUPABASE_URL: 'https://db.example.org',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
  EXPO_PUBLIC_PRIVACY_URL: 'https://example.org/datenschutz',
  EXPO_PUBLIC_IMPRINT_URL: 'https://example.org/impressum',
};

/** Loads `lib/env.ts` as a release build with exactly these variables set. */
async function loadRelease(env: Record<string, string | undefined>): Promise<void> {
  vi.resetModules();
  vi.stubGlobal('__DEV__', false);
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  await import('../env.js');
}

describe('a release build without its configuration', () => {
  beforeEach(() => {
    for (const k of Object.keys(FULL)) vi.stubEnv(k, '');
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('starts when everything is there', async () => {
    await expect(loadRelease(FULL)).resolves.toBeUndefined();
  });

  it('refuses without the privacy notice — the consent screen would have no link to read', async () => {
    await expect(loadRelease({ ...FULL, EXPO_PUBLIC_PRIVACY_URL: undefined })).rejects.toThrow(
      /EXPO_PUBLIC_PRIVACY_URL/,
    );
  });

  it('refuses without the imprint — required by law in Germany', async () => {
    await expect(loadRelease({ ...FULL, EXPO_PUBLIC_IMPRINT_URL: undefined })).rejects.toThrow(
      /EXPO_PUBLIC_IMPRINT_URL/,
    );
  });

  it('names BOTH when both are missing, so one build tells the whole story', async () => {
    await expect(
      loadRelease({
        ...FULL,
        EXPO_PUBLIC_PRIVACY_URL: undefined,
        EXPO_PUBLIC_IMPRINT_URL: undefined,
      }),
    ).rejects.toThrow(/EXPO_PUBLIC_PRIVACY_URL, EXPO_PUBLIC_IMPRINT_URL/);
  });

  it('still refuses without the API url, before it ever looks at the legal links', async () => {
    await expect(loadRelease({ ...FULL, EXPO_PUBLIC_API_URL: undefined })).rejects.toThrow(
      /EXPO_PUBLIC_API_URL/,
    );
  });

  it('leaves the support address and crash reporting optional', async () => {
    // A missing support row is a worse app, not an unlawful one; no crash reporting is a
    // deliberate, documented state (docs/privacy.md §Processors).
    await expect(loadRelease(FULL)).resolves.toBeUndefined();
  });

  it('does not stop a development build — the guard is for releases only', async () => {
    vi.resetModules();
    vi.stubGlobal('__DEV__', true);
    for (const k of Object.keys(FULL)) vi.stubEnv(k, '');
    await expect(import('../env.js')).resolves.toBeDefined();
  });
});
