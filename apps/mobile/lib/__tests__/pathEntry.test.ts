// The return key sent the first line of a calculation path as the whole answer (issue #221).

import { pathPossible } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { hasPath, lineCount, previewLine, returnKey } from '../practice/pathEntry.js';

describe('where a worked path may be typed', () => {
  it('is offered exactly where the server checks one', () => {
    // The three kinds `evaluate.ts` runs `checkPath` on (issue #209).
    for (const kind of ['numeric', 'formula', 'short'] as const) {
      expect(pathPossible(kind), kind).toBe(true);
    }
    // And nowhere else: a line break in a vocabulary answer or a choice means nothing.
    for (const kind of ['long', 'vocab', 'multiple_choice', 'speak', 'order'] as const) {
      expect(pathPossible(kind), kind).toBe(false);
    }
  });
});

describe('what the return key does', () => {
  it('sends a one-liner, so a simple answer stays fast', () => {
    expect(returnKey('numeric', '391')).toBe('send');
    expect(returnKey('formula', 'a²+b²')).toBe('send');
    expect(returnKey('short', 'Goethe')).toBe('send');
  });

  it('makes a line once the answer is a path, so it cannot be cut off half-way', () => {
    const path = '17·23\n391';
    expect(returnKey('numeric', path)).toBe('newline');
    expect(hasPath('numeric', path)).toBe(true);
  });

  it('leaves prose as it was: a long answer always takes the line', () => {
    expect(returnKey('long', '')).toBe('newline');
    expect(returnKey('long', 'Ein Satz.')).toBe('newline');
  });

  it('still sends a vocabulary answer that somehow carries a line break', () => {
    // Nothing in the field offers a break there, so a break is not an intention — and swallowing
    // the return key would leave her tapping it with nothing happening.
    expect(returnKey('vocab', 'la maison\n')).toBe('send');
    expect(hasPath('vocab', 'la maison\n')).toBe(false);
  });
});

describe('which line the math preview draws', () => {
  it('draws the whole answer while there is only one line', () => {
    expect(previewLine('numeric', '3/4')).toBe('3/4');
  });

  it('draws the line she has arrived at, not all of them at once', () => {
    expect(previewLine('numeric', '2x+6=10\n2x=4\nx=2')).toBe('x=2');
  });

  it('does not blank out the moment she adds a line', () => {
    expect(previewLine('numeric', '2x=4\n')).toBe('2x=4');
    expect(previewLine('numeric', '2x=4\n   ')).toBe('2x=4');
  });

  it('is empty for an empty path, without reaching past the end', () => {
    expect(previewLine('numeric', '\n')).toBe('');
  });
});

describe('the return key, kind by kind', () => {
  it('sends a one-line answer at once, for every kind but a long text', () => {
    expect(returnKey('numeric', '2')).toBe('send');
    expect(returnKey('formula', 'x^2 - 1')).toBe('send');
    expect(returnKey('short', 'Paris')).toBe('send');
    expect(returnKey('vocab', 'the dog')).toBe('send');
    expect(returnKey('long', 'Ein Satz')).toBe('newline');
  });

  it('starts the next line once the answer is a path', () => {
    expect(returnKey('numeric', '2x + 3 = 7\n')).toBe('newline');
    expect(returnKey('formula', '2(x+3)\n2x + 6')).toBe('newline');
    expect(returnKey('short', '7 · 4\n28')).toBe('newline');
  });

  it('sends again once the line break is deleted', () => {
    const path = '2x = 4\n';
    expect(returnKey('numeric', path)).toBe('newline');
    expect(returnKey('numeric', path.slice(0, -1))).toBe('send');
  });
});

describe('a path', () => {
  it('is an answer with a line break, the separator steps.ts splits at', () => {
    expect(hasPath('numeric', 'x = 2')).toBe(false);
    expect(hasPath('numeric', '2x = 4\nx = 2')).toBe(true);
    expect(lineCount('')).toBe(1);
    expect(lineCount('2x + 3 = 7\n2x = 4\nx = 2')).toBe(3);
    expect(lineCount('2x + 3 = 7\n')).toBe(2);
  });
});

describe('the line the preview draws, with the cursor', () => {
  const path = '2x + 3 = 7\n2x = 4\nx = 2';

  it('is the one with the cursor in it', () => {
    expect(previewLine('numeric', path, 0)).toBe('2x + 3 = 7');
    expect(previewLine('numeric', path, 12)).toBe('2x = 4');
    expect(previewLine('numeric', path, path.length)).toBe('x = 2');
  });

  it('is the last line without a known cursor', () => {
    expect(previewLine('numeric', path, null)).toBe('x = 2');
    expect(previewLine('numeric', '3/4', null)).toBe('3/4');
  });

  it('keeps the line above on a fresh, empty line, so it does not flicker away', () => {
    expect(previewLine('numeric', '2x + 3 = 7\n', 11)).toBe('2x + 3 = 7');
    expect(previewLine('numeric', '2x + 3 = 7\n\n', null)).toBe('2x + 3 = 7');
  });

  it('copes with a cursor the field reported for an older, longer text', () => {
    expect(previewLine('numeric', 'x = 2', 40)).toBe('x = 2');
    expect(previewLine('numeric', '', 3)).toBe('');
  });
});
