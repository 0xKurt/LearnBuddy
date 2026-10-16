// A measured size that converges or stops (#720). The practice screen measures its parts and lays
// them out from what it measured: a picture's cap from the body's spare room, the conversation's
// box from the card's growth. When a layout changes the very height it was computed from, the two
// can chase each other — A, then B, then A again — and React stops the screen with "Maximum update
// depth exceeded" (seen once on the POCO X3 with a pie in the card, AnswerShell's content height).
// No repro was found, so instead of guessing the one cause, every measured size of that room goes
// through this guard: a size that keeps coming back within a short moment, or changes too many
// times in it, is held where it stands. The room then lays out once more from a size it has
// already seen and stays, instead of looping until React gives up. After a quiet moment the size
// is taken again as measured, so a later real change (a new question, the keyboard) still lands.

import { useCallback, useRef, useState } from 'react';

declare const __DEV__: boolean | undefined;

/**
 * How much change a measured size may make before it is held. A loop on the phone runs a render
 * per frame or faster (16 ms or less), so it reaches `repeats` within milliseconds; React itself
 * stops after 50 nested updates. A person — or a test — resizing the window does not revisit one
 * height three times in half a second, and a keyboard animating by frame passes `changes`
 * different heights at most.
 */
export const SETTLE = { repeats: 3, changes: 24, windowMs: 500 } as const;

/**
 * The guard itself, without React: given the size measured `next` at `at` (ms), whether to take
 * it. A size equal to the one taken is never taken twice.
 */
export function settler<T extends number | null = number>(first: NoInfer<T>, name: string) {
  let current = first;
  let taken: { value: T; at: number }[] = [];
  let warned = false;
  return (next: T, at: number): boolean => {
    if (Object.is(next, current)) return false;
    taken = taken.filter((t) => at - t.at < SETTLE.windowMs);
    const repeats = taken.filter((t) => Object.is(t.value, next)).length;
    if (repeats >= SETTLE.repeats || taken.length >= SETTLE.changes) {
      if (!warned && typeof __DEV__ !== 'undefined' && __DEV__) {
        warned = true;
        console.warn(`[settle] ${name} did not converge; held at ${String(current)} (#720)`);
      }
      return false;
    }
    taken.push({ value: next, at });
    current = next;
    return true;
  };
}

/**
 * `useState` for a measured size (`onLayout`, `measure`, `onContentSizeChange`): the setter is
 * stable, ignores the size it already holds, and holds a size that does not converge (`settler`).
 */
export function useSettled<T extends number | null = number>(
  first: NoInfer<T>,
  name: string,
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState<T>(first);
  const accept = useRef<ReturnType<typeof settler<T>> | null>(null);
  if (accept.current === null) accept.current = settler(first, name);
  const set = useCallback((next: T) => {
    if (accept.current?.(next, Date.now())) setValue(next);
  }, []);
  return [value, set] as const;
}
