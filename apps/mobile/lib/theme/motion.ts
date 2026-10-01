// Motion tokens: one calm movement language for the whole app (polish brief
// 2026-09-27). Durations, easings and the spring are shared by every animated
// component so the same kind of change always moves the same way.
//
// Calm, soft, never bouncy: the soft overshoot is only for celebratory moments.
// Every animation respects the system's reduce-motion setting — use `REDUCE`
// on layout animations and `useReducedMotion()` for shared values.
import { AccessibilityInfo } from 'react-native';
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

/**
 * Reduce-motion policy for things that MOVE and have no still equivalent — a list
 * re-ordering itself. There is nothing to cross-fade to there, so the system setting
 * decides and the change simply happens.
 */
export const REDUCE = ReduceMotion.System;

/**
 * Reduce-motion policy for a cross-fade: always play it.
 *
 * A fade is not motion. WCAG 2.3.3 and Apple's own guidance both say to REPLACE movement
 * with a cross-dissolve when someone asks for less motion — not to remove the transition
 * and let things pop. Handing `ReduceMotion.System` to a `FadeIn` turns it off entirely,
 * which is what made the app feel "hakelig" on a phone with animations switched off
 * system-wide (owner 30.09., issue #126): nothing ruckelt, everything *springs*.
 *
 * The policy of what moves is decided here instead (`motionIsReduced`), so a fade can
 * stay a fade.
 */
export const REDUCE_NEVER = ReduceMotion.Never;

/**
 * Whether the system asks for less motion, readable at render time.
 *
 * Reanimated's entering animations are built outside React, so a hook cannot reach them.
 * React Native's own AccessibilityInfo can: on Android it reads
 * `Settings.Global.TRANSITION_ANIMATION_SCALE == 0`, which is exactly the switch the test
 * device has on. Read once at start-up and kept current by the subscription below.
 */
let reduced = false;

export function motionIsReduced(): boolean {
  return reduced;
}

/** Started once (app/_layout.tsx); returns the unsubscribe. */
export function watchReducedMotion(): () => void {
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((on) => {
      reduced = on;
    })
    .catch(() => {
      // Nothing to do: the default (full motion) is the safe one to be wrong about.
    });
  const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
    reduced = on;
  });
  return () => sub.remove();
}

/** Small rise for elements entering (px). */
export const RISE = 8;

/** Delay between items that enter together (ms): subtle, never a cascade. */
export const STAGGER = 45;
