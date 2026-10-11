// Motion tokens: one calm movement language for the whole app (polish brief
// 2026-09-27). Durations, easings and the spring are shared by every animated
// component so the same kind of change always moves the same way.
//
// Calm, soft, never bouncy: the soft overshoot is only for celebratory moments.
//
// Every transition stops when the system requests reduced motion (#548).
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, makeMutable, ReduceMotion } from 'react-native-reanimated';

export const DURATION = {
  quick: 140,
  reexplainArrival: 350,
  reexplainReply: 200,
  base: 220,
  gentle: 420,
  voicePulse: 1200,
  recordingPulse: 700,
} as const;

export const EASE = {
  /** The default curve for enter, exit and state changes. */
  standard: Easing.bezier(0.2, 0.7, 0.2, 1),
  /** A soft overshoot, only for celebratory moments. */
  celebrate: Easing.bezier(0.3, 0, 0, 1.2),
  /** Slow, symmetric in-and-out for breathing and idle loops. */
  breathe: Easing.inOut(Easing.sin),
} as const;

export const SPRING = { damping: 18, stiffness: 180, mass: 1 } as const;

/** Use only after the live preference has allowed animation; bypass the cached OS setting. */
export const ACTIVE_MOTION = { reduceMotion: ReduceMotion.Never } as const;

/** All Reanimated transitions respect the system preference. */
export const REDUCE = ReduceMotion.System;

/** Legacy alias: fades now follow the system preference too. */
export const REDUCE_NEVER = ReduceMotion.System;

/** Conservative until the asynchronous OS read resolves; kept current by live events. */
let reduced = true;
const listeners = new Set<() => void>();
/** UI-thread value keeps already-mounted layout animations current. */
export const reducedMotionValue = makeMutable(true);

function setReducedMotion(on: boolean): void {
  reduced = on;
  reducedMotionValue.value = on;
  for (const listener of listeners) listener();
}

export function onReducedMotionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Live preference for components; unlike Reanimated's cached initial setting. */
export function useMotionReduced(): boolean {
  return useSyncExternalStore(onReducedMotionChange, motionIsReduced, () => true);
}

export function motionIsReduced(): boolean {
  return reduced;
}

/** Started once (app/_layout.tsx); returns the unsubscribe. */
export function watchReducedMotion(): () => void {
  let alive = true;
  let changed = false;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((on) => {
      // A newer live event wins over the startup read; a disposed watcher cannot write.
      if (alive && !changed) setReducedMotion(on);
    })
    .catch(() => undefined);
  const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
    changed = true;
    if (alive) setReducedMotion(on);
  });
  return () => {
    alive = false;
    sub.remove();
  };
}

/** Small rise for elements entering (px). */
export const RISE = 6;

/** Delay between items that enter together (ms): subtle, never a cascade. */
export const STAGGER = 45;
