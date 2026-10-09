// The moving parts of Buddy's orb (components/lb/BuddyOrb.tsx): where the moon is and which side
// of the glass lies on top, and whether the sparkle burst of a "happy" is on screen. The orb only
// draws them; the maths is lib/buddy/moon.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DURATION, EASE } from '../theme/motion.js';
import {
  HAPPY_SETTLE,
  moonPose,
  newOrder,
  placeOrder,
  stepMoon,
  stillMoon,
  stillSeconds,
  type MoonOrder,
  type MoonPose,
  type MoonSim,
  type MoonState,
} from './moon.js';

/**
 * The moon's pose, stepped on the UI thread while `live`; otherwise the state's still pose,
 * cross-faded when the state changes (reduce motion: nothing moves, only this fade).
 */
export function useMoon(
  state: MoonState,
  level: number,
  live: boolean,
  ghosts: number,
): {
  pose: SharedValue<MoonPose>;
  fade: SharedValue<number>;
  order: SharedValue<MoonOrder>;
} {
  const start = useRef<{ sim: MoonSim; pose: MoonPose; order: MoonOrder } | null>(null);
  if (start.current === null) {
    // A live moon starts in its orbit (a "happy" flies from there); a still one in its pose.
    const sim = live
      ? stillMoon(state === 'happy' ? 'idle' : state, 1.5)
      : stillMoon(state, stillSeconds(state));
    const pose = moonPose(sim, level, ghosts);
    start.current = { sim, pose, order: placeOrder(newOrder(ghosts), pose) };
  }
  const sim = useSharedValue<MoonSim>(start.current.sim);
  const pose = useSharedValue<MoonPose>(start.current.pose);
  const order = useSharedValue<MoonOrder>(start.current.order);
  const target = useSharedValue<MoonState>(state);
  const voice = useSharedValue(level);
  const fade = useSharedValue(1);

  useEffect(() => {
    target.value = state;
  }, [state, target]);
  useEffect(() => {
    // The microphone reports her level a few times a second: a quick, critically damped
    // spring joins the dots without overshooting (the orb swells with her, not beyond).
    voice.value = live ? withSpring(level, { damping: 30, stiffness: 220 }) : level;
  }, [level, live, voice]);

  const onFrame = useCallback(
    (info: { timeSincePreviousFrame: number | null }) => {
      'worklet';
      const dt = Math.min(0.05, Math.max(0, (info.timeSincePreviousFrame ?? 16) / 1000));
      const next = stepMoon(sim.value, dt, target.value);
      sim.value = next;
      const p = moonPose(next, voice.value, ghosts);
      pose.value = p;
      order.value = placeOrder(order.value, p);
    },
    [sim, pose, order, target, voice, ghosts],
  );
  const frame = useFrameCallback(onFrame, false);
  useEffect(() => {
    frame.setActive(live);
    if (live) fade.value = withTiming(1, { duration: DURATION.quick });
    return () => frame.setActive(false);
  }, [live, frame, fade]);

  // Standing still: the state's still pose; a change cross-fades (a happy settles to idle).
  const shown = useRef<MoonState | null>(null);
  useEffect(() => {
    if (live) {
      shown.current = null;
      return;
    }
    const place = (s: MoonState, first: boolean): void => {
      const still = moonPose(stillMoon(s, stillSeconds(s)), level, ghosts);
      const stack = placeOrder(order.value, still);
      if (first) {
        pose.value = still;
        order.value = stack;
        fade.value = 1;
      } else {
        fade.value = withTiming(0, { duration: DURATION.quick, easing: EASE.standard }, () => {
          pose.value = still;
          order.value = stack;
          fade.value = withTiming(1, { duration: DURATION.base, easing: EASE.standard });
        });
      }
      shown.current = s;
    };
    if (shown.current !== state) place(state, shown.current === null);
    if (state !== 'happy') return;
    const settle = setTimeout(() => place('idle', false), HAPPY_SETTLE * 1000);
    return () => clearTimeout(settle);
    // `level` only matters for the listening pose, taken when the state changes.
  }, [live, state, pose, fade, order, ghosts]);

  return { pose, fade, order };
}

/** The sparkle burst is on screen only while a "happy" plays. */
export function useBurst(state: MoonState, allowed: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (state !== 'happy' || !allowed) {
      setOn(false);
      return;
    }
    setOn(true);
    const off = setTimeout(() => setOn(false), HAPPY_SETTLE * 1000);
    return () => clearTimeout(off);
  }, [state, allowed]);
  return on;
}
