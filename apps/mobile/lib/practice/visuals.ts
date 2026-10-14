// The figure table (issue #310, step 5): what a question's drawing or photo may do in its card,
// in one place instead of exceptions spread over the practice screen. Pure: the screen measures,
// this decides; the card (`QuestionCard` with `QuestionFigure`) draws.
//
// - How tall it stands at most: a share of what she sees (`visualCaps`), less what it gives back
//   so Buddy's newest turn shows whole (`threadRoom`'s `cardGrowTo` < 0).
// - Whether it may grow into room the conversation leaves (`visualGrows`): every drawing and
//   photo may, a note line only gives (issue #275 — it is read left to right at its own size).
// - How far it may grow: to half of what she sees (`CARD_REACH`).
// - Which one is not in the card at all (`standsAlone`): a labelled picture that is an image
//   stands under it as a card of its own, as tall as the picture she taps may be (`boardCap`).
// - While she types (`formDensity` is `tight`, lib/keyboard.ts) the reading text steps down to
//   its smaller share and the drawing folds to one line that opens it large (`QuestionCard`,
//   `ZoomableFigure`, issues #233, #379): no cap fits a box diagram, which does not shrink.

import { PRACTICE } from '../theme/practice.js';
import type { Figure } from '@learnbuddy/shared-types/contracts';

import { isImageSchematic } from '../../../../packages/shared-math/src/schematics.js';

/** A drawing's cap: a share of what she sees. */
const FIGURE_SHARE = PRACTICE.figureShare;
/** A photo's cap: a share of what she sees, never taller than 180 pt (the 360×740 fit rule). */
const IMAGE_SHARE = PRACTICE.imageShare;
const IMAGE_MAX = PRACTICE.imageHeight;
/**
 * A figure she answers IN (`FigureTapAnswer`, issues #248, #251) and a labelled picture she
 * answers FROM (`standsAlone`): a share of what she sees, so a tall one — the map of Germany, the
 * skeleton — is drawn narrower rather than push "Prüfen" off a 360×740 phone. There it is 330 pt,
 * the room in which the server decides what a finger can tap (`REGION_TAP_BOX` in
 * packages/shared-math/src/regions.ts).
 */
const BOARD_SHARE = PRACTICE.boardShare;

/**
 * The figure types that never grow; every other one may. A note line only gives (#275); a program
 * (#262) is text at its reading size — the card grew around it and left an empty band above the
 * code (#387).
 */
const KEEPS_ITS_SIZE: ReadonlySet<Figure['type']> = new Set(['staff', 'code']);

export function visualGrows(figure: Figure | null | undefined): boolean {
  return !figure || !(KEEPS_ITS_SIZE.has(figure.type) || standsAlone(figure));
}

/**
 * A labelled picture that is an image (#599; design ui_kits/app task-label) is not in the question
 * card: it stands under it as a card of its own at card width, where its numbers are the design's
 * size — in the card, under the drawings' cap, the bicycle stood 104 pt high on 360×740 and its
 * numbers 9 pt. One sizing for it and for the picture she taps (`boardCap`). The circuit, the one
 * picture we draw, is a drawing like any other.
 */
export function standsAlone(figure: Figure | null | undefined): boolean {
  return figure?.type === 'schematic' && isImageSchematic(figure.d);
}

/** How far a card with a drawing or photo grows into the free room: a share of the window. */
export const CARD_REACH = PRACTICE.cardReach;

/**
 * The tallest a drawing and a photo may stand in the card. `cardGrowTo` < 0 is room the card
 * gives back to the conversation; a card that grows sizes its drawing from the measured room
 * instead (`QuestionCard`), so growth does not raise these caps.
 */
export function visualCaps(
  viewHeight: number,
  cardGrowTo: number,
): { figure: number; image: number } {
  const gives = Math.min(0, cardGrowTo);
  return {
    figure: Math.round(viewHeight * FIGURE_SHARE) + gives,
    image: Math.min(IMAGE_MAX, Math.round(viewHeight * IMAGE_SHARE)) + gives,
  };
}

/**
 * The tallest a figure outside the card may stand — the one she answers in (`FigureTapAnswer`),
 * a labelled picture under its question (`standsAlone`): it gives nothing back to the conversation.
 */
export function boardCap(viewHeight: number): number {
  return Math.round(viewHeight * BOARD_SHARE);
}

/**
 * A picture's cap from the room the screen measured (`usePictureCap`, #599): the cap it stood at
 * and what is left under the bar (`spare`, < 0: how far the screen runs past), shared by the
 * `rows` pictures above each other — never above `most`, never below `least`.
 */
export function roomCap(
  cap: number,
  spare: number,
  rows: number,
  most: number,
  least: number,
): number {
  return Math.max(least, Math.min(most, cap + Math.floor(spare / Math.max(1, rows))));
}
