// Drives any signature's maths (lib/buddy/signatures/*.ts): while live, one frame callback on
// the UI thread steps the simulation and writes a pose that the signature's animated views
// read — no JS re-render per frame. Standing still (reduce motion, an older avatar), the
// state's still pose is shown and a change of state only cross-fades; a "happy" settles to
// idle by itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  placeNodes,
  type BasePose,
  type NodeOrder,
  type OrbSim,
  type OrbState,
  type SignatureMaths,
} from '../../../lib/buddy/signatures/core.js';
import { DURATION, EASE } from '../../../lib/theme/motion.js';

export function useSignature<S extends OrbSim, P extends BasePose, D>(
  maths: SignatureMaths<S, P, D>,
  state: OrbState,
  level: number,
  live: boolean,
  detail: D,
): {
  pose: SharedValue<P>;
  fade: SharedValue<number>;
  order: SharedValue<NodeOrder>;
} {
  const { step, pose: at, nodes } = maths;
  const start = useRef<{ sim: S; pose: P; order: NodeOrder } | null>(null);
  if (start.current === null) {
    // A live orb starts in its movement (a "happy" flies from there); a still one in its pose.
    const sim = live ? maths.start(state) : maths.still(state);
    const pose = at(sim, level, detail);
    start.current = { sim, pose, order: placeNodes(maths.order(detail), nodes(pose)) };
  }
  const sim = useSharedValue<S>(start.current.sim);
  const pose = useSharedValue<P>(start.current.pose);
  const order = useSharedValue<NodeOrder>(start.current.order);
  const target = useSharedValue<OrbState>(state);
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
      const next = step(sim.value, dt, target.value);
      sim.value = next;
      const p = at(next, voice.value, detail);
      pose.value = p;
      order.value = placeNodes(order.value, nodes(p));
    },
    [sim, pose, order, target, voice, step, at, nodes, detail],
  );
  const frame = useFrameCallback(onFrame, false);
  useEffect(() => {
    frame.setActive(live);
    if (live) fade.value = withTiming(1, { duration: DURATION.quick });
    return () => frame.setActive(false);
  }, [live, frame, fade]);

  // Standing still: the state's still pose; a change cross-fades (a happy settles to idle).
  const shown = useRef<OrbState | null>(null);
  useEffect(() => {
    if (live) {
      shown.current = null;
      return;
    }
    const place = (s: OrbState, first: boolean): void => {
      const still = at(maths.still(s), level, detail);
      const stack = placeNodes(order.value, nodes(still));
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
    const settle = setTimeout(() => place('idle', false), maths.settle * 1000);
    return () => clearTimeout(settle);
    // `level` only matters for the listening pose, taken when the state changes.
  }, [live, state, pose, fade, order, maths, at, nodes, detail]);

  return { pose, fade, order };
}

/** A sparkle shower is on screen only while a "happy" plays (for `settle` seconds). */
export function useBurst(state: OrbState, allowed: boolean, settle: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (state !== 'happy' || !allowed) {
      setOn(false);
      return;
    }
    setOn(true);
    const off = setTimeout(() => setOn(false), settle * 1000);
    return () => clearTimeout(off);
  }, [state, allowed, settle]);
  return on;
}
