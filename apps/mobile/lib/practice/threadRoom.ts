// How the practice screen's conversation and its question card share the room between the
// question and the way to answer (issues #96, #286, #232). Pure: the screen measures, this decides.
//
// The conversation shows WHOLE turns only (issue #286). It may take its own box plus the free
// room under the answer (`FreeSpace`) — that sum does not change while the box is sized, so the
// measurement is stable. If everything fits, everything shows. Otherwise the box starts at the
// earliest turn from which the rest still fits, so at rest the top edge lies in the gap above a
// whole turn — nothing of the turn before peeks out under the question card. Earlier turns are a
// scroll up away; the edge then fades (#63). Never less than the newest turn: after "Prüfen"
// Buddy's reply is what matters, and the way to answer gives way first (a structured board
// scrolls inside itself before the reply is hidden) — but a board keeps two lines of its parts
// and its "Prüfen" (`boardSpare`): with the keyboard up on 360×740 the reply took a cloze's whole
// surface, and the gap she was fixing vanished under it (issue #232). Only when the newest turn
// alone is taller than that is it cut, under the full fade (rule 16 allows a conversation to
// scroll).

import { bottomRoom, SPACE, TOUCH } from '../theme/space.js';

/**
 * How far a drawing or photo may shrink below its own cap so Buddy's newest turn shows whole
 * (issue #286); figureScale.ts still keeps a drawing legible.
 */
const CARD_GIVES = 48;

/** The conversation's padding above its first turn (its content container's paddingVertical). */
const THREAD_PAD = 12;

/**
 * What a structured board keeps while it gives way under a reply: its top padding and two lines
 * of gaps or cells (2 × TOUCH and the step between them), then its own "Prüfen" bar
 * (`BottomBar.tsx`: its top padding, the md `<Btn>` of 48 pt, the room under it).
 */
export function boardKeeps(safeBottom: number): number {
  return SPACE.sm + 2 * TOUCH + SPACE.xs + SPACE.sm + 48 + bottomRoom(safeBottom, SPACE.md);
}

export type RoomInput = {
  /** What the conversation would have next to the card at its own height. */
  room: number;
  /** The conversation's whole content. */
  threadNeed: number;
  /** Each turn's top in the conversation's coordinates, oldest first. */
  tops: readonly number[];
  /** No turn yet: only the hint row, nothing of Buddy's to protect. */
  quiet: boolean;
  /** An open structured board below that can give way (it scrolls inside itself). */
  boardGives: boolean;
  /** What that board can give before it is down to `boardKeeps`; Infinity until measured. */
  boardSpare: number;
  /** The card's own height before it grew (0 until measured), and how far it grew or gave. */
  cardNatural: number;
  cardDelta: number;
  /** The card holds a drawing or photo that may grow or give room. */
  visual: boolean;
  /** It may grow (a note line only gives, issue #275). */
  growable: boolean;
  /** The card takes ALL the room the conversation leaves (a Diktat before her answer, #242). */
  fills?: boolean;
  viewHeight: number;
};

export type Room = {
  /** The conversation's box at most (undefined: not decided yet). */
  threadCap: number | undefined;
  /** At least: the newest turn, where a board gives way under it. */
  threadFloor: number;
  /** The newest turn is cut. */
  threadClipped: boolean;
  /** The box holds more than it shows: its top edge fades (#63). */
  threadHolds: boolean;
  /** How far the card grows (> 0) or gives room (< 0). */
  cardGrowTo: number;
};

export function threadRoom(m: RoomInput): Room {
  const { room, threadNeed, quiet, boardGives } = m;
  // From a turn's top, with SPACE.sm of the gap above it, to the end of the conversation.
  const fromTurn = m.tops
    .map((y) => threadNeed - (THREAD_PAD + y) + SPACE.sm)
    .filter((h) => h < threadNeed);
  const newestNeed = fromTurn.length > 0 ? Math.min(...fromTurn) : quiet ? 0 : threadNeed;
  // The most the newest turn may take where a board gives way under it.
  const replyMost = room + m.boardSpare;
  let threadCap: number | undefined;
  let threadClipped = false;
  // A quiet thread decides even at room 0 — else the row would come back half and flicker.
  if ((room > 0 || quiet) && threadNeed > 0) {
    if (threadNeed <= room) {
      threadCap = threadNeed;
    } else if (quiet) {
      threadCap = 0;
    } else {
      const fits = fromTurn.filter((h) => h <= room);
      // The newest turn alone does not fit: it keeps its height only where a board can give way
      // under it; with nothing to give — choices, a field, the voice bar — it is cut to the room
      // under the fade instead of pushing the bar off the screen.
      threadCap =
        fits.length > 0
          ? Math.max(...fits)
          : boardGives
            ? Math.max(room, Math.min(newestNeed, replyMost))
            : room;
      threadClipped = fits.length === 0 && newestNeed > room;
    }
  }
  const threadFloor = boardGives ? Math.max(0, Math.min(newestNeed, threadNeed, replyMost)) : 0;

  // The card with a drawing or photo and the conversation share the room (issue #96, #286).
  // What the conversation leaves, the card grows into (`cardGrowTo` > 0: its figure sizes itself
  // from the measured room, at most to half the window) instead of an empty gap under the answer.
  // When Buddy's newest turn would be cut, the drawing gives room first (`cardGrowTo` < 0: a
  // lower cap, down to its legible minimum, lib/math/figureScale.ts) — a reply half under the
  // card read as a fault. The room is the same sum whatever the card does, so both settle in one
  // pass, and a new reply or a taller bar takes its room back from the card first.
  const threadWants =
    threadCap === undefined || !threadClipped ? (threadCap ?? threadNeed) : newestNeed;
  const cardGrowTo = m.fills
    ? Math.max(0, room - threadWants)
    : m.visual && m.growable
      ? Math.max(
          -CARD_GIVES,
          Math.min(room - threadWants, Math.round(m.viewHeight * 0.5) - m.cardNatural),
        )
      : 0;
  if (cardGrowTo < 0 && threadCap !== undefined && !boardGives) {
    // The room the drawing really gave (measured, `cardDelta`: at its legible minimum it may
    // give less than asked) goes to the newest turn; whatever is still missing is cut.
    threadCap = Math.min(threadWants, Math.max(room, room - m.cardDelta));
    threadClipped = threadCap < newestNeed;
  }
  const threadHolds = threadClipped || (threadCap !== undefined && threadCap < threadNeed);
  return { threadCap, threadFloor, threadClipped, threadHolds, cardGrowTo };
}
