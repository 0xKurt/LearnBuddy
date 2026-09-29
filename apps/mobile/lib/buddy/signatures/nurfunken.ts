// Signature "nurfunken" (prototype round 3, A2 "Nur die bunten Sternchen"): no big star —
// only the colourful little sparkles round Buddy (sparkField.ts, larger, brighter and more
// of them) tell what is happening:
//   idle    a dozen pastel sparkles drift slowly round Buddy and twinkle;
//   listen  they stream towards Buddy with her voice;
//   think   they whirl round the glass as a quick colourful tail;
//   wait    they stand still and blink quietly, one after another;
//   speak   sparkles leave Buddy with every word;
//   happy   big confetti all round, then the sparkles dance upwards.
// The prototype builds it from "Sternchen" with the star, its tail and its reflection hidden;
// nothing of the hidden star shows, so only the field and the confetti are here.
//
// Pure maths (core.ts); the drawing is components/lb/signatures/NurfunkenSignature.tsx.

import {
  HAPPY,
  basePose,
  clamp,
  firstOrder,
  liveStart,
  newOrbSim,
  orbLevel,
  settleInto,
  stepOrbSim,
  type BurstSpot,
  type NodeOrder,
  type OrbSim,
  type OrbState,
  type SignatureMaths,
} from './core.js';
import { fieldSparks, placeSpark, type FieldOptions } from './sparkField.js';

/** When "happy" hands back to idle: the confetti ends at 1.5 s, the sparkles dance until then. */
export const NURFUNKEN_SETTLE = 2.6;

/** The prototype's field: 22 sparkles (seed 7) with A2's options, and 24 pieces of confetti. */
export const NURFUNKEN_SPARKS = 22;
export const NURFUNKEN_CONFETTI = 24;
export const NURFUNKEN_FIELD = fieldSparks(NURFUNKEN_SPARKS, 7);
export const NURFUNKEN_OPTIONS: FieldOptions = {
  size: 1.8,
  boost: 1.4,
  idle: 12,
  wait: 16,
  waitPow: 2,
};

/** Where the confetti spreads: from all round the glass outwards. */
export const NURFUNKEN_BURST: BurstSpot = { cx: 0, cy: 0, reach: 52, r0: 58 };

export type NurfunkenPose = {
  orb: number;
  halo: number;
  /** The field round Buddy: x, y, z, rotation, scale, opacity per sparkle. */
  field: number[];
  burstU: number;
  burstGate: number;
};

export type NurfunkenDetail = {
  sparks: number;
  confetti: number;
  shadow: boolean;
  halo: boolean;
};

export function newNurfunken(state: OrbState = 'idle'): OrbSim {
  'worklet';
  return newOrbSim(state);
}

export function stepNurfunken(prev: OrbSim, dt: number, state: OrbState): OrbSim {
  'worklet';
  return stepOrbSim(prev, dt, state, NURFUNKEN_SETTLE);
}

/** The prototype's stills: "happy" 0.75 s (the confetti in mid-flight), "think" 2.2 s, else 2.6 s. */
export function stillNurfunken(state: OrbState): OrbSim {
  'worklet';
  const secs = state === 'happy' ? 0.75 : state === 'think' ? 2.2 : 2.6;
  return settleInto(newNurfunken(state), stepNurfunken, state, secs);
}

export function nurfunkenPose(
  sim: OrbSim,
  voice: number,
  detail: { sparks: number },
): NurfunkenPose {
  'worklet';
  const field: number[] = [];
  const m = Math.min(NURFUNKEN_SPARKS, Math.max(0, Math.floor(detail.sparks)));
  const vo = clamp(voice);
  for (let i = 0; i < m; i++) {
    const p = NURFUNKEN_FIELD[i];
    if (p) placeSpark(field, p, i, m, sim.w, sim.t, sim.hT, vo, NURFUNKEN_OPTIONS);
  }
  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    field,
    burstU: (sim.hT - 0.1) / 1.4,
    burstGate: sim.w[HAPPY] ?? 0,
  };
}

/** The stacking order: the sparkles, all in front of the glass at first, in creation order. */
function nurfunkenOrder(detail: NurfunkenDetail): NodeOrder {
  'worklet';
  const front: boolean[] = [];
  for (let i = 0; i < detail.sparks; i++) front.push(true);
  return firstOrder(front);
}

function nurfunkenNodes(pose: NurfunkenPose): number[] {
  'worklet';
  const zs: number[] = [];
  for (let i = 2; i < pose.field.length; i += 6) zs.push(pose.field[i] ?? 0);
  return zs;
}

export function nurfunkenDetail(size: number): NurfunkenDetail {
  const level = orbLevel(size);
  if (level === 'none') return { sparks: 0, confetti: 0, shadow: false, halo: false };
  // A chat avatar: the same sparkles at the same scale, half of them, no shadow or halo.
  if (level === 'avatar') return { sparks: 12, confetti: 12, shadow: false, halo: false };
  return {
    sparks: NURFUNKEN_SPARKS,
    confetti: NURFUNKEN_CONFETTI,
    shadow: true,
    halo: true,
  };
}

export const NURFUNKEN: SignatureMaths<OrbSim, NurfunkenPose, NurfunkenDetail> = {
  settle: NURFUNKEN_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newNurfunken, stepNurfunken, state);
  },
  still: stillNurfunken,
  step: stepNurfunken,
  pose: (sim, voice, detail) => {
    'worklet';
    return nurfunkenPose(sim, voice, detail);
  },
  order: nurfunkenOrder,
  nodes: nurfunkenNodes,
};
