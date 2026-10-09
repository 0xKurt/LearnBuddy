// One bubble geometry for everything said in a thread (issue #51: one scale, no near-misses per
// bubble) — a message in the chat, the message being sent, the answer being written, a notice,
// Buddy typing, and a turn of a practice question's thread (issue #311: the practice thread drew
// the same bubble with its own numbers).

import { RADIUS } from './radius.js';
import { SPACE } from './space.js';

/**
 * paddingVertical 11 is off the scale on purpose: with TYPE.body's 23-point line a one-liner
 * closes at 45, just over the 44 pt touch height (space.ts TOUCH).
 */
export const BUBBLE = {
  borderRadius: RADIUS.card,
  paddingHorizontal: SPACE.lg,
  paddingVertical: 11, // token-exempt: one-liners close at 45, just over TOUCH (see above)
} as const;

/** The bubble's corner towards whoever said it: tucked in, a speech bubble's tail. */
export const TAIL = 6;
