// The return key sent the first line of a calculation path as the whole answer (issue #221).

import { describe, expect, it } from 'vitest';

import { hasPath, pathPossible, previewLine, returnKey } from '../practice/pathEntry.js';

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
