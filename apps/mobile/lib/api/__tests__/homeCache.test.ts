import type { BuddyHome, BuddySettingsView } from '@learnbuddy/shared-types/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { writeHome } from '../homeCache.js';
import { keys } from '../keys.js';

// Only identity matters here: the cache stores whatever it is given.
const home = (tag: string) => ({ tag }) as unknown as BuddyHome;

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
