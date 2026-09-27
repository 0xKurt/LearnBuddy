// A practice to go on with is loaded while Buddy's card for it is on screen (gaps.md #2), so
// "Weitermachen" shows the question at once. The card is the server's word on that session:
// when it changes for the same session (a re-photographed page joined the homework help, a
// question was answered elsewhere), the copy loaded earlier no longer says what is true and
// is dropped, never shown as current (CLAUDE.md rule 5). No React Native import: unit tested.

import type { NowCard, SessionView } from '@learnbuddy/shared-types/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { keys } from './keys.js';

type ResumeCard = Extract<NowCard, { type: 'resume_practice' }>;

/** What the card said about each session when its copy was loaded, per cache. */
const seenBy = new WeakMap<QueryClient, Map<string, string>>();

const versionOf = (card: ResumeCard) => `${card.remaining}|${card.title}|${card.mode}`;

/**
 * A kept copy with fewer open questions than the card says are left is certainly older than
 * the card (a question set aside as unfit still counts as open in the copy, never the other
 * way round) — also a copy kept from before the card was first seen (a started session).
 */
export function olderThanCard(view: SessionView, card: ResumeCard): boolean {
  return view.items.filter((i) => i.status === 'open').length < card.remaining;
}

/** Loads the session behind the card; a copy from an older card is dropped first. */
export function followResumeCard(
  client: QueryClient,
  card: ResumeCard,
  load: (id: string) => Promise<SessionView>,
): void {
  let seen = seenBy.get(client);
  if (!seen) {
    seen = new Map();
    seenBy.set(client, seen);
  }
  const key = keys.session(card.session_id);
  const before = seen.get(card.session_id);
  const now = versionOf(card);
  seen.set(card.session_id, now);
  const kept = client.getQueryData<SessionView>(key);
  if ((before !== undefined && before !== now) || (kept && olderThanCard(kept, card))) {
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (query && query.getObserversCount() > 0) {
      // The session is open on screen: it follows the server itself, only fetched again.
      void client.invalidateQueries({ queryKey: key, exact: true });
      return;
    }
    // A load still on its way was asked before the change: it must not land either.
    void client.cancelQueries({ queryKey: key, exact: true });
    client.removeQueries({ queryKey: key, exact: true });
  }
  void client.prefetchQuery({
    queryKey: key,
    queryFn: () => load(card.session_id),
    staleTime: 30_000,
  });
}
