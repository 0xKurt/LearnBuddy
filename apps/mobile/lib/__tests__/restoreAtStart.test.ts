// The start reads her session, her language and her palette side by side (#716, Codex audit #10).
// They were read one after another in app/_layout.tsx; each is a read from the phone's storage,
// and none needs another.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { restoreAtStart, restoreHers } from '../restoreAtStart.js';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('the reads before the first screen', () => {
  it('starts all three at once and waits for all three', async () => {
    const started: string[] = [];
    const session = deferred<{ user_id: string }>();
    const locale = deferred<void>();
    const theme = deferred<void>();
    let done = false;
    const run = restoreAtStart({
      loadSession: () => (started.push('session'), session.promise),
      restoreChosenLocale: () => (started.push('locale'), locale.promise),
      restoreTheme: () => (started.push('theme'), theme.promise),
    }).then((s) => {
      done = true;
      return s;
    });
    // Nothing has answered yet, and all three are already on their way.
    expect(started.sort()).toEqual(['locale', 'session', 'theme']);
    session.resolve({ user_id: 'u1' });
    theme.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    locale.resolve();
    expect(await run).toEqual({ user_id: 'u1' });
  });

  it('starts with the defaults when her language or palette cannot be read', async () => {
    const s = await restoreAtStart({
      loadSession: async () => null,
      restoreChosenLocale: () => Promise.reject(new Error('storage')),
      restoreTheme: () => Promise.reject(new Error('storage')),
    });
    expect(s).toBeNull();
  });
});

describe('her part of the start, once she is signed in', () => {
  // On main, app/_layout.tsx read her cached chat and only then whose drafts were on the phone.
  it('reads her cached chat and adopts the local work side by side, and waits for both', async () => {
    const started: string[] = [];
    const cache = deferred<void>();
    const work = deferred<void>();
    let done = false;
    const run = restoreHers('u1', {
      restoreCache: (id) => (started.push(`cache:${id}`), cache.promise),
      adoptLocalWork: (id) => (started.push(`work:${id}`), work.promise),
    }).then(() => {
      done = true;
    });
    expect(started.sort()).toEqual(['cache:u1', 'work:u1']);
    work.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    cache.resolve();
    await run;
    expect(done).toBe(true);
  });

  it('starts even when one of the two cannot be read, and says whether the work is hers', async () => {
    const failing = () => Promise.reject(new Error('storage'));
    const fine = () => Promise.resolve();
    await expect(
      restoreHers('u1', { restoreCache: failing, adoptLocalWork: failing }),
    ).resolves.toBe(false);
    await expect(restoreHers('u1', { restoreCache: failing, adoptLocalWork: fine })).resolves.toBe(
      true,
    );
  });

  it('is how the start reads them: no read of hers waits for another', () => {
    const layout = readFileSync(join(__dirname, '../../app/_layout.tsx'), 'utf8');
    expect(layout).toContain('restoreHers(s.user_id, { restoreCache, adoptLocalWork })');
    expect(layout).not.toMatch(/await restoreCache\(/);
    // Her leftovers go out only once they are proven hers (#822 review).
    expect(layout).toContain('if (adopted) sendHers();');
  });
});
