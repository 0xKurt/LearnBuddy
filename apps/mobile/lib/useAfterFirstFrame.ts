// "The first frame with this content is on screen" (#714): a long list draws what fits the first
// screen at once and the rest in the frame after, so opening the page does not wait for rows
// she can only reach by scrolling. Nothing looks different once the rest is there.

import { useEffect, useState } from 'react';

/** False until one frame after `ready` first turned true, then true for good. */
export function useAfterFirstFrame(ready: boolean): boolean {
  const [after, setAfter] = useState(false);
  useEffect(() => {
    if (!ready || after) return;
    const frame = requestAnimationFrame(() => setAfter(true));
    return () => cancelAnimationFrame(frame);
  }, [ready, after]);
  return after;
}
