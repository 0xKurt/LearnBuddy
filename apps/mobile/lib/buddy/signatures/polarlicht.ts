// Signature "polarlicht" (prototype round 2, variant D "Polarlicht"): a curtain of northern
// lights flows round the orb in mint, sky blue, lilac and pink — in front of it and behind.
//   idle    the light billows slowly round Buddy, its colours barely wander;
//   listen  the curtain rises in front and glows with her voice;
//   think   waves run quickly round, the colours travel in a circle;
//   wait    only a low, quiet hem of light that breathes calmly;
//   speak   waves of light run in rhythm from the front outwards;
//   happy   the aurora blazes up in every colour and sprays sparkles.
//
// The curtain is 110 thin rays of light standing on a tilted ellipse, each fading upwards;
// how high each stands and where the ellipse lies is one continuous field over the angle
// round the orb. Pure maths (core.ts); the drawing is
// components/lb/signatures/PolarlichtSignature.tsx.

import {
  TAU,
  basePose,
  blend,
  clamp,
  firstOrder,
  frac,
  lerp,
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

/** When "happy" hands back to idle: the shower ends at 1.65 s, the blaze has sunk by 2.5 s. */
export const POLAR_SETTLE = 2.5;

/** The prototype's rays and their width (units). */
export const POLAR_RAYS = 110;
export const POLAR_WIDTH = 3.8;
export const POLAR_SPARKLES = 16;

// One row per state (order of ORB_STATES), as in the prototype's POLAR.params.
//                        idle  listen think  wait  speak happy
const P_H = [36, 34, 34, 14, 30, 44];
const P_A = [4, 3, 7, 2, 4, 6];
const P_FLOW = [0.22, 0.12, 1.4, 0.08, 0.3, 1];
const P_BRIGHT = [0.75, 0.95, 0.9, 0.5, 0.85, 1];
const P_CS = [0.015, 0.01, 0.2, 0.01, 0.03, 0.25];
const P_K = [0.32, 0.38, 0.3, 0.3, 0.32, 0.34];
const P_TILT = [-12, -8, -14, -12, -12, -12];

/** Mint, sky blue, lilac, pink: the colours the curtain runs through. */
const COLS: readonly (readonly [number, number, number])[] = [
  [159, 232, 208],
  [156, 194, 255],
  [196, 168, 255],
  [255, 176, 216],
];

export type PolarSim = OrbSim & {
  /** How far the curtain has flowed round (radians). */
  flow: number;
  /** How far its colours have travelled (turns of the palette). */
  col: number;
};

export type PolarPose = {
  orb: number;
  halo: number;
  /** Every ray: its foot (x, y), its height and its depth (z ≥ 0 in front). */
  rays: number[];
  /** How bright the rays are (the prototype's `bright`). */
  bright: number;
  burstU: number;
  burstGate: number;
};

export function newPolar(state: OrbState = 'idle'): PolarSim {
  'worklet';
  return { ...newOrbSim(state), flow: 0, col: 0 };
}

/** The curtain's own flow over `dt` seconds, at the weights `sim` already has. */
export function flowPolar(sim: PolarSim, dt: number): PolarSim {
  'worklet';
  return {
    ...sim,
    flow: sim.flow + dt * blend(sim.w, P_FLOW),
    col: sim.col + dt * blend(sim.w, P_CS),
  };
}

export function stepPolar(prev: PolarSim, dt: number, state: OrbState): PolarSim {
  'worklet';
  const next = stepOrbSim(prev, dt, state, POLAR_SETTLE);
  return flowPolar({ ...next, flow: prev.flow, col: prev.col }, dt);
}

/** The prototype's stills: "happy" 0.9 s in, every other state 2.6 s. */
export function stillPolar(state: OrbState): PolarSim {
  'worklet';
  return settleInto(newPolar(state), stepPolar, state, state === 'happy' ? 0.9 : 2.6);
}

/**
 * A colour of the curtain: `u` runs once round the palette per turn (mint → sky blue →
 * lilac → pink → mint), `white` mixes in white. [r, g, b], 0…255.
 */
export function polarColour(u: number, white: number): [number, number, number] {
  'worklet';
  const v = frac(u) * COLS.length;
  const i = Math.floor(v);
  const k = v - i;
  const a = COLS[i % COLS.length] ?? [255, 255, 255];
  const b = COLS[(i + 1) % COLS.length] ?? [255, 255, 255];
  return [
    Math.round(lerp(lerp(a[0], b[0], k), 255, white)),
    Math.round(lerp(lerp(a[1], b[1], k), 255, white)),
    Math.round(lerp(lerp(a[2], b[2], k), 255, white)),
  ];
}

/**
 * `n` rays at the angles m/n·τ + `phase` round the orb: foot (x, y), height, depth each.
 * The curtain is one field over the angle — where the ellipse lies and how high the light
 * stands — so any set of angles samples the same curtain.
 */
export function polarRays(sim: PolarSim, voice: number, n: number, phase: number): number[] {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wListen = w[1] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[5] ?? 0;
  const vo = clamp(voice);
  const pH = blend(w, P_H);
  const pA = blend(w, P_A);
  const pK = blend(w, P_K);
  const tl = (blend(w, P_TILT) * Math.PI) / 180;
  const ct = Math.cos(tl);
  const sn = Math.sin(tl);
  const flare = wHappy * (h < 2.5 ? 1 + 1.2 * Math.exp(-Math.pow((h - 0.5) * 2.2, 2)) : 1);
  const lift = Math.max(1, flare);
  const breathe = 1 + wWait * 0.25 * Math.sin((t * TAU) / 3.4);
  const out: number[] = [];
  for (let m = 0; m < n; m++) {
    const th = (m / n) * TAU + phase;
    const lx = 84 * Math.cos(th);
    const ly =
      84 * pK * Math.sin(th) +
      pA * Math.sin(3 * th + t * 1.1) +
      pA * 0.5 * Math.sin(5 * th - t * 1.7);
    const z = Math.sin(th);
    let H =
      pH *
      (0.25 +
        0.75 * Math.pow(0.5 + 0.5 * Math.sin(2 * th + t * 0.9 + Math.sin(th * 3 + t * 0.4)), 1.5));
    H *= 1 + wListen * (Math.max(0, z) * (0.4 + vo * 0.9));
    H *=
      1 +
      wSpeak *
        0.9 *
        speech(t - Math.abs(Math.atan2(z, Math.cos(th)) - Math.PI / 2) * 0.35) *
        Math.max(0.2, z);
    H *= breathe * lift;
    out.push(lx * ct - ly * sn, lx * sn + ly * ct, H, z);
  }
  return out;
}

/**
 * The pose with `n` rays. The prototype gives ray j a fixed place (j/110·τ + flow) and moves
 * its colour (j/110 + col); here ray m keeps its colour (m/n of the palette) and takes the
 * place where the prototype's curtain has that colour (m/n·τ + flow − col·τ). Both sample the
 * same curtain; only the colours had to be animated otherwise, which native gradients cannot.
 */
export function polarPose(sim: PolarSim, voice: number, n: number): PolarPose {
  'worklet';
  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    rays: polarRays(sim, voice, n, sim.flow - sim.col * TAU),
    bright: blend(sim.w, P_BRIGHT),
    burstU: (sim.hT - 0.35) / 1.3,
    burstGate: sim.w[5] ?? 0,
  };
}

/** Where the "happy" shower spreads: from a ring round the orb. */
export const POLAR_BURST: BurstSpot = { cx: 0, cy: -10, reach: 52, r0: 50 };

export type PolarDetail = {
  aurora: boolean;
  /** How many rays and how wide (avatars: half as many, twice as wide — the same curtain). */
  rays: number;
  width: number;
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

export function polarDetail(size: number): PolarDetail {
  const level = orbLevel(size);
  if (level === 'none')
    return { aurora: false, rays: 0, width: 0, sparkles: 0, shadow: false, halo: false };
  if (level === 'avatar')
    return {
      aurora: true,
      rays: POLAR_RAYS / 2,
      width: POLAR_WIDTH * 2,
      sparkles: 8,
      shadow: false,
      halo: false,
    };
  return {
    aurora: true,
    rays: POLAR_RAYS,
    width: POLAR_WIDTH,
    sparkles: POLAR_SPARKLES,
    shadow: true,
    halo: true,
  };
}

export const POLAR: SignatureMaths<PolarSim, PolarPose, PolarDetail> = {
  settle: POLAR_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newPolar, stepPolar, state);
  },
  still: stillPolar,
  step: stepPolar,
  pose: (sim, voice, detail) => {
    'worklet';
    return polarPose(sim, voice, detail.rays);
  },
  // Each ray is drawn on both sides of the glass and shows on the side it is on (the
  // renderer reads its depth); the prototype's re-stacking of rays that cross sides is not
  // kept (see PolarlichtSignature.tsx).
  order: () => {
    'worklet';
    return firstOrder([]);
  },
  nodes: () => {
    'worklet';
    return [];
  },
};
