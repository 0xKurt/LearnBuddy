// What she is shown of a reading of her photographed working (issue #444): a line the model could
// not read goes to her as null whatever it wrote, nothing read is unreadable, and more than an
// answer holds is said — never cut down.

import { WORK_LINE_MAX, WORK_LINES_MAX } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { workReadingOf } from '../workPhoto.js';

const line = (text: string, readable = true) => ({ text, readable });

describe('a reading of her working', () => {
  it('hands her lines back as written, top to bottom', () => {
    expect(
      workReadingOf({
        found: 'working',
        lines: [line('2x + 3 = 7 | −3'), line('2x = 5'), line('x = 2,5')],
      }),
    ).toEqual({ status: 'read', lines: ['2x + 3 = 7 | −3', '2x = 5', 'x = 2,5'] });
  });

  it('never passes on a guess: an unreadable line is null, whatever text came with it', () => {
    expect(
      workReadingOf({
        found: 'working',
        lines: [line('3x = 12'), line('x = 4', false), line('x = 4')],
      }),
    ).toEqual({ status: 'read', lines: ['3x = 12', null, 'x = 4'] });
  });

  it('keeps one entry one line, and drops a "line" with nothing on it', () => {
    expect(
      workReadingOf({ found: 'working', lines: [line('  3x  =\n12 '), line('   '), line('x=4')] }),
    ).toEqual({ status: 'read', lines: ['3x = 12', 'x=4'] });
  });

  it('is unreadable when not one line was read', () => {
    expect(workReadingOf({ found: 'working', lines: [line('x = 4', false)] })).toEqual({
      status: 'unreadable',
      lines: [],
    });
    expect(workReadingOf({ found: 'working', lines: [] })).toEqual({
      status: 'unreadable',
      lines: [],
    });
  });

  it('says what the model found when it found no working, and carries no lines then', () => {
    for (const found of ['no_working', 'unreadable'] as const) {
      expect(workReadingOf({ found, lines: [line('x = 4')] })).toEqual({
        status: found,
        lines: [],
      });
    }
  });

  it('is too long rather than cut down when it holds more than one answer', () => {
    const many = Array.from({ length: WORK_LINES_MAX + 1 }, (_, i) => line(`x = ${i}`));
    expect(workReadingOf({ found: 'working', lines: many }).status).toBe('too_long');
    const wide = line(`x = ${'1'.repeat(WORK_LINE_MAX)}`);
    expect(workReadingOf({ found: 'working', lines: [line('x = 1'), wide] }).status).toBe(
      'too_long',
    );
    const full = Array.from({ length: WORK_LINES_MAX }, (_, i) => line(`x = ${i}`));
    expect(workReadingOf({ found: 'working', lines: full }).lines).toHaveLength(WORK_LINES_MAX);
  });
});
