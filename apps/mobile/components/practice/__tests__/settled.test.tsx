// A measure → layout loop cannot run away (#720). The crash "Maximum update depth exceeded" at
// AnswerShell's `setContentHeight` was seen once on the phone and never reproduced, so the room's
// measured sizes go through `useSettled`: a size that keeps coming back is held, the screen stays.
// The loop here is the shape of that crash: a layout whose size decides the next layout (a picture
// that shrinks when the body runs past its end, and grows again when it no longer does), measured
// synchronously after every render as Fabric does.

import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useLayoutEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SETTLE, settler, useSettled } from '../../../lib/useSettled.js';

type Measured = (first: number, name: string) => readonly [number, (next: number) => void];

const plain: Measured = (first) => useState(first);

/** A body of 300 pt: content of 100 leaves room, the picture grows to 400; then it runs past. */
function Body({ measured }: { measured: Measured }) {
  const [content, setContent] = measured(100, 'content');
  const picture = content <= 300 ? 400 : 100;
  useLayoutEffect(() => setContent(picture));
  return <span data-testid="content">{content}</span>;
}

describe('a measured size converges or is held (#720)', () => {
  it('with a plain state the loop runs until React stops the screen', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Body measured={plain} />)).toThrow(/Maximum update depth/);
    quiet.mockRestore();
  });

  it('through useSettled it is held at a size it already had, and the screen stays', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const shown = render(<Body measured={useSettled} />);
    expect(['100', '400']).toContain(shown.getByTestId('content').textContent);
    warn.mockRestore();
  });

  it('takes a size that changes once, and every size again after a quiet moment', () => {
    const accept = settler<number>(0, 'test');
    expect(accept(10, 0)).toBe(true);
    expect(accept(10, 1)).toBe(false); // the same size is never taken twice
    // A loop between 10 and 20: held once 20 came back `repeats` times.
    let taken = 0;
    for (let i = 0; i < 20; i += 1) if (accept(i % 2 === 0 ? 20 : 10, 2 + i)) taken += 1;
    expect(taken).toBeLessThanOrEqual(SETTLE.repeats * 2);
    expect(accept(30, 3)).toBe(true); // a new size in the same moment still lands
    expect(accept(20, 30 + SETTLE.windowMs)).toBe(true); // and a held one after the moment
  });

  it('a keyboard animating by frame passes every height', () => {
    const accept = settler<number>(0, 'test');
    for (let h = 1; h <= 20; h += 1) expect(accept(h * 10, h * 16)).toBe(true);
  });

  it('every measured size of the practice room goes through it', () => {
    for (const file of [
      '../../../lib/practice/screenRoom.ts',
      '../AnswerShell.tsx',
      '../Question.tsx',
      '../ThreadBox.tsx',
    ]) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      // A number in plain state there is a measured size laid out from.
      expect(source, file).not.toMatch(/useState(<number[^>]*>)?\(\s*(0|null)\s*\)/);
    }
  });
});
