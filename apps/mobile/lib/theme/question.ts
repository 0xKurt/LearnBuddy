// The question on paper (design components/practice/Option.jsx:27–33, `QuestionCard`).
import { CARD_PAD, SPACE } from './space.js';

export const QUESTION = {
  /** `--card-pad`: the card as she reads the question. */
  pad: CARD_PAD.card,
  /** `compact`, after her answer: `padding: 14px 18px`. */
  compactPadX: 18,
  compactPadY: 14,
  /** The app's own tight step while the keyboard is up (#419, #484): not in the design. */
  typingPad: CARD_PAD.snug,
  /**
   * A quiet hint in the page (ui_kits/app/Flows.jsx:15 `Hint`, :19 `Body`): 4 in at its sides,
   * the body's 14 between it and the card it belongs to.
   */
  hintInset: SPACE.xs,
  hintGap: 14,
} as const;
