import type { BuddyHome, BuddySettingsView } from '@learnbuddy/shared-types/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { newerHome, writeHome } from '../homeCache.js';
import { keys } from '../keys.js';

// Only identity and the context fence matter here: the cache stores whatever it is given.
const home = (tag: string, context_version = 1) =>
  ({ tag, context_version, thread: [] }) as unknown as BuddyHome;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('writing a fresh home into the cache', () => {
  it('a poll that was already on its way does not put the old home back', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.home, home('before'));
    const poll = deferred<BuddyHome>();
    const inFlight = client
      .fetchQuery({ queryKey: keys.home, queryFn: () => poll.promise, staleTime: 0 })
      .catch(() => undefined);

    writeHome(client, home('after tap'));
    poll.resolve(home('old poll'));
    await inFlight;

    expect(client.getQueryData(keys.home)).toEqual(home('after tap'));
  });

  it('marks what Buddy knows as stale, so the memory list is fetched fresh', () => {
    const client = new QueryClient();
    client.setQueryData(keys.memory, { memories: [] });
    expect(client.getQueryState(keys.memory)?.isInvalidated).toBe(false);
    writeHome(client, home('after turn'));
    expect(client.getQueryState(keys.memory)?.isInvalidated).toBe(true);
  });

  it('a settings view in the cache is fetched again at once, not shown stale (#398)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000 } } });
    // The server's settings: the opt-in in the chat switches contact on.
    let server = { contact_enabled: false } as BuddySettingsView;
    await client.fetchQuery({ queryKey: keys.settings, queryFn: () => server });
    server = { contact_enabled: true } as BuddySettingsView;

    writeHome(client, home('after opt-in'));
    await vi.waitFor(() =>
      expect(client.getQueryData<BuddySettingsView>(keys.settings)?.contact_enabled).toBe(true),
    );
  });

  it('settings never loaded are not fetched by a home write', () => {
    const client = new QueryClient();
    writeHome(client, home('after turn'));
    expect(client.getQueryState(keys.settings)).toBeUndefined();
  });
});

// Two requests can be on their way at once: a turn and a tap, a spoken turn and "Gespräch
// beenden". The answer built first can arrive last (CLAUDE.md rule 4: the context fence).
describe('a home that comes back late', () => {
  it('is older when its context version is lower, and only then', () => {
    expect(newerHome({ context_version: 7 }, { context_version: 8 })).toBe(false);
    expect(newerHome({ context_version: 8 }, { context_version: 8 })).toBe(true);
    expect(newerHome({ context_version: 9 }, { context_version: 8 })).toBe(true);
    expect(newerHome({ context_version: 1 }, undefined)).toBe(true);
  });

  it('is dropped: the newer home stays, and nothing else is touched', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.home, home('scene ended', 8));
    client.setQueryData(keys.memory, { memories: [] });
    // A poll asked after the newer home was written is not cancelled by the late one.
    const poll = deferred<BuddyHome>();
    const inFlight = client.fetchQuery({
      queryKey: keys.home,
      queryFn: () => poll.promise,
      staleTime: 0,
    });

    expect(writeHome(client, home('turn from before', 7))).toBe(false);

    expect(client.getQueryData(keys.home)).toEqual(home('scene ended', 8));
    expect(client.getQueryState(keys.memory)?.isInvalidated).toBe(false);
    poll.resolve(home('poll', 9));
    await expect(inFlight).resolves.toEqual(home('poll', 9));
  });

  it('is written when it is as new as the one held, or newer', () => {
    const client = new QueryClient();
    client.setQueryData(keys.home, home('held', 8));
    expect(writeHome(client, home('same step, more thread', 8))).toBe(true);
    expect(client.getQueryData(keys.home)).toEqual(home('same step, more thread', 8));
    expect(writeHome(client, home('next step', 9))).toBe(true);
    expect(client.getQueryData(keys.home)).toEqual(home('next step', 9));
  });

  it('is written when no home is held: a first load, or the cache cleared at sign-out', () => {
    const client = new QueryClient();
    expect(writeHome(client, home('first', 3))).toBe(true);
    expect(client.getQueryData(keys.home)).toEqual(home('first', 3));
    // Another learner on the same phone starts lower: the cleared cache holds nothing to compare.
    client.clear();
    expect(writeHome(client, home('other learner', 1))).toBe(true);
    expect(client.getQueryData(keys.home)).toEqual(home('other learner', 1));
  });
});
