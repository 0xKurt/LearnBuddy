// Buddy's reply while it is written, shown smoothly: the text on screen catches
// up with what arrived word by word (lib/buddy/reveal.ts) instead of jumping
// chunk by chunk. Never ahead of what arrived; with reduce motion it simply
// shows what arrived.

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { revealNext, revealStart } from '../../lib/buddy/reveal.js';

export function useReveal(text: string | null): string | null {
  const reduce = useReducedMotion();
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
    let frame: number | null = null;
    let last = Date.now();
    const step = () => {
      const now = Date.now();
      const next = revealNext(state.current.shown, text, now - last);
      last = now;
      state.current.shown = next;
      setShown(next);
      frame = next < text.length ? requestAnimationFrame(step) : null;
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [text, reduce]);
  if (text === null) return null;
  return text.slice(0, Math.min(shown, text.length));
}
