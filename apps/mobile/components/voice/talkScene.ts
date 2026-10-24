// What of the one thread the conversation screen shows as bubbles and cards (issue #18), as pure
// decisions: whether there is something to tap or to look at, and the tail of a running scene.
// The scene itself is a domain's (`talkScene`: the learning domain's roleplay, issue #244):
// what it is called, who Buddy plays, its language, its start card and how it ends.

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';

import { slot } from '../../lib/registry.js';
import { hasCard, messageCard } from '../buddy/extensions.js';

/** How many of the newest messages the talk screen shows (a tail, not the history). */
const TAIL = 3;

type Action = MessageView['actions'][number];

/** A scene running for her right now, as the conversation screen shows it. */
export type LiveScene = {
  id: string;
  /** Its name, on top of the screen. */
  title: string;
  /** The line under its name ("Englisch · Rollenspiel"). */
  label: (t: TFunction) => string;
  /** The language she speaks and Buddy reads in while it runs. */
  language: string;
  /** Who Buddy plays, from its start card in the thread (if still there). */
  role: string | null;
  /** Whether this action is the scene's own start card. */
  starts: (a: Action) => boolean;
};

/** The scene a domain runs, from the home; and how it ends (resolves whether it is over). */
export type TalkScenes = {
  of(h: BuddyHome): LiveScene | null;
  useEnd(id: string | null): { busy: boolean; end: () => Promise<boolean> };
};

export const talkScene = slot<TalkScenes>('Szene im Gespräch');

/** The scene running in this home, or null (none, or no domain runs scenes). */
export function sceneOf(h: BuddyHome | undefined): LiveScene | null {
  return h ? (talkScene.get()?.of(h) ?? null) : null;
}

/** Ending the scene; nothing to end without a domain. */
export function useEndScene(id: string | null): { busy: boolean; end: () => Promise<boolean> } {
  return (talkScene.get()?.useEnd ?? useNoScene)(id);
}

function useNoScene(): { busy: boolean; end: () => Promise<boolean> } {
  return { busy: false, end: () => Promise.resolve(false) };
}

/** Something to tap or to look at: a card of one of Buddy's actions, or a message drawn as one. */
export function carriesCard(m: MessageView | undefined): boolean {
  if (!m || m.role !== 'buddy') return false;
  return m.actions.some((a) => hasCard(a.summary.tool)) || messageCard(m) !== null;
}

/**
 * The newest messages. While a scene runs, its own start card is left out (#599 correction): the
 * header already names the scene and the stage's pill who Buddy plays (ui_kits/app/Extra.jsx:
 * 186–195 — only the lines stand under the stage). A message of Buddy's that was nothing but
 * that card goes with it.
 */
export function talkTail(
  thread: readonly MessageView[],
  startsScene: ((a: Action) => boolean) | null,
  problem = false,
): MessageView[] {
  // Failure never makes the preceding conversation disappear; it remains scrollable.
  const tail = problem || thread.at(-1)?.status === 'failed' ? [...thread] : thread.slice(-TAIL);
  if (startsScene === null) return tail;
  return tail
    .map((m) =>
      m.actions.some(startsScene) ? { ...m, actions: m.actions.filter((a) => !startsScene(a)) } : m,
    )
    .filter((m) => m.role !== 'buddy' || m.text.trim() !== '' || m.actions.length > 0);
}
