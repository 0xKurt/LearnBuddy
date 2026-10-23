// The learning domain's practice runs in the server state (TanStack Query, lib/api/queries.ts;
// issue #107): one run, seeded when the server started it, a turn changed on the server, and the
// run behind Buddy's card loaded before she taps (lib/api/sessionCache.ts).

import type { NowCard, PracticeTurnView, SessionView } from '@learnbuddy/shared-types/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { staggered } from './homePoll.js';
import { keys } from './keys.js';
import { getSession, openPracticeSession } from './learningEndpoints.js';
import { queryClient } from './queries.js';
import { followResumeCard } from './sessionCache.js';

/**
 * One practice run. It is normally not polled at all — every change comes back in the answer to
 * what she just did — with one exception: while the server says more questions are still being
 * written (issue #220, `SessionView.preparing`), nothing she does brings them, so the screen asks
 * until they are there. The same second-and-a-half rhythm the sheet reading uses.
 */
export const usePracticeSession = (id: string) => {
  // Independent of the query cache: even a fresh or in-flight prefetch is not an open (#868).
  // Mutations pause offline and retry transient failures; the endpoint is idempotent.
  const { mutate: opened } = useMutation({ mutationFn: openPracticeSession, retry: 2 });
  useEffect(() => opened(id), [id, opened]);
  return useQuery({
    queryKey: keys.session(id),
    queryFn: () => getSession(id),
    refetchInterval: (q) => (q.state.data?.preparing ? staggered(1500) : false),
  });
};

/** A session the server just started (and returned): its first question shows at once. */
export function seedSession(view: SessionView): void {
  queryClient.setQueryData(keys.session(view.id), view);
}

/** One turn of a practice run changed on the server (a kept „für nachher", issue #402). */
export function storeTurn(sessionId: string, turn: PracticeTurnView): void {
  queryClient.setQueryData<SessionView>(keys.session(sessionId), (view) =>
    view ? { ...view, turns: view.turns.map((t) => (t.id === turn.id ? turn : t)) } : view,
  );
}

/**
 * A practice to go on with is on screen (Buddy's card): it is loaded now, so "Weiter üben"
 * shows the question at once (gaps.md #2). Loaded, never started — nothing changes on the
 * server until she taps. When the card changes (a page joined the help), the copy is loaded
 * again (lib/api/sessionCache.ts).
 */
export function usePrefetchSession(card: NowCard | null | undefined): void {
  const resume = card?.type === 'resume_practice' ? card : null;
  const id = resume?.session_id ?? null;
  const remaining = resume?.remaining ?? null;
  const title = resume?.title ?? null;
  const mode = resume?.mode ?? null;
  useEffect(() => {
    if (!resume) return;
    followResumeCard(queryClient, resume, getSession);
    // The card's content, not its object identity (every poll makes a new one).
  }, [id, remaining, title, mode]);
}
