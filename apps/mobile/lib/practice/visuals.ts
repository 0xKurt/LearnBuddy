// The figure table (issue #310, step 5): what a question's drawing or photo may do in its card,
// in one place instead of exceptions spread over the practice screen. Pure: the screen measures,
// this decides; the card (`QuestionCard` with `QuestionFigure`) draws.
//
// - How tall it stands at most: a share of what she sees (`visualCaps`), less what it gives back
//   so Buddy's newest turn shows whole (`threadRoom`'s `cardGrowTo` < 0).
// - Whether it may grow into room the conversation leaves (`visualGrows`): every drawing and
//   photo may, a note line only gives (issue #275 — it is read left to right at its own size).
// - How far it may grow (`visualReach`): to half of what she sees; a tall labelled picture as far
//   as the conversation leaves room (issue #462).
// - While she types (`formDensity` is `tight`, lib/keyboard.ts) the reading text steps down to
//   its smaller share and the drawing folds to one line that opens it large (`QuestionCard`,
//   `ZoomableFigure`, issues #233, #379): no cap fits a box diagram, which does not shrink.

import type { Figure } from '@learnbuddy/shared-types/contracts';

import { schematic } from '../../../../packages/shared-math/src/schematics.js';

/** A drawing's cap: a share of what she sees. */
const FIGURE_SHARE = 0.14;
/** A photo's cap: a share of what she sees, never taller than 180 pt (the 360×740 fit rule). */
const IMAGE_SHARE = 0.2;
const IMAGE_MAX = 180;
/**
 * A figure she answers IN (`FigureTapAnswer`, issues #248, #251): a share of what she sees, so a tall
 * one — the map of Germany — is drawn narrower rather than push "Prüfen" off a 360×740 phone. There
 * it is 330 pt, the room in which the server decides what a finger can tap
 * (`REGION_TAP_BOX` in packages/shared-math/src/regions.ts).
 */
const BOARD_SHARE = 0.45;

/** The figure types that never grow; every other one may. */
const KEEPS_ITS_SIZE: ReadonlySet<Figure['type']> = new Set(['staff']);

export function visualGrows(figure: Figure | null | undefined): boolean {
  return !figure || !KEEPS_ITS_SIZE.has(figure.type);
}

/** How far a card with a drawing or photo grows into the free room: a share of the window. */
const CARD_REACH = 0.5;

/**
 * The share of what she sees a card with this figure may grow to (`threadRoom`): half. A labelled
 * picture taller than wide — the skeleton, the lab, an Anlaut chart — goes as far as the
 * conversation leaves room: its width is fixed by the phone, so only height makes it larger, and at
 * half of 360×740 the skeleton stood a third smaller than the free room allowed (issue #462).
 */
export function visualReach(figure: Figure | null | undefined): number {
  if (figure?.type !== 'schematic') return CARD_REACH;
  const [x0, y0, x1, y1] = schematic(figure.d).bounds;
  return y1 - y0 > x1 - x0 ? 1 : CARD_REACH;
}

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
 * The tallest a figure she answers in may stand (`FigureTapAnswer`): it stands in the answer
 * instead of the card and gives nothing back to the conversation.
 */
export function boardCap(viewHeight: number): number {
  return Math.round(viewHeight * BOARD_SHARE);
}
