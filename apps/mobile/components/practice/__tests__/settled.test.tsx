// A measure → layout loop cannot run away (#720). The crash "Maximum update depth exceeded" at
// AnswerShell's `setContentHeight` was seen once on the phone and never reproduced, so the room's
// measured sizes go through `useSettled`: a size that keeps coming back is held, the screen stays.
// The loop here is the shape of that crash: a layout whose size decides the next layout (a picture
// that shrinks when the body runs past its end, and grows again when it no longer does), measured
// synchronously after every render as Fabric does.

import { act, render } from '@testing-library/react';
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
    const { accept } = settler<number>(0, 'test');
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
    const { accept } = settler<number>(0, 'test');
    for (let h = 1; h <= 20; h += 1) expect(accept(h * 10, h * 16)).toBe(true);
  });

  it('a 120 Hz keyboard: the last height measured lands once it has been quiet', () => {
    vi.useFakeTimers();
    try {
      let set: (next: number) => void = () => undefined;
      function Room() {
        const [height, setHeight] = useSettled(0, 'keyboard');
        set = setHeight;
        return <span data-testid="height">{height}</span>;
      }
      const shown = render(<Room />);
      // 30 different heights in 300 ms: more than `changes` in one moment, none coming back.
      for (let i = 1; i <= 30; i += 1) {
        act(() => set(i * 10));
        act(() => vi.advanceTimersByTime(10));
      }
      expect(Number(shown.getByTestId('height').textContent)).toBeLessThan(300);
      act(() => vi.advanceTimersByTime(SETTLE.windowMs));
      expect(shown.getByTestId('height').textContent).toBe('300');
      shown.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a loop stays held after the quiet moment: nothing is applied late', () => {
    vi.useFakeTimers();
    try {
      const late = vi.fn();
      const { accept } = settler<number>(0, 'test', late);
      for (let i = 0; i < 20; i += 1) accept(i % 2 === 0 ? 20 : 10, i);
      vi.advanceTimersByTime(SETTLE.windowMs * 2);
      expect(late).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
