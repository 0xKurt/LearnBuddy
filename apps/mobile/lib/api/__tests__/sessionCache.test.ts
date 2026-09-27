import type { NowCard, SessionView } from '@learnbuddy/shared-types/contracts';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { keys } from '../keys.js';
import { followResumeCard, olderThanCard } from '../sessionCache.js';

type ResumeCard = Extract<NowCard, { type: 'resume_practice' }>;

const ID = '00000000-0000-4000-8000-000000000001';

const card = (remaining: number): ResumeCard => ({
  type: 'resume_practice',
  session_id: ID,
  mode: 'help',
  title: 'Hausaufgabe Quadrat',
  remaining,
});

// Only what the cache logic reads: the questions and whether they are open.
const view = (open: number, tag: string) =>
  ({
    id: ID,
    tag,
    items: Array.from({ length: open }, () => ({ status: 'open' })),
  }) as unknown as SessionView;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the session behind Buddy’s "Weitermachen" card', () => {
  it('is loaded while the card is on screen', async () => {
    const client = new QueryClient();
    followResumeCard(client, card(1), () => Promise.resolve(view(1, 'page 1')));
    await settle();
    expect(client.getQueryData(keys.session(ID))).toEqual(view(1, 'page 1'));
  });

  it('a page that joined the help: the copy from before is dropped and loaded again', async () => {
    const client = new QueryClient();
    followResumeCard(client, card(1), () => Promise.resolve(view(1, 'page 1')));
    await settle();

    // The re-photographed page 2 is read: the card now says two tasks are left.
    const load = deferred<SessionView>();
    followResumeCard(client, card(2), () => load.promise);
    // Never shown as current in the meantime (CLAUDE.md rule 5).
    expect(client.getQueryData(keys.session(ID))).toBeUndefined();
    load.resolve(view(2, 'pages 1 and 2'));
    await settle();
    expect(client.getQueryData(keys.session(ID))).toEqual(view(2, 'pages 1 and 2'));
  });

  it('a load asked before the change does not land after it', async () => {
    const client = new QueryClient();
    const early = deferred<SessionView>();
    followResumeCard(client, card(1), () => early.promise);
    followResumeCard(client, card(2), () => Promise.resolve(view(2, 'pages 1 and 2')));
    early.resolve(view(1, 'page 1'));
    await settle();
    await settle();
    expect(client.getQueryData(keys.session(ID))).toEqual(view(2, 'pages 1 and 2'));
  });

  it('a copy kept from before the card was seen, with fewer open questions, is not shown', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.session(ID), view(1, 'started with page 1'));
    const load = deferred<SessionView>();
    followResumeCard(client, card(2), () => load.promise);
    expect(client.getQueryData(keys.session(ID))).toBeUndefined();
    load.resolve(view(2, 'pages 1 and 2'));
    await settle();
    expect(client.getQueryData(keys.session(ID))).toEqual(view(2, 'pages 1 and 2'));
  });

  it('the same card again keeps the loaded copy (no second load)', async () => {
    const client = new QueryClient();
    let loads = 0;
    const load = () => {
      loads += 1;
      return Promise.resolve(view(1, `load ${loads}`));
    };
    followResumeCard(client, card(1), load);
    await settle();
    followResumeCard(client, card(1), load);
    await settle();
    expect(loads).toBe(1);
    expect(client.getQueryData(keys.session(ID))).toEqual(view(1, 'load 1'));
  });

  it('while the session is open on screen, it is fetched again, not taken away', async () => {
    const client = new QueryClient();
    followResumeCard(client, card(2), () => Promise.resolve(view(2, 'two open')));
    await settle();
    const observer = new QueryObserver(client, {
      queryKey: keys.session(ID),
      queryFn: () => Promise.resolve(view(1, 'refetched')),
      staleTime: 30_000,
    });
    const off = observer.subscribe(() => undefined);
    // She answered one: the card says one is left.
    followResumeCard(client, card(1), () => Promise.resolve(view(1, 'refetched')));
    expect(client.getQueryData(keys.session(ID))).toEqual(view(2, 'two open'));
    await settle();
    expect(client.getQueryData(keys.session(ID))).toEqual(view(1, 'refetched'));
    off();
  });

  it('olderThanCard: fewer open questions than the card says are left', () => {
    expect(olderThanCard(view(1, 'a'), card(2))).toBe(true);
    expect(olderThanCard(view(2, 'a'), card(2))).toBe(false);
    // A question set aside as unfit still shows as open in the copy.
    expect(olderThanCard(view(3, 'a'), card(2))).toBe(false);
  });
});
