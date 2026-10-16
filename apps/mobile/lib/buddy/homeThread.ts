// What of the conversation Buddy's home shows, and what it leaves to the bar on top: each thing
// is said once (issues #94, #195, #204; lib/homeLayout.ts). Pure, from the home and its layout.

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';

import { homeTop, type HomeLayout } from '../homeLayout.js';
import type { SessionStart } from './useSessionStart.js';

/** Nothing on top says anything instead of the conversation (no domain, or nothing carried). */
const NOTHING_CARRIED = { asks: () => false, names: () => false };

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

/** Something told in the conversation, with the moment it belongs to (null: it is about now). */
export type Timed<T> = { item: T; at: string | null };

/**
 * Where each thing Buddy tells stands among the messages on screen (issue #630): at its own
 * moment, after the last message written before it — never under what was said later. The
 * finished practice stood at the end of the thread for half an hour, so "Geschafft! 7 Fragen"
 * sat under her next message and read as Buddy's answer to it; the check-in after a test stood
 * under every message for days.
 *
 * `end`: what is about now (no moment) or newer than every message on screen. `after`: by the
 * message it follows. `before`: older than every message on screen — drawn above them, at the top
 * of what the screen shows. Never nowhere: History draws no notices, so a check-in or a result
 * whose moment has scrolled out of the window still stands where she can answer or open it.
 */
export function placeByTime<T>(
  messages: readonly Pick<MessageView, 'id' | 'created_at'>[],
  items: readonly Timed<T>[],
): { before: T[]; after: Map<string, T[]>; end: T[] } {
  const before: T[] = [];
  const after = new Map<string, T[]>();
  const end: T[] = [];
  const last = messages.length - 1;
  for (const { item, at } of items) {
    const when = at === null ? Number.NaN : Date.parse(at);
    if (Number.isNaN(when)) {
      end.push(item);
      continue;
    }
    let i = last;
    while (i >= 0 && Date.parse(messages[i]!.created_at) > when) i -= 1;
    if (i === last) end.push(item);
    else if (i >= 0) after.set(messages[i]!.id, [...(after.get(messages[i]!.id) ?? []), item]);
    else before.push(item);
  }
  return { before, after, end };
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
 * that bar stands the receipt's line leaves the conversation (`carriedOnTop`). Closing the bar
 * brings the line and its ↺ back; History keeps both all along.
 */
export function threadOnScreen(
  h: BuddyHome,
  layout: HomeLayout,
): { messages: MessageView[]; captureUndo: Action | null; carriedOnTop: Set<string> } {
  // What the bar says instead is the domain's to know (lib/homeLayout.ts `carried`).
  const carried = homeTop.get()?.carried(h, layout) ?? NOTHING_CARRIED;
  const asksInBar = carried.asks;
  const captureUndo =
    [...h.thread]
      .reverse()
      .flatMap((m) => m.actions)
      .find((a) => asksInBar(a) && a.undoable) ?? null;
  const messages = h.thread
    .slice(-VISIBLE_MESSAGES)
    .map((m) =>
      m.actions.some(asksInBar) ? { ...m, actions: m.actions.filter((a) => !asksInBar(a)) } : m,
    );
  const carriedOnTop = new Set(
    messages
      .flatMap((m) => m.actions)
      .filter(carried.names)
      .map((a) => a.id),
  );
  return { messages, captureUndo, carriedOnTop };
}
