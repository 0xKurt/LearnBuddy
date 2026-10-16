// A measured size that converges or stops (#720). The practice screen measures its parts and lays
// them out from what it measured: a picture's cap from the body's spare room, the conversation's
// box from the card's growth. When a layout changes the very height it was computed from, the two
// can chase each other — A, then B, then A again — and React stops the screen with "Maximum update
// depth exceeded" (seen once on the POCO X3 with a pie in the card, AnswerShell's content height).
// No repro was found, so instead of guessing the one cause, every measured size of that room goes
// through this guard:
//   · a size that keeps coming back within a short moment is a loop: it is held where it stands,
//     and the room lays out once more from a size it has already seen and stays;
//   · a size that changes too many times in that moment without coming back (a keyboard animating
//     at 120 Hz) is held too, but the last one measured is taken once the moment has been quiet,
//     so the room never stays at a height from the middle of an animation.
// After a quiet moment every size is taken again as measured, so a later real change (a new
// question, the keyboard) still lands.

import { useCallback, useEffect, useRef, useState } from 'react';

declare const __DEV__: boolean | undefined;

/**
 * How much change a measured size may make before it is held. A loop on the phone runs a render
 * per frame or faster (16 ms or less), so it reaches `repeats` within milliseconds; React itself
 * stops after 50 nested updates. A person — or a test — resizing the window does not revisit one
 * height three times in half a second.
 */
export const SETTLE = { repeats: 3, changes: 24, windowMs: 500 } as const;

export type Settler<T> = {
  /** Whether to take the size measured `next` at `at` (ms). One equal to the one taken never is. */
  accept: (next: T, at: number) => boolean;
  /** Drops a late size still waiting (on unmount). */
  dispose: () => void;
};

/**
 * The guard itself, without React. `late` hears a size that was held only for changing too often,
 * once `SETTLE.windowMs` passed without another measurement: the last one measured is then taken.
 */
export function settler<T extends number | null = number>(
  first: NoInfer<T>,
  name: string,
  late?: (next: T) => void,
): Settler<T> {
  let current = first;
  let taken: { value: T; at: number }[] = [];
  let warned = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const dispose = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const accept = (next: T, at: number): boolean => {
    // Every new measurement replaces one still waiting: only the last one is ever taken late.
    dispose();
    if (Object.is(next, current)) return false;
    taken = taken.filter((t) => at - t.at < SETTLE.windowMs);
    if (taken.filter((t) => Object.is(t.value, next)).length >= SETTLE.repeats) {
      // A loop: held for good, until a new measurement after the moment.
      if (!warned && typeof __DEV__ !== 'undefined' && __DEV__) {
        warned = true;
        console.warn(`[settle] ${name} did not converge; held at ${String(current)} (#720)`);
      }
      return false;
    }
    if (taken.length >= SETTLE.changes) {
      // Too many changes, none coming back: taken once it has been quiet for the whole moment.
      if (late)
        timer = setTimeout(() => {
          timer = null;
          if (accept(next, at + SETTLE.windowMs)) late(next);
        }, SETTLE.windowMs);
      return false;
    }
    taken.push({ value: next, at });
    current = next;
    return true;
  };
  return { accept, dispose };
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
  const guard = useRef<Settler<T> | null>(null);
  if (guard.current === null) guard.current = settler<T>(first, name, setValue);
  useEffect(() => () => guard.current?.dispose(), []);
  const set = useCallback((next: T) => {
    if (guard.current?.accept(next, Date.now())) setValue(next);
  }, []);
  return [value, set] as const;
}
