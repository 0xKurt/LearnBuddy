// The start reads her session, her language and her palette side by side (#716, Codex audit #10).
// They were read one after another in app/_layout.tsx; each is a read from the phone's storage,
// and none needs another.

import { describe, expect, it } from 'vitest';

import { restoreAtStart } from '../restoreAtStart.js';

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
