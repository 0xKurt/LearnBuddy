// Motion tokens: one calm movement language for the whole app (polish brief
// 2026-09-27). Durations, easings and the spring are shared by every animated
// component so the same kind of change always moves the same way.
//
// Calm, soft, never bouncy: the soft overshoot is only for celebratory moments.
// Every animation respects the system's reduce-motion setting — use `REDUCE`
// on layout animations and `useReducedMotion()` for shared values.
import { Easing, ReduceMotion } from 'react-native-reanimated';

export const DURATION = {
  quick: 150,
  base: 240,
  gentle: 380,
} as const;

export const EASE = {
  /** The default curve for enter, exit and state changes. */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** A soft overshoot, only for celebratory moments. */
  celebrate: Easing.bezier(0.3, 0, 0, 1.2),
  /** Slow, symmetric in-and-out for breathing and idle loops. */
  breathe: Easing.inOut(Easing.sin),
} as const;

export const SPRING = { damping: 18, stiffness: 180, mass: 1 } as const;

/** Reduce-motion policy for layout animations: follow the system setting. */
export const REDUCE = ReduceMotion.System;

/** Small rise for elements entering (px). */
export const RISE = 8;

/** Delay between items that enter together (ms): subtle, never a cascade. */
export const STAGGER = 45;
