// What a domain adds to Buddy's chat and home (issue #107): the cards its actions bring into the
// conversation and the receipt lines of the others, the message that stands in place of a bubble, the line that follows Buddy's
// voice, the line on top of the thread, and the ways to start in the ⋯ menu. The core draws all of these places
// and works with each of them empty; the learning domain fills them once at app start
// (lib/learning/register.tsx). The core never imports the domain.

import type { ActionSummary, BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';
import type { ComponentType, ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import type { HomeLayout } from '../../lib/homeLayout.js';
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

/** Whether a card's start can still be tapped, from its record (`loudCard`); absent: it can. */
const startables = registry<Tool, (summary: ActionSummary) => boolean>('Start einer Karte');

/**
 * The tool's card in the chat (once per tool). `startable`: whether its start can still be
 * tapped — not refused by the server, not over (`loudCard`); without it, always.
 */
export function addActionCard<K extends Tool>(
  tool: K,
  card: ActionCard<K>,
  startable?: (summary: SummaryOf<K>) => boolean,
): void {
  actionCards.add(tool, (summary, on) => (isTool(summary, tool) ? card(summary, on) : null));
  if (startable) startables.add(tool, (summary) => isTool(summary, tool) && startable(summary));
}

/** Whether this tool has a card (then it is no receipt line). */
export function hasCard(tool: Tool): boolean {
  return actionCards.get(tool) !== undefined;
}

/** The tools that have a card, in the order they were given. */
export function cardTools(): Tool[] {
  return actionCards.keys();
}

/**
 * What one of a domain's actions says as a receipt line, in the conversation and in History
 * (components/buddy/describe.ts `describeAction`): one sentence from the record, nothing
 * inferred. '' where its card says it.
 */
export type Receipt<K extends Tool> = (summary: SummaryOf<K>) => string;

export const receipts = registry<Tool, Receipt<Tool>>('Quittungen');

/** A receipt line taken back, where it says more than "… – rückgängig gemacht". */
const undoneReceipts = registry<Tool, Receipt<Tool>>('Quittungen, zurückgenommen');
/** The tools that put something into her calendar: their receipt carries the calendar. */
const datedTools = registry<Tool, true>('Quittungen mit Datum');

/**
 * The tool's receipt line (once per tool). `undone`: its line once taken back; `dated`: it puts
 * something into her calendar (components/buddy/ThreadParts.tsx `receiptIcon`).
 */
export function addReceipt<K extends Tool>(
  tool: K,
  line: Receipt<K>,
  more: { undone?: Receipt<K>; dated?: true } = {},
): void {
  receipts.add(tool, (summary) => (isTool(summary, tool) ? line(summary) : ''));
  const { undone, dated } = more;
  if (undone) undoneReceipts.add(tool, (summary) => (isTool(summary, tool) ? undone(summary) : ''));
  if (dated) datedTools.add(tool, true);
}

/** A domain's line for a taken-back receipt of this tool, or null: the generic one. */
export function undoneReceipt(summary: ActionSummary): string | null {
  return undoneReceipts.get(summary.tool)?.(summary) ?? null;
}

/** Whether a domain's tool puts something into her calendar. */
export function isDatedTool(tool: Tool): boolean {
  return datedTools.get(tool) === true;
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
  return startables.get(a.summary.tool)?.(a.summary) ?? true;
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
 * What a domain hangs under a message, beside its action cards: the start of the practice one of
 * Buddy's background messages announces (issue #632). `quiet` as for an action's card.
 */
export const messageExtras = registry<
  string,
  (m: MessageView, quiet: Quiet, wrap: (card: ReactNode) => ReactNode) => ReactNode
>('Karten unter Nachrichten');

/** Every card a domain hangs under this message, in the order they were given. */
export function messageExtra(
  m: MessageView,
  quiet: Quiet,
  wrap: (card: ReactNode) => ReactNode,
): ReactNode[] {
  return messageExtras.values().flatMap((card) => {
    const drawn = card(m, quiet, wrap);
    return drawn ? [drawn] : [];
  });
}

/**
 * Buddy's newest bubble while the conversation is spoken (app/talk.tsx): the sentence being read
 * stands out. Without it the bubble is the ordinary text.
 */
export const readAlong =
  slot<ComponentType<{ text: string; style: StyleProp<TextStyle> }>>('Mitlesen');

/** The line on top of the thread (a running roleplay, else her focus); null: none. */
export const workingOn = slot<(h: BuddyHome) => ReactNode>('Zeile über dem Gespräch');

// ─────────────── the home ───────────────

/**
 * The button that says it (components/core/Btn.jsx): the paper one while the bar on top holds
 * the screen's one primary (HANDOFF §4), the primary otherwise.
 */
export function quietVariant(quiet: Quiet): 'secondary' | 'primary' {
  return quiet === 'soft' ? 'secondary' : 'primary';
}

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

/** A domain's quiet mark beside the first visit's greeting ("Heute geübt ✓"); null: none. */
export const introMark = slot<(h: BuddyHome) => ReactNode>('Zeichen beim Gruß');

/**
 * What the greeting itself offers about what it told (`tells`, lib/buddy/sessionAnchor.ts): the
 * learning domain's way into the practice it just named (issue #195). Null: nothing.
 */
export const greetingAction =
  slot<(h: BuddyHome, tells: string, on: { busy: boolean; quiet: Quiet }) => ReactNode>(
    'Begrüßungs-Karte',
  );

/**
 * What a domain keeps around the whole home screen while it is shown, from its first frame (the
 * learning domain: her sheets' pages and the practice to go on with, lib/learning/homeScope.tsx).
 */
export const homeScope = slot<
  ComponentType<{
    h: BuddyHome | undefined;
    /** What the screen shows on top and in the thread, once the home is loaded (#846). */
    layout?: HomeLayout;
    children: ReactNode;
  }>
>('Rahmen der Startseite');

/** Actual subject cards in the open Profile editor; absent without a learning domain. */
export const profileSubjects =
  slot<ComponentType<{ onOpenSubject: (id: string) => void }>>('Profil-Fächer');
