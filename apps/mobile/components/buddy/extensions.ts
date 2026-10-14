// What a domain adds to Buddy's chat and home (issue #107): the cards its actions bring into the
// conversation, the message that stands in place of a bubble, the line that follows Buddy's
// voice, the line on top of the thread, the finished practice among the notices, the stages of
// a sheet being read, and the ways to start in the ⋯ menu. The core draws all of these places
// and works with each of them empty; the learning domain fills them once at app start
// (lib/learning/register.tsx). The core never imports the domain.

import type {
  ActionSummary,
  BuddyHome,
  MessageView,
  NowCard,
  ReadingStage,
} from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';
import type { ComponentType, ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { registry, slot } from '../../lib/registry.js';
import type { StartItem } from '../lb/MenuSheet.js';

// ─────────────── the conversation ───────────────

type Action = MessageView['actions'][number];
export type Tool = ActionSummary['tool'];
type SummaryOf<K extends Tool> = Extract<ActionSummary, { tool: K }>;

/** How loud a card's button is: the violet one belongs to the bar on top when there is one. */
export type Quiet = 'soft' | 'primary';

/**
 * The card one of Buddy's actions brings into the chat; it stands where a receipt would.
 * `quiet`: whether its start may be the screen's one filled button (`loudCard`).
 */
export type ActionCard<K extends Tool> = (
  summary: SummaryOf<K>,
  on: { actionId: string; spoken: boolean; quiet: Quiet },
) => ReactNode;

const actionCards = registry<Tool, ActionCard<Tool>>('Karten im Gespräch');

function isTool<K extends Tool>(summary: ActionSummary, tool: K): summary is SummaryOf<K> {
  return summary.tool === tool;
}

/** The tool's card in the chat (once per tool). */
export function addActionCard<K extends Tool>(tool: K, card: ActionCard<K>): void {
  actionCards.add(tool, (summary, on) => (isTool(summary, tool) ? card(summary, on) : null));
}

/** Whether this tool has a card (then it is no receipt line). */
export function hasCard(tool: Tool): boolean {
  return actionCards.get(tool) !== undefined;
}

/** The tools that have a card, in the order they were given. */
export function cardTools(): Tool[] {
  return actionCards.keys();
}

/** The card one of Buddy's actions brings into the chat; null where a receipt says it. */
export function actionCard(a: Action, spoken: boolean, quiet: Quiet = 'primary'): ReactNode {
  return actionCards.get(a.summary.tool)?.(a.summary, { actionId: a.id, spoken, quiet }) ?? null;
}

/**
 * The one card in the thread whose start is filled (HANDOFF §4: exactly one primary per screen):
 * the newest that can still be started — and none while something else on the screen holds the
 * primary (`quiet` soft: the bar on top, the microphone of the conversation screen). Older
 * offers keep their button, on paper.
 */
export function loudCard(messages: readonly MessageView[], quiet: Quiet): string | null {
  if (quiet === 'soft') return null;
  for (let m = messages.length - 1; m >= 0; m -= 1) {
    const actions = messages[m]?.actions ?? [];
    for (let a = actions.length - 1; a >= 0; a -= 1) {
      const action = actions[a];
      if (action && startable(action)) return action.id;
    }
  }
  return null;
}

/** A card with a start she can still tap: not taken back, refused by the server, or over. */
function startable(a: Action): boolean {
  if (a.status === 'undone' || !hasCard(a.summary.tool)) return false;
  if (a.summary.tool === 'offer_learning')
    return a.summary.startable !== false && a.summary.finished_session_id === null;
  return a.summary.tool !== 'start_roleplay' || a.summary.status === 'active';
}

/** A message a domain draws itself, in place of its bubble (the text stays for reading aloud). */
export const messageCards = registry<string, (m: MessageView) => ReactNode>('Nachrichten-Karten');

/** The first card that draws this message, or null: then it is a bubble. */
export function messageCard(m: MessageView): ReactNode {
  for (const card of messageCards.values()) {
    const drawn = card(m);
    if (drawn) return drawn;
  }
  return null;
}

/**
 * Buddy's newest bubble while the conversation is spoken (app/talk.tsx): the sentence being read
 * stands out. Without it the bubble is the ordinary text.
 */
export const readAlong =
  slot<ComponentType<{ text: string; style: StyleProp<TextStyle> }>>('Mitlesen');

/** What takes the line on top of the thread before her focus (a running roleplay); else null. */
export const workingOn = slot<(h: BuddyHome) => ReactNode>('Zeile über dem Gespräch');

// ─────────────── the home ───────────────

/**
 * The button that says it (components/core/Btn.jsx): the paper one while the bar on top holds
 * the screen's one primary (HANDOFF §4), the primary otherwise.
 */
export function quietVariant(quiet: Quiet): 'secondary' | 'primary' {
  return quiet === 'soft' ? 'secondary' : 'primary';
}

/** The finished practice, told at the end of the conversation (components/buddy/HomeNotices). */
export const resultNotice = slot<
  ComponentType<{
    now: Extract<NowCard, { type: 'practice_result' }>;
    busy: boolean;
    quiet: Quiet;
  }>
>('Ergebnis-Notiz');

export type StepState = 'done' | 'active' | 'todo';

/** What the bar says while Buddy reads a sheet: a title, a line and its steps (i18n keys). */
export type ReadingView = {
  stage: ReadingStage;
  title: { key: string; count?: number };
  body: { key: string; count?: number };
  steps: { key: 'sent' | 'read' | 'build'; state: StepState }[];
};

/** The reading's stages for the bar on top (components/buddy/SlimBar ReadingBar). */
export const readingSteps =
  slot<
    (card: Extract<NowCard, { type: 'material_processing' }>, preparing: boolean) => ReadingView
  >('Lese-Stufen');

/**
 * The ways to start in the start sheet and the sheets they open. `open` names one of the domain's
 * own sheets; the start sheet closes first (two modals in one frame do not come up on iOS).
 */
export type StartMenu = {
  items(
    next: BuddyHome['next'],
    t: TFunction,
    act: { send: (text: string) => void; open: (sheet: string) => void },
  ): StartItem[];
  Sheets: ComponentType<{ open: string | null; onOpen: (sheet: string | null) => void }>;
};

export const startMenu = slot<StartMenu>('Start-Menü');

/** Actual subject cards in the open Profile editor; absent without a learning domain. */
export const profileSubjects =
  slot<ComponentType<{ onOpenSubject: (id: string) => void }>>('Profil-Fächer');
