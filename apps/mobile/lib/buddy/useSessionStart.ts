// Where this visit starts in the conversation (issues #34, #104, #195; lib/buddy/sessionAnchor.ts).
// Client-side only: no model is asked and nothing is stored for it.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { takeColdStart } from './appStart.js';
import {
  dayPart,
  greetingVariant,
  openGreeting,
  refineGreeting,
  startsNewSession,
  type Greeting,
  type GreetingState,
} from './sessionAnchor.js';

/** Buddy's greeting of this visit: under which message it stands, and what it says. */
export type SessionStart = GreetingState & { afterMessageId: string; text: string };

/**
 * Decided once, when the screen first sees the thread — on the app's own start, or after a break
 * of a few hours, Buddy's greeting goes under the last message she had, so the new turn starts on
 * a fresh page with everything older right above. Kept in a ref: it must not move while she is in
 * the app. Null: this visit opens without one.
 *
 * `tells`: the finished practice the greeting's own sentence already names (issue #195), so
 * nothing repeats it as a card. Decided with the text and kept with it — the sentence was true
 * when she opened the app and must not change under her. `pending` marks the one exception: on a
 * cold start the sentence is composed from the copy kept on the device, which carries no `now` at
 * all, so it is refined once when the server's first home arrives (`part` and `variant` are kept
 * for exactly that, so no clock is read twice).
 */
export function useSessionStart(home: {
  data: BuddyHome | undefined;
  dataUpdatedAt: number;
}): SessionStart | null {
  const { t } = useTranslation('buddy');
  const sessionStart = useRef<SessionStart | null | undefined>(undefined);
  /** When this visit opened: tells a home from the server apart from the kept copy (#195). */
  const openedAt = useRef(Date.now()).current;
  const h = home.data;
  if (!h) return null;
  /** The greeting's sentence from what `sessionGreeting` chose (issue #195). */
  const greetingText = (g: Greeting): string =>
    t(
      `buddy:${g.key}`,
      g.count === undefined ? { name: h.learner.name } : { name: h.learner.name, count: g.count },
    );
  /**
   * Whether this home came from the server since the screen opened, as opposed to the copy
   * kept on the device for the instant start — that copy carries **no** `now` on purpose
   * (lib/api/deviceCache.ts `settledHome`, CLAUDE.md rule 5: nothing cached is shown as
   * confirmed-new). Its `dataUpdatedAt` is deliberately backdated by `restoreCache`.
   */
  const homeConfirmed = home.dataUpdatedAt > openedAt;
  // Decided once per visit; `undefined` means "not looked at yet".
  if (sessionStart.current === undefined) {
    const lastMessage = h.thread[h.thread.length - 1] ?? null;
    const now = new Date();
    // The app's own start begins a session whatever the clock says (issue #104). Taken here
    // and not below the `&&`: it is claimed once per process either way, so a home that
    // opened on an empty conversation does not leave the start lying around for later.
    const coldStart = takeColdStart();
    if (
      lastMessage &&
      startsNewSession({ lastMessageAt: new Date(lastMessage.created_at), now, coldStart })
    ) {
      // What Buddy says knows what she just did: the practice she finished is in the home's
      // own payload (`h.now`), so this still asks no model and makes no second request
      // (issue #195, lib/buddy/sessionAnchor.ts).
      const g = openGreeting(
        dayPart(now.getHours()),
        greetingVariant(now.getHours() * 60 + now.getMinutes()),
        h.now,
        homeConfirmed,
      );
      sessionStart.current = { ...g, afterMessageId: lastMessage.id, text: greetingText(g) };
    } else sessionStart.current = null;
  } else if (sessionStart.current?.pending && homeConfirmed) {
    // The one refinement the greeting ever gets (`refineGreeting`): the sentence is written
    // instantly from the kept home so that opening the app costs nothing — and that copy says
    // nothing about "now", so a practice she finished minutes ago was invisible to it. The
    // server's first home brings it and the greeting takes it up, in the same bubble.
    const g = refineGreeting(
      sessionStart.current,
      h.now,
      sessionStart.current.afterMessageId === h.thread[h.thread.length - 1]?.id,
    );
    sessionStart.current = {
      ...g,
      afterMessageId: sessionStart.current.afterMessageId,
      text: g.tells === sessionStart.current.tells ? sessionStart.current.text : greetingText(g),
    };
  }
  return sessionStart.current;
}
