import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

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
});
