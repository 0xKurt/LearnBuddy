// What of the one thread the conversation screen shows as bubbles and cards (issue #18), as pure
// decisions: whether there is something to tap or to look at, who Buddy plays, and the tail of a
// running scene.

import type { MessageView } from '@learnbuddy/shared-types/contracts';

import { hasCard, messageCard } from '../buddy/extensions.js';

/** How many of the newest messages the talk screen shows (a tail, not the history). */
const TAIL = 3;

type Action = MessageView['actions'][number];

const startsScene = (a: Action, roleplayId: string): boolean =>
  a.summary.tool === 'start_roleplay' && a.summary.roleplay_id === roleplayId;

/** Something to tap or to look at: a card of one of Buddy's actions, or a message drawn as one. */
export function carriesCard(m: MessageView | undefined): boolean {
  if (!m || m.role !== 'buddy') return false;
  return m.actions.some((a) => hasCard(a.summary.tool)) || messageCard(m) !== null;
}

/** Who Buddy plays in the running roleplay, from its role card in the thread (if still there). */
export function roleIn(thread: readonly MessageView[], roleplayId: string): string | null {
  for (const m of thread)
    for (const a of m.actions)
      if (a.summary.tool === 'start_roleplay' && a.summary.roleplay_id === roleplayId)
        return a.summary.role;
  return null;
}

/**
 * The newest messages. While a scene runs, its own start card is left out (#599 correction): the
 * header already names the scene and the stage's pill who Buddy plays (ui_kits/app/Extra.jsx:
 * 186–195 — only the lines stand under the stage). A message of Buddy's that was nothing but
 * that card goes with it.
 */
export function talkTail(thread: readonly MessageView[], roleplayId: string | null): MessageView[] {
  const tail = thread.slice(-TAIL);
  if (roleplayId === null) return tail;
  return tail
    .map((m) =>
      m.actions.some((a) => startsScene(a, roleplayId))
        ? { ...m, actions: m.actions.filter((a) => !startsScene(a, roleplayId)) }
        : m,
    )
    .filter((m) => m.role !== 'buddy' || m.text.trim() !== '' || m.actions.length > 0);
}
