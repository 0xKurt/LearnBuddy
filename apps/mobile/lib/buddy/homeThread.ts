// What of the conversation Buddy's home shows, and what it leaves to the bar on top: each thing
// is said once (issues #94, #195, #204; lib/homeLayout.ts). Pure, from the home and its layout.

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';

import type { HomeLayout } from '../homeLayout.js';
import type { SessionStart } from './useSessionStart.js';

/** The newest messages the home shows; the rest is in the history. */
export const VISIBLE_MESSAGES = 6;

type Action = MessageView['actions'][number];
type PracticeResult = Extract<NonNullable<BuddyHome['now']>, { type: 'practice_result' }>;

/**
 * Where Buddy's greeting stands, and the finished practice it names (issue #195). It is drawn
 * under its message, so it only stands where that message is still in the part of the
 * conversation the screen shows; once it has scrolled out of that window the result it told
 * about needs its card back. `result`: the way into the full view then rides with the greeting's
 * sentence instead of standing in a card repeating it.
 */
export function greetingOnScreen(
  h: BuddyHome,
  start: SessionStart | null,
): { shown: boolean; result: PracticeResult | null } {
  const shown =
    start !== null && h.thread.slice(-VISIBLE_MESSAGES).some((m) => m.id === start.afterMessageId);
  const result =
    shown && h.now?.type === 'practice_result' && h.now.session_id === start?.tells ? h.now : null;
  return { shown, result };
}

/**
 * The messages on screen and what the bar on top carries instead of them.
 *
 * "Schick mir ein Foto" is said once (issue #94, lib/homeLayout.ts photoAsk): while the bar on top
 * asks for this photo, its word-for-word "Ich warte auf dein Foto" receipt leaves the
 * conversation and "Kein Foto nötig" is the bar's quiet way out (`captureUndo`). Bar closed or
 * gone, the receipt with its undo stays the place for both (History always keeps it).
 *
 * The practice on top is told once (issue #204, `preparedIn`): the bar names it with its question
 * count and its minutes, which is word for word what the "Vorbereitet: …" receipt says — so while
 * that bar stands the receipt's line leaves the conversation (`carriedOnTop`). It stays in what
 * can be taken back, and closing the bar brings it back.
 */
export function threadOnScreen(
  h: BuddyHome,
  layout: HomeLayout,
): { messages: MessageView[]; captureUndo: Action | null; carriedOnTop: Set<string> } {
  const captureNow = layout.photoAsk === 'bar' && h.now?.type === 'capture_needed' ? h.now : null;
  const asksInBar = (a: Action): boolean =>
    captureNow !== null &&
    a.summary.tool === 'request_material' &&
    a.status === 'applied' &&
    (captureNow.step_id !== null
      ? a.summary.step_id === captureNow.step_id
      : a.summary.title === captureNow.title);
  const captureUndo = captureNow
    ? ([...h.thread]
        .reverse()
        .flatMap((m) => m.actions)
        .find((a) => asksInBar(a) && a.undoable) ?? null)
    : null;
  const messages = h.thread
    .slice(-VISIBLE_MESSAGES)
    .map((m) =>
      m.actions.some(asksInBar) ? { ...m, actions: m.actions.filter((a) => !asksInBar(a)) } : m,
    );
  const preparedOnBar =
    layout.preparedIn === 'bar'
      ? h.now?.type === 'practice_ready'
        ? h.now.step_id
        : h.now?.type === 'practice_result'
          ? (h.now.next?.step_id ?? null)
          : null
      : null;
  const carriedOnTop = new Set(
    preparedOnBar === null
      ? []
      : messages
          .flatMap((m) => m.actions)
          .filter(
            (a) =>
              a.summary.tool === 'prepare_practice' &&
              a.summary.step_id === preparedOnBar &&
              a.status === 'applied',
          )
          .map((a) => a.id),
  );
  return { messages, captureUndo, carriedOnTop };
}
