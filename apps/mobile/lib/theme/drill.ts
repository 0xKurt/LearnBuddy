// Kopfrechnen (design ui_kits/app/Flows.jsx:66–93): the round's page, the task's row in its
// card and the answer slot. Typing and queue timing remain domain behavior.
import { UI } from './components.js';
import { PRACTICE } from './practice.js';
import { SPACE } from './space.js';

export const DRILL = {
  /** The page under the head (`Body`, Flows.jsx:19): the same 18 and 14 as every task's. */
  bodyTop: PRACTICE.ordinaryBody.paddingTop,
  bodyGap: PRACTICE.ordinaryBody.feedbackGap,
  /** "6 · 9 =" and the slot in one row (Flows.jsx:83): 14 apart, 18 above, 8 below. */
  taskGap: 14,
  taskTop: 18,
  taskBottom: SPACE.sm,
  /** The slot (Flows.jsx:85): at least 96 × 72, 12 at its sides. */
  answerWidth: 96,
  answerHeight: 72,
  answerPad: SPACE.md,
  /** Filled: 2 solid in the accent. Empty: 1.5 dashed (Flows.jsx:77). */
  answerBorder: UI.selectedBorder,
  emptyBorder: 1.5,
  feedbackHeight: 36,
} as const;
