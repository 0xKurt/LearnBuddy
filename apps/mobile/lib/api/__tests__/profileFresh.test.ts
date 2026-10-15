// Who she is stays true after Buddy changed it (#671 review of #778, rule 5). `/me` is kept fresh
// for five minutes, and Buddy's `set_level` (and its undo) change her grade and the profile's
// version on the server during a turn. Without a fresh `/me` the settings showed the old grade,
// and saving the profile sent the old version (409). A home that shows a level change she has
// not seen yet fetches `/me` again; any other home leaves it alone.

import type { ActionView, BuddyHome, MeResponse } from '@learnbuddy/shared-types/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { writeHome } from '../homeCache.js';
import { keys } from '../keys.js';

const levelStep = (id: string, status: ActionView['status']) =>
  ({ id, status, summary: { tool: 'set_level' } }) as unknown as ActionView;
const otherStep = (id: string) =>
  ({ id, status: 'applied', summary: { tool: 'remember' } }) as unknown as ActionView;

const home = (version: number, ...actions: ActionView[]) =>
  ({
    context_version: version,
    thread: [{ id: `m${version}`, actions }],
  }) as unknown as BuddyHome;

async function withMe(grade: number) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000 } } });
  let server = { learner: { grade } } as MeResponse;
  const fetchMe = vi.fn(async () => server);
  await client.fetchQuery({ queryKey: keys.me, queryFn: fetchMe });
  return {
    client,
    fetchMe,
    setServer: (g: number) => (server = { learner: { grade: g } } as MeResponse),
    grade: () => client.getQueryData<MeResponse>(keys.me)?.learner?.grade,
  };
}

describe('her profile after a turn', () => {
  it('is fetched again when the turn changed her level', async () => {
    const me = await withMe(6);
    writeHome(me.client, home(1));
    me.setServer(7);
    writeHome(me.client, home(2, levelStep('a1', 'applied')));
    await vi.waitFor(() => expect(me.grade()).toBe(7));
  });

  it('is fetched again when the level change was taken back', async () => {
    const me = await withMe(7);
    writeHome(me.client, home(2, levelStep('a1', 'applied')));
    me.setServer(6);
    writeHome(me.client, home(3, levelStep('a1', 'undone')));
    await vi.waitFor(() => expect(me.grade()).toBe(6));
  });

  it('is left alone by a turn that changed nothing of her', async () => {
    const me = await withMe(6);
    writeHome(me.client, home(1, levelStep('a1', 'applied')));
    const asked = me.fetchMe.mock.calls.length;
    writeHome(me.client, home(2, levelStep('a1', 'applied'), otherStep('a2')));
    await new Promise((r) => setTimeout(r, 10));
    expect(me.fetchMe.mock.calls.length).toBe(asked);
  });
});
