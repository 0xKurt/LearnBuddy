// "She can see it now" for a tap that opens something (issue #711): the span of lib/perf.ts ends
// at the first frame after the screen or sheet committed with `shown` true, not at the commit —
// a commit the UI thread has not drawn yet is not something she sees.

import { useEffect } from 'react';

import { reacted } from './perf.js';

/** Ends the span of `action` on the first frame drawn after `shown` became true. */
export function useShown(action: string, shown: boolean): void {
  useEffect(() => {
    if (!shown) return;
    const frame = requestAnimationFrame(() => reacted(action));
    return () => cancelAnimationFrame(frame);
  }, [action, shown]);
}
