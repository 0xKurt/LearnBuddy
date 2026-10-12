// Buddy's reply while it is written, shown smoothly: the text on screen catches
// up with what arrived word by word (lib/buddy/reveal.ts) instead of jumping
// chunk by chunk. Never ahead of what arrived; with reduce motion it simply
// shows what arrived.

import { useEffect, useRef, useState } from 'react';
import { useMotionReduced } from '../../lib/theme/motion.js';

import { revealNext, revealStart } from '../../lib/buddy/reveal.js';

export function useReveal(text: string | null): string | null {
  const reduce = useMotionReduced();
  const [shown, setShown] = useState(0);
  const state = useRef({ text: '', shown: 0 });
  useEffect(() => {
    if (text === null) {
      state.current = { text: '', shown: 0 };
      setShown(0);
      return;
    }
    const from = revealStart(state.current.text, text, state.current.shown);
    state.current = { text, shown: from };
    if (reduce) {
      state.current.shown = text.length;
      setShown(text.length);
      return;
    }
    setShown(from);
    if (from >= text.length) return;
    let active = true;
    let frame: number | null = null;
    let last = Date.now();
    const step = () => {
      if (!active) return;
      const now = Date.now();
      const next = revealNext(state.current.shown, text, now - last);
      last = now;
      state.current.shown = next;
      setShown(next);
      frame = next < text.length ? requestAnimationFrame(step) : null;
    };
    frame = requestAnimationFrame(step);
    return () => {
      active = false;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [text, reduce]);
  if (text === null) return null;
  return reduce ? text : text.slice(0, Math.min(shown, text.length));
}
