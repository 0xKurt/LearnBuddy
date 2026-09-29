// What the device owes the API about push, and how long push may make anyone wait.
// "Opened" is the only proof one of Buddy's messages reached her (CLAUDE.md rule 5,
// audit M-64): losing one to a bad connection would make the app claim less than is
// true, keeping a refused one forever would make it try forever.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PUSH_TIMEOUT_MS, sendKept, within } from '../pushFlush.js';

type Entry = { id: string };
const queue = (...ids: string[]): Entry[] => ids.map((id) => ({ id }));

/** Records what went out and what was dropped, with the failures a pass runs into. */
function pass(fail: Record<string, unknown> = {}) {
  const sent: string[] = [];
  const dropped: string[] = [];
  return {
    sent,
    dropped,
    run: (entries: Entry[], refused: (err: unknown) => boolean) =>
      sendKept(
        entries,
        async (e) => {
          sent.push(e.id);
          if (e.id in fail) throw fail[e.id];
        },
        async (e) => {
          dropped.push(e.id);
        },
        refused,
      ),
  };
}

const refusedIs = (err: unknown) => err === 'refused';

describe('sending what the device kept', () => {
  it('sends oldest first and drops each one the API took', async () => {
    const p = pass();
    await p.run(queue('a', 'b', 'c'), refusedIs);
    expect(p.sent).toEqual(['a', 'b', 'c']);
    expect(p.dropped).toEqual(['a', 'b', 'c']);
  });

  it('keeps a report the API could not take — and everything after it', async () => {
    const p = pass({ b: 'offline' });
    await p.run(queue('a', 'b', 'c'), refusedIs);
    expect(p.sent).toEqual(['a', 'b']);
    // b is still there for the next start, and so is c: nothing was skipped past.
    expect(p.dropped).toEqual(['a']);
  });

  it('drops one the API refused for good and goes on with the rest', async () => {
    const p = pass({ a: 'refused' });
    await p.run(queue('a', 'b'), refusedIs);
    expect(p.sent).toEqual(['a', 'b']);
    expect(p.dropped).toEqual(['a', 'b']);
  });

  it('stops at the first one it cannot send, however many are waiting', async () => {
    const p = pass({ a: 'offline', b: 'offline' });
    await p.run(queue('a', 'b', 'c'), refusedIs);
    expect(p.sent).toEqual(['a']);
    expect(p.dropped).toEqual([]);
  });

  it('does nothing at all when nothing is kept', async () => {
    const p = pass();
    await p.run([], refusedIs);
    expect(p.sent).toEqual([]);
    expect(p.dropped).toEqual([]);
  });
});

describe('push never keeps anyone waiting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives up on a call that never answers', async () => {
    const never = new Promise<string>(() => undefined);
    const raced = within(never);
    const caught = raced.catch((e: unknown) => (e as Error).message);
    await vi.advanceTimersByTimeAsync(PUSH_TIMEOUT_MS);
    await expect(caught).resolves.toBe('timeout');
  });

  it('passes an answer that comes in time straight through', async () => {
    const raced = within(Promise.resolve('token'));
    await vi.advanceTimersByTimeAsync(0);
    await expect(raced).resolves.toBe('token');
  });

  it('keeps the real failure when the call itself fails', async () => {
    const raced = within(Promise.reject(new Error('no network')));
    await expect(raced).rejects.toThrow('no network');
  });
});
