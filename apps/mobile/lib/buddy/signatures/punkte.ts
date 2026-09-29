// Signature "punkte" (prototype round 1, variant 4 "Drei Punkte"): three small satellites,
// related to the typing dots of the chat. They circle, gather, line up and speak.
//   idle    the three dots circle the orb, evenly spread;
//   listen  they move close together at the top and hop lightly with her voice;
//   think   they chase each other round the orb, close behind one another;
//   wait    they line up below and wave like "…": your turn;
//   speak   they stand in a slanting row outwards, the sound runs through them;
//   happy   they whirl upwards, throw sparkles and fly a lap of honour.
//
// Each dot follows its target on a spring (the prototype's, 4 sub-steps per frame), so it
// flies from one state's place to the next. A dot passes in front of and behind the glass.
// Pure maths (core.ts); the drawing is components/lb/signatures/PunkteSignature.tsx.

import {
  HAPPY,
  TAU,
  basePose,
  clamp,
  firstOrder,
  liveStart,
  newOrbSim,
  orbLevel,
  orbitPt,
  settleInto,
  smooth,
  speech,
  stepOrbSim,
  type BurstSpot,
  type NodeOrder,
  type OrbSim,
  type OrbState,
  type SignatureMaths,
} from './core.js';

/**
 * When "happy" hands back to idle: the whirl ends at 0.8 s, the sparkles at 1.82 s; then the
 * dots fly their lap of honour at three times the speed (one full lap by about 4.1 s).
 */
export const PUNKTE_SETTLE = 4.2;

/** The dots; each carries x, y, z and their speeds (6 numbers, in `dots`). */
export const PUNKTE_DOTS = 3;

/** The spring each dot follows its target with (the prototype's). */
const K = 170;
const DAMP = 2 * Math.sqrt(K) * 0.8;
const SUB = 4;

export type PunkteSim = OrbSim & {
  /** The circling dots' phase (idle, happy) and the chasing dots' phase (think). */
  ph: number;
  ph2: number;
  /** Per dot: x, y, z, vx, vy, vz. */
  dots: number[];
};

export type PunktePose = {
  orb: number;
  halo: number;
  /** Per dot: x, y, z (≥ 0 in front of the glass), scale, glow opacity. */
  dots: number[];
  burstU: number;
  burstGate: number;
};

export function newPunkte(state: OrbState = 'idle'): PunkteSim {
  'worklet';
  const dots: number[] = [];
  for (let i = 0; i < PUNKTE_DOTS; i++) {
    const p = orbitPt(1.0 + (i * TAU) / 3, 82, 0.28, -14);
    dots.push(p.x, p.y, p.z, 0, 0, 0);
  }
  return { ...newOrbSim(state), ph: 1.0, ph2: 0, dots };
}

/** The dots' own movement over `dt`: their phases and their springs (weights as they are). */
export function flyPunkte(sim: PunkteSim, dt: number): PunkteSim {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wHappy = w[HAPPY] ?? 0;
  const ph = sim.ph + ((dt * TAU) / 10) * (1 + wHappy * 2);
  const ph2 = sim.ph2 + (dt * TAU) / 1.4;
  let sum = 0;
  for (let k = 0; k < 6; k++) sum += w[k] ?? 0;
  const dots = sim.dots.slice();
  for (let i = 0; i < PUNKTE_DOTS; i++) {
    const idle = orbitPt(ph + (i * TAU) / 3, 82 + wHappy * 6, 0.28, -14);
    const la = ((-90 + (i - 1) * 21) * Math.PI) / 180;
    const think = orbitPt(ph2 - i * 0.48, 78, 0.3, -14);
    const wave = Math.pow(Math.max(0, Math.sin((t * TAU) / 1.4 - i * 0.9)), 2);
    const sa = (-36 * Math.PI) / 180;
    const sr = 67 + i * 13;
    let hx = idle.x;
    let hy = idle.y;
    let hz = idle.z;
    if (h < 0.8) {
      const a = h * 22 + (i * TAU) / 3;
      const r = 10 * smooth(h / 0.3);
      hx = Math.cos(a) * r;
      hy = -84 + Math.sin(a) * r * 0.8;
      hz = 1;
    }
    // Targets per state (order of ORB_STATES): x, y, z.
    const xs = [idle.x, Math.cos(la) * 71, think.x, (i - 1) * 16, Math.cos(sa) * sr, hx];
    const ys = [idle.y, Math.sin(la) * 71, think.y, 82 - wave * 7, Math.sin(sa) * sr, hy];
    const zs = [idle.z, 1, think.z, 1, 1, hz];
    let tx = 0;
    let ty = 0;
    let tz = 0;
    for (let k = 0; k < 6; k++) {
      tx += (w[k] ?? 0) * (xs[k] ?? 0);
      ty += (w[k] ?? 0) * (ys[k] ?? 0);
      tz += (w[k] ?? 0) * (zs[k] ?? 0);
    }
    tx /= sum;
    ty /= sum;
    tz /= sum;
    const o = i * 6;
    let x = dots[o] ?? 0;
    let y = dots[o + 1] ?? 0;
    let z = dots[o + 2] ?? 0;
    let vx = dots[o + 3] ?? 0;
    let vy = dots[o + 4] ?? 0;
    let vz = dots[o + 5] ?? 0;
    const d = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      vx += (K * (tx - x) - DAMP * vx) * d;
      vy += (K * (ty - y) - DAMP * vy) * d;
      vz += (K * (tz - z) - DAMP * vz) * d;
      x += vx * d;
      y += vy * d;
      z += vz * d;
    }
    dots[o] = x;
    dots[o + 1] = y;
    dots[o + 2] = z;
    dots[o + 3] = vx;
    dots[o + 4] = vy;
    dots[o + 5] = vz;
  }
  return { ...sim, ph, ph2, dots };
}

export function stepPunkte(prev: PunkteSim, dt: number, state: OrbState): PunkteSim {
  'worklet';
  const base = stepOrbSim(prev, dt, state, PUNKTE_SETTLE);
  return flyPunkte({ ...base, ph: prev.ph, ph2: prev.ph2, dots: prev.dots }, dt);
}

/** The prototype's stills: "happy" 0.95 s in, "think" 1.8 s, every other state 2.6 s. */
export function stillPunkte(state: OrbState): PunkteSim {
  'worklet';
  const secs = state === 'happy' ? 0.95 : state === 'think' ? 1.8 : 2.6;
  return settleInto(newPunkte(state), stepPunkte, state, secs);
}

/**
 * Where the dots are and how they look. `voices` is her voice as each dot hears it: the
 * prototype lets it run through the dots, 0.13 s later from one to the next.
 */
export function punktePoseOf(sim: PunkteSim, voices: number[], detail: PunkteDetail): PunktePose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wListen = w[1] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[HAPPY] ?? 0;
  const dots: number[] = [];
  const n = detail.dots ? PUNKTE_DOTS : 0;
  for (let i = 0; i < n; i++) {
    const vo = clamp(voices[i] ?? 0);
    const sp = speech(t - i * 0.1);
    const wave = Math.pow(Math.max(0, Math.sin((t * TAU) / 1.4 - i * 0.9)), 2);
    const z = sim.dots[i * 6 + 2] ?? 0;
    const size =
      (1 +
        wListen * 0.45 * vo +
        wWait * (0.25 * wave - 0.08) +
        wSpeak * (0.7 * sp - 0.2) +
        wHappy * (h < 0.8 ? 0.15 : 0)) *
      (1 + 0.14 * z);
    dots.push(
      sim.dots[i * 6] ?? 0,
      sim.dots[i * 6 + 1] ?? 0,
      z,
      size,
      0.45 + wListen * vo * 0.5 + wSpeak * sp * 0.5 + wWait * wave * 0.4,
    );
  }
  const base = basePose(sim, voices[0] ?? 0);
  return {
    orb: base.orb,
    halo: base.halo,
    dots,
    burstU: (h - 0.72) / 1.1,
    burstGate: wHappy,
  };
}

/** The app hears one voice level at a time: every dot follows it at once. */
export function punktePose(sim: PunkteSim, voice: number, detail: PunkteDetail): PunktePose {
  'worklet';
  return punktePoseOf(sim, [voice, voice, voice], detail);
}

/** Where the dots' "happy" sparkles spread: from their whirl above the orb. */
export const PUNKTE_BURST: BurstSpot = { cx: 0, cy: -84, reach: 46, r0: 4 };

export type PunkteDetail = {
  dots: boolean;
  /** Sparkles in the "happy" shower (the prototype's 14). */
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

export function punkteDetail(size: number): PunkteDetail {
  const level = orbLevel(size);
  if (level === 'none') return { dots: false, sparkles: 0, shadow: false, halo: false };
  if (level === 'avatar') return { dots: true, sparkles: 7, shadow: false, halo: false };
  return { dots: true, sparkles: 14, shadow: true, halo: true };
}

/** The stacking order (core.ts NodeOrder): the three dots, all starting in front. */
function dotOrder(detail: PunkteDetail): NodeOrder {
  'worklet';
  return firstOrder(detail.dots ? [true, true, true] : []);
}

/** Each dot's depth, in the order the prototype places them. */
function dotNodes(pose: PunktePose): number[] {
  'worklet';
  const zs: number[] = [];
  for (let i = 2; i < pose.dots.length; i += 5) zs.push(pose.dots[i] ?? 0);
  return zs;
}

export const PUNKTE: SignatureMaths<PunkteSim, PunktePose, PunkteDetail> = {
  settle: PUNKTE_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newPunkte, stepPunkte, state);
  },
  still: stillPunkte,
  step: stepPunkte,
  pose: punktePose,
  order: dotOrder,
  nodes: dotNodes,
};
