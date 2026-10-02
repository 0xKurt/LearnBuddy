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

/** The same, but returns the module so a test can read `legalGap`. */
async function loadReleaseModule(
  env: Record<string, string | undefined>,
): Promise<{ legalGap: boolean }> {
  vi.resetModules();
  vi.stubGlobal('__DEV__', false);
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? '');
  return (await import('../env.js')) as unknown as { legalGap: boolean };
}

const INTERNAL = { EXPO_PUBLIC_INTERNAL_BUILD: '1' };

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

// An internal build is handed around by hand and reaches no store, so the rule that protects
// the STORE must not stop the owner from testing his own app before a website exists
// (issue #130). The exception is narrow, and it buys exactly one thing — starting — at the
// price of saying so. Everything else the rule guards stays guarded.
describe('an internal test build without the legal pages', () => {
  beforeEach(() => {
    for (const k of Object.keys(FULL)) vi.stubEnv(k, '');
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('EXPO_PUBLIC_INTERNAL_BUILD', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('starts, where a store build would refuse', async () => {
    const env = {
      ...FULL,
      ...INTERNAL,
      EXPO_PUBLIC_PRIVACY_URL: undefined,
      EXPO_PUBLIC_IMPRINT_URL: undefined,
    };
    await expect(loadRelease(env)).resolves.toBeUndefined();
  });

  it('says so — `legalGap` is what the consent screen renders its notice from', async () => {
    const m = await loadReleaseModule({
      ...FULL,
      ...INTERNAL,
      EXPO_PUBLIC_PRIVACY_URL: undefined,
      EXPO_PUBLIC_IMPRINT_URL: undefined,
    });
    expect(m.legalGap).toBe(true);
  });

  it('says nothing when the pages ARE there: the notice is about the gap, not about the flag', async () => {
    const m = await loadReleaseModule({ ...FULL, ...INTERNAL });
    expect(m.legalGap).toBe(false);
  });

  it('buys nothing else — the API url is still required', async () => {
    await expect(
      loadRelease({ ...FULL, ...INTERNAL, EXPO_PUBLIC_API_URL: undefined }),
    ).rejects.toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('buys nothing else — plain http across a network is still refused', async () => {
    await expect(
      loadRelease({ ...FULL, ...INTERNAL, EXPO_PUBLIC_API_URL: 'http://api.example.org' }),
    ).rejects.toThrow(/https:\/\//);
  });

  it('only the exact value "1" counts, so a stray variable cannot switch the rule off', async () => {
    for (const value of ['0', 'true', 'yes', '']) {
      await expect(
        loadRelease({
          ...FULL,
          EXPO_PUBLIC_INTERNAL_BUILD: value,
          EXPO_PUBLIC_PRIVACY_URL: undefined,
        }),
        value,
      ).rejects.toThrow(/EXPO_PUBLIC_PRIVACY_URL/);
    }
  });
});
