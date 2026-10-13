// How much room the one line under the orb gets, and how large the stage is — as a pure decision
// on the screen's own numbers (#599 correction).
//
// A sentence is capped at a few lines (`TALK.lineMax`). An answer that arrived whole is not: that
// is how the fixed help answer arrives (CLAUDE.md rule 18, `talkLine.ts`), and its phone number
// stood below a six-line cut. It takes the whole room down to the row of controls; if even that
// is not enough, the stage gives way (the compact size) before a word is cut; only then does it
// scroll, and the cut is shown as one (`lineCut`).

import { TALK } from '../../lib/theme/talk.js';
import { TYPE } from '../../lib/theme/type.js';

/** The box the orb stands in: room around it for the halo and the moon's orbit. */
export const talkOrbBox = (size: number): number => Math.round(size * 1.5);

/** That room on one side — what a neighbour takes off its own gap to the orb itself. */
export const talkOrbRoom = (size: number): number => (talkOrbBox(size) - size) / 2;

/** What stands above the line for a stage of `size`: the orb's box, the gap, the status. */
export const stageAbove = (size: number): number =>
  talkOrbBox(size) + TALK.groupGap - talkOrbRoom(size) + TYPE.label.lineHeight + TALK.captionGap;

export function talkRoom(now: {
  /** The window's height: a short one (a keyboard) gets the compact stage. */
  height: number;
  /** The measured room between the header and what stands above the controls; null before layout. */
  middle: number | null;
  /** A roleplay runs: its smaller stage. */
  live: boolean;
  /** The line is an answer that arrived whole. */
  whole: boolean;
  /** That answer's measured height; null until it is laid out. */
  text: number | null;
}): { stage: number; line: number } {
  const compact = now.height < TALK.compactBelow;
  const stage = compact ? TALK.compactStageSize : now.live ? TALK.liveStageSize : TALK.stageSize;
  const cap = (compact ? TALK.lineMaxCompact : TALK.lineMax) * TYPE.question.lineHeight;
  if (!now.whole || now.middle === null) return { stage, line: cap };
  const middle = now.middle;
  const under = (size: number): number => Math.max(0, middle - stageAbove(size));
  if (now.text === null || now.text <= under(stage)) return { stage, line: under(stage) };
  return { stage: TALK.compactStageSize, line: under(TALK.compactStageSize) };
}

/**
 * Where a line that is longer than its room is visibly cut (components/lb/EdgeFade.tsx): at the
 * bottom while more follows, at the top once its end is in sight — so the last line, which may
 * hold the phone number, is never the faded one. Null: it stands whole.
 */
export function lineCut(now: {
  content: number | null;
  room: number;
  atEnd: boolean;
}): 'top' | 'bottom' | null {
  if (now.content === null || now.content <= now.room) return null;
  return now.atEnd ? 'top' : 'bottom';
}
