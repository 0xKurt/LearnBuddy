// Signature "ring" (prototype round 1, variant 2 "Ring"): a narrow, tilted band of light
// round the orb, like a small planet, with a glint running along it.
//   idle    the band lies tilted, a glint wanders along it at leisure;
//   listen  the ring opens towards her and widens with her voice;
//   think   the ring wobbles like a top, two glints chase each other;
//   wait    the ring tips calmly to and fro, like a pendulum;
//   speak   waves of light leave the ring in the rhythm of the words;
//   happy   the ring turns a whole round and sprays sparkles.
//
// The ring passes behind the glass (its far half) and in front of it (its near half).
// Pure maths (core.ts); the drawing is components/lb/signatures/RingSignature.tsx.

import {
  HAPPY,
  TAU,
  basePose,
  blend,
  clamp,
  easeInOut,
  firstOrder,
  liveStart,
  newOrbSim,
  orbLevel,
  settleInto,
  speech,
  stepOrbSim,
  type BurstSpot,
  type OrbSim,
  type OrbState,
  type SignatureMaths,
} from './core.js';

/** When "happy" hands back to idle: the turn ends at 1.3 s, the sparkles at 1.55 s. */
export const RING_SETTLE = 1.9;

// One row per state (order of ORB_STATES), as in the prototype's RING.params.
//                 idle       listen     think       wait    speak     happy
const P_RX = [84, 80, 84, 82, 84, 86];
const P_K = [0.26, 0.46, 0.3, 0.22, 0.28, 0.3];
const P_TILT = [-16, -8, -16, -16, -14, -16];
const P_WIDTH = [3.2, 4, 3, 2.6, 3.2, 3.6];
const P_BRIGHT = [0.8, 1, 0.9, 0.65, 0.85, 1];
const P_GSPEED = [TAU / 6, TAU / 14, TAU / 1.1, 0, TAU / 5, TAU / 2];

export type RingSim = OrbSim & {
  /** Where the glint is on the ring (its angle). */
  g: number;
};

export type RingPose = {
  orb: number;
  halo: number;
  /** The ring's tilt (degrees, the whole band turns by it). */
  tilt: number;
  /** The ellipse in its own (tilted) frame: half axes, line width, brightness. */
  rx: number;
  ry: number;
  sw: number;
  bright: number;
  /** Two waves of light while speaking: rx, ry, line width, opacity each. */
  echoes: number[];
  /**
   * Two glints in the ring's frame: x, y, z (≥ 0: the near half, in front of the glass),
   * their own rotation (degrees), scale and opacity each.
   */
  glints: number[];
  burstU: number;
  burstGate: number;
};

export function newRing(state: OrbState = 'idle'): RingSim {
  'worklet';
  return { ...newOrbSim(state), g: 1.1 };
}

export function stepRing(prev: RingSim, dt: number, state: OrbState): RingSim {
  'worklet';
  const next: RingSim = { ...stepOrbSim(prev, dt, state, RING_SETTLE), g: prev.g };
  next.g += dt * blend(next.w, P_GSPEED);
  return next;
}

/** The prototype's stills: "happy" 0.75 s in, every other state 2.6 s. */
export function stillRing(state: OrbState): RingSim {
  'worklet';
  return settleInto(newRing(state), stepRing, state, state === 'happy' ? 0.75 : 2.6);
}

export function ringPose(sim: RingSim, voice: number): RingPose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wListen = w[1] ?? 0;
  const wThink = w[2] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[HAPPY] ?? 0;
  const vo = clamp(voice);
  const sp = speech(t);

  let tilt =
    blend(w, P_TILT) + wThink * Math.sin(t * 2.6) * 11 + wWait * Math.sin((t * TAU) / 3) * 9;
  let k = blend(w, P_K);
  const hu = easeInOut(h / 1.3);
  // The whole round of "happy". Once it is complete the band is where it started (a turn of
  // 360°), so it counts as 0: the prototype kept 360 × the fading weight and spun the ring
  // back when "happy" handed over to idle.
  tilt += wHappy * 360 * (hu < 1 ? hu : 0);
  k += wHappy * 0.32 * Math.sin(Math.PI * clamp(h / 1.3));
  const rx = blend(w, P_RX) + wSpeak * sp * 3 + wListen * vo * 2;
  const ry = rx * k;
  const sw = blend(w, P_WIDTH) + wListen * vo * 2.2 + wSpeak * sp * 2;

  const echoes: number[] = [];
  for (let i = 0; i < 2; i++) {
    const e = (((t + i * 0.65) % 1.3) + 1.3) % 1.3;
    const u = e / 1.3;
    echoes.push(
      rx * (1 + u * 0.32),
      ry * (1 + u * 0.32),
      1.6 * (1 - u) + 0.3,
      wSpeak * (1 - u) * (0.35 + sp * 0.5),
    );
  }

  const g = sim.g;
  const spin = -tilt + t * 40;
  const pulse = wWait * (0.75 + 0.35 * Math.sin((t * TAU) / 1.6));
  const glints = [
    rx * Math.cos(g),
    ry * Math.sin(g),
    Math.sin(g),
    spin,
    1 - wWait + pulse,
    1,
    rx * Math.cos(g + Math.PI),
    ry * Math.sin(g + Math.PI),
    Math.sin(g + Math.PI),
    spin,
    wThink * 0.8,
    wThink,
  ];

  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    tilt,
    rx,
    ry,
    sw,
    bright: blend(w, P_BRIGHT),
    echoes,
    glints,
    burstU: (h - 0.35) / 1.2,
    burstGate: wHappy,
  };
}

/** Where the ring's "happy" shower spreads: all round, from just outside the glass. */
export const RING_BURST: BurstSpot = { cx: 0, cy: 0, reach: 44, r0: 58 };

export type RingDetail = {
  ring: boolean;
  /** Sparkles in the "happy" shower (the prototype's 16). */
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

export function ringDetail(size: number): RingDetail {
  const level = orbLevel(size);
  if (level === 'none') return { ring: false, sparkles: 0, shadow: false, halo: false };
  if (level === 'avatar') return { ring: true, sparkles: 8, shadow: false, halo: false };
  return { ring: true, sparkles: 16, shadow: true, halo: true };
}

export const RING: SignatureMaths<RingSim, RingPose, RingDetail> = {
  settle: RING_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newRing, stepRing, state);
  },
  still: stillRing,
  step: stepRing,
  pose: (sim, voice) => {
    'worklet';
    return ringPose(sim, voice);
  },
  // The glints cross sides where the ring is outside the glass: their order does not show.
  order: () => {
    'worklet';
    return firstOrder([]);
  },
  nodes: () => {
    'worklet';
    return [];
  },
};
