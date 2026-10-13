// The room of the one line under the orb (#599 correction, CLAUDE.md rule 18): the fixed help
// answer was cut after six lines — its phone number stood below the cut, above empty room.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SPACE, TOUCH, bottomRoom } from '../../../lib/theme/space.js';
import { TALK } from '../../../lib/theme/talk.js';
import { TYPE } from '../../../lib/theme/type.js';
import { lineCut, stageAbove, talkRoom } from '../talkRoom.js';

/** The server's real help answer for a child (apps/api/src/i18n/safeguarding.ts). */
const HELP = (
  JSON.parse(readFileSync(join(__dirname, '../../../../api/src/i18n/de.json'), 'utf8')) as {
    safeguarding: { concern: string };
  }
).safeguarding.concern;
const NUMBER = '116 111';
/** Where the number ends: it may break across two lines. */
const NUMBER_END = '111';

const LINE = TYPE.question.lineHeight;

/**
 * The answer as the screen breaks it: whole words, in the caption's width (the stage's side
 * padding off the window). 0.46 em per letter is what the final walkthrough measured for this
 * text in this type — nine lines at 390, eleven at 360.
 */
function wrapped(width: number): string[] {
  const perLine = Math.floor((width - 2 * SPACE.xxl) / (TYPE.question.fontSize * 0.46));
  const lines: string[] = [];
  let line = '';
  for (const word of HELP.split(' ')) {
    if (line && `${line} ${word}`.length > perLine) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line];
}

/** What app/talk.tsx leaves between its header and its row of controls. */
function middleOf(height: number, inset = { top: 0, bottom: 0 }): number {
  const header = SPACE.xs + TOUCH;
  const controls = SPACE.sm + TALK.micHeight + bottomRoom(inset.bottom, SPACE.md);
  return height - inset.top - header - controls;
}

describe('the help answer on the conversation screen', () => {
  it('is the text this test thinks it is', () => {
    expect(HELP).toContain(NUMBER);
    expect(wrapped(390)).toHaveLength(9);
    expect(wrapped(360)).toHaveLength(11);
  });

  it.each([
    ['390×844', 390, 844, { top: 0, bottom: 0 }, TALK.stageSize],
    ['360×740', 360, 740, { top: 0, bottom: 0 }, TALK.stageSize],
    ['390×844 with a phone’s insets', 390, 844, { top: 47, bottom: 34 }, TALK.stageSize],
    // The smallest phone with bars: here the stage gives way, and the text is still whole.
    ['360×740 with a phone’s insets', 360, 740, { top: 24, bottom: 24 }, TALK.compactStageSize],
  ])('stands whole, with its phone number, at %s', (_, width, height, inset, stage) => {
    const lines = wrapped(width);
    const text = lines.length * LINE;
    const room = talkRoom({
      height,
      middle: middleOf(height, inset),
      live: false,
      whole: true,
      text,
    });
    const numberEnds = (lines.findIndex((l) => l.includes(NUMBER_END)) + 1) * LINE;
    expect(numberEnds).toBeGreaterThan(TALK.lineMax * LINE); // below the old six-line cut
    expect(room.line).toBeGreaterThanOrEqual(numberEnds);
    expect(room.line).toBeGreaterThanOrEqual(text);
    expect(lineCut({ content: text, room: room.line, atEnd: false })).toBeNull();
    // Where it fits under the design's stage, nothing gives way for it.
    expect(room.stage).toBe(stage);
  });

  it('takes the room before its height is known, instead of the six lines', () => {
    const room = talkRoom({ height: 844, middle: 700, live: false, whole: true, text: null });
    expect(room.line).toBe(700 - stageAbove(TALK.stageSize));
  });

  it('lets the stage give way before a word is cut', () => {
    const text = 9 * LINE;
    // Room for the stage and eight lines: the smaller stage frees the rest.
    const middle = stageAbove(TALK.stageSize) + 8 * LINE;
    const room = talkRoom({ height: 700, middle, live: false, whole: true, text });
    expect(room.stage).toBe(TALK.compactStageSize);
    expect(room.line).toBeGreaterThanOrEqual(text);
  });

  it('scrolls only when even that is not enough — and shows the cut', () => {
    const text = 9 * LINE;
    const middle = stageAbove(TALK.compactStageSize) + 4 * LINE;
    const room = talkRoom({ height: 700, middle, live: false, whole: true, text });
    expect(room).toEqual({ stage: TALK.compactStageSize, line: 4 * LINE });
    expect(lineCut({ content: text, room: room.line, atEnd: false })).toBe('bottom');
    // At its end the last line — the one that may hold the number — is not the faded one.
    expect(lineCut({ content: text, room: room.line, atEnd: true })).toBe('top');
  });
});

describe('a sentence', () => {
  it('keeps its few lines, whatever room there is', () => {
    const room = talkRoom({ height: 844, middle: 700, live: false, whole: false, text: 400 });
    expect(room).toEqual({ stage: TALK.stageSize, line: TALK.lineMax * LINE });
  });
});

describe('the stage', () => {
  it('is the design’s 150 on a whole 360×740 phone (Talk.jsx:26) — not the forms’ compact', () => {
    const at = (height: number, live = false) =>
      talkRoom({ height, middle: null, live, whole: false, text: null });
    expect(at(740)).toEqual({ stage: 150, line: 6 * LINE });
    expect(at(844).stage).toBe(150);
    expect(at(740, true).stage).toBe(TALK.liveStageSize);
  });

  it('is compact only in really short room: a keyboard, a split screen', () => {
    const short = talkRoom({ height: 480, middle: null, live: false, whole: false, text: null });
    expect(short).toEqual({ stage: TALK.compactStageSize, line: TALK.lineMaxCompact * LINE });
  });
});
