// How the practice screen's conversation and its question card share the room between the
// question and the way to answer (issues #96, #286, #232, #403). Pure: the screen measures, this
// decides.
//
// The conversation shows WHOLE parts only (issues #286, #403): a turn, the help chips, a card under
// the replies — each is drawn whole below the question card, or not at all there. It may take its
// own box plus the free room under the answer (`FreeSpace`) — that sum does not change while the
// box is sized, so the measurement is stable. If everything fits, everything shows. Otherwise the
// box starts at the earliest part from which the rest still fits, so at rest the top edge lies in
// the gap above a whole part — nothing of the part before peeks out under the question card: not
// the chips' lower half, not the edge of a reply, not a sliver of an orb (issue #403). Earlier
// parts are a scroll up away; the edge then fades (#63). The newest turn matters most: after
// "Prüfen" Buddy's reply is what she reads, so the drawing gives room first (`CARD_GIVES`) and the
// way to answer gives way (a structured board scrolls inside itself before the reply is hidden) —
// but a board keeps two lines of its parts and its "Prüfen" (`boardSpare`): with the keyboard up on
// 360×740 the reply took a cloze's whole surface, and the gap she was fixing vanished under it
// (issue #232). Where the newest turn still does not fit whole it is not drawn (`newestHidden`)
// until there is room again — the keyboard closes, the card is done — and only the parts after it
// that fit whole stand there.

import { bottomRoom, CONTROL, SPACE, TOUCH } from '../theme/space.js';

/**
 * How far a drawing or photo may shrink below its own cap so Buddy's newest turn shows whole
 * (issue #286); figureScale.ts still keeps a drawing legible.
 */
const CARD_GIVES = 48;

/** The conversation's padding above its first part (its content container's paddingVertical). */
const THREAD_PAD = 12;

/**
 * What a part may stand past the room and still count as whole: one point. The room is a sum of
 * measurements each rounded on its own (the box, the free room, what the card gave), so the same
 * screen reads 189 one pass and 190 the next. A reply that needs 190 was then drawn, hidden, drawn
 * … — a box that flipped every pass, and a shot taken mid-flip showed it half (#386, the voice row
 * on 360×740). The point comes off the gap above the part (`fromTop` counts SPACE.sm of it), never
 * off the part itself.
 */
const ROUNDING = 1;

/**
 * What a structured board keeps while it gives way under a reply: two lines of gaps or cells (2 × TOUCH and the step between them), then the bar with
 * "Prüfen" (`CheckBar.tsx` in `BottomBar.tsx`: its top padding, the input bar's pill — TOUCH,
 * its padding and hairline, 54 pt like a lg control, with "Prüfen" in it since #402 — and the
 * room under it).
 */
export function boardKeeps(safeBottom: number): number {
  return 2 * TOUCH + SPACE.xs + SPACE.sm + CONTROL.lg + bottomRoom(safeBottom, SPACE.md);
}

export type RoomInput = {
  /** What the conversation would have next to the card at its own height. */
  room: number;
  /**
   * How far the column still runs past its end with the conversation and the free room at 0 —
   * the bar under options (issue #402) where a quiet question had only a few pt to spare. The
   * drawing gives it first, like room for a reply (`CARD_GIVES`). 0 when it fits.
   */
  short?: number;
  /** The conversation's whole content. */
  threadNeed: number;
  /** Each turn's top in the conversation's coordinates, oldest first. */
  tops: readonly number[];
  /**
   * Where the conversation's other parts start (the help chips, a card under the replies), in the
   * same coordinates (`ThreadBox`'s `onParts`): the box may begin above any of them (#403).
   */
  parts?: readonly number[];
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
  /** The box holds more than it shows: its top edge fades (#63). */
  threadHolds: boolean;
  /** How far the card grows (> 0) or gives room (< 0). */
  cardGrowTo: number;
};

export function threadRoom(m: RoomInput): Room {
  const { room, threadNeed, quiet, boardGives } = m;
  // From a part's top, with SPACE.sm of the gap above it, to the end of the conversation.
  const fromTop = (y: number) => threadNeed - (THREAD_PAD + y) + SPACE.sm;
  const fromTurn = m.tops.map(fromTop).filter((h) => h < threadNeed);
  const fromPart = [...fromTurn, ...(m.parts ?? []).map(fromTop)].filter((h) => h < threadNeed);
  /** The most of the conversation's end that fits whole in `most`: everything, a tail, or 0. */
  const whole = (most: number) =>
    threadNeed <= most + ROUNDING
      ? threadNeed
      : Math.max(0, ...fromPart.filter((h) => h <= most + ROUNDING));
  const newestNeed = fromTurn.length > 0 ? Math.min(...fromTurn) : quiet ? 0 : threadNeed;
  // The most the newest turn may take where a board gives way under it.
  const replyMost = room + m.boardSpare;
  // Where a board gives way, the newest turn may take its room, as far as it can spare.
  const most = boardGives ? Math.max(room, Math.min(newestNeed, replyMost)) : room;
  // A quiet thread decides even at room 0 — else the row would come back half and flicker.
  let threadCap = (room > 0 || quiet) && threadNeed > 0 ? whole(most) : undefined;
  const newestHidden = threadCap !== undefined && !quiet && threadCap < newestNeed;
  const threadFloor = boardGives ? whole(Math.min(newestNeed, replyMost)) : 0;

  // The card with a drawing or photo and the conversation share the room (issue #96, #286).
  // What the conversation leaves, the card grows into (`cardGrowTo` > 0: its figure sizes itself
  // from the measured room, at most to half the window) instead of an empty gap under the answer.
  // When Buddy's newest turn would not fit, the drawing gives room first (`cardGrowTo` < 0: a
  // lower cap, down to its legible minimum, lib/math/figureScale.ts). The room is the same sum
  // whatever the card does, so both settle in one pass, and a new reply or a taller bar takes its
  // room back from the card first.
  const threadWants = threadCap === undefined ? threadNeed : newestHidden ? newestNeed : threadCap;
  const cardGrowTo = m.fills
    ? Math.max(0, room - threadWants)
    : m.visual && m.growable
      ? Math.max(
          -CARD_GIVES,
          Math.min(
            room - (m.short ?? 0) - threadWants,
            Math.round(m.viewHeight * 0.5) - m.cardNatural,
          ),
        )
      : 0;
  if (cardGrowTo < 0 && threadCap !== undefined && !boardGives) {
    // The room the drawing really gave (measured, `cardDelta`: at its legible minimum it may
    // give less than asked) goes to the newest turn; what still does not fit whole is not drawn.
    threadCap = whole(Math.min(threadWants, Math.max(room, room - m.cardDelta)));
  }
  const threadHolds = threadCap !== undefined && threadCap < threadNeed;
  return { threadCap, threadFloor, threadHolds, cardGrowTo };
}
