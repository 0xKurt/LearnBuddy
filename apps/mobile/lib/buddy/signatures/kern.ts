// Signature "kern" (prototype round 1, variant 3 "Lichtkern"): a soft whirl of light lives in
// the glass — Buddy's thought; its current shows what he is doing.
//   idle    three arms of light turn slowly round a bright core;
//   listen  the arms draw in, the core grows large and breathes with her voice;
//   think   the whirl turns fast and winds tighter;
//   wait    only a small light is left, with a calm heartbeat;
//   speak   the core pulses in the rhythm of his words, the arms reach further;
//   happy   the core flares up, the whirl blooms and throws sparkles.
//
// Everything lies in the glass, under its shine (OrbStage's `inside`). Pure maths (core.ts);
// the drawing is components/lb/signatures/KernSignature.tsx.

import {
  HAPPY,
  TAU,
  basePose,
  blend,
  clamp,
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

/** When "happy" hands back to idle: the flare has faded by 1.1 s, the sparkles end at 1.5 s. */
export const KERN_SETTLE = 1.9;

/** Points along each arm (the prototype's N): 27 on each side. */
export const KERN_SEGMENTS = 26;

// One row per state (order of ORB_STATES), as in the prototype's KERN.params.
/** How fast the whirl turns (rad/s). */
const SPIN = [TAU / 10, TAU / 16, TAU / 1.9, TAU / 18, TAU / 6, TAU / 3];
/** How far an arm winds (rad from its root to its tip). */
const TWIST = [2.3, 1.3, 3.6, 1.9, 2.2, 2.6];
/** An arm's length and width (units). */
const LEN = [40, 28, 42, 24, 36, 46];
const WIDTH = [6.5, 5.5, 6, 4.5, 6.5, 7.5];
/** The core's size and the arms' opacity. */
const CORE = [10, 14, 8, 6.5, 10, 12];
const ARM_OP = [0.9, 0.7, 1, 0.55, 0.85, 1];

export type KernSim = OrbSim & {
  /** The whirl's turn (rad). */
  phi: number;
};

export type KernPose = {
  orb: number;
  halo: number;
  /** The three arms (SVG paths in the whirl's frame). */
  arms: string[];
  /** The arms' opacity. */
  armOp: number;
  /** The blue and the pink cloud that circle in the glass. */
  blueX: number;
  blueY: number;
  pinkX: number;
  pinkY: number;
  /** The core's soft light and its bright dot (radii, units). */
  glowR: number;
  dotR: number;
  /** The flare of "happy" (opacity, radius). */
  flareOp: number;
  flareR: number;
  burstU: number;
  burstGate: number;
};

export function newKern(state: OrbState = 'idle'): KernSim {
  'worklet';
  return { ...newOrbSim(state), phi: 0.4 };
}

/** The whirl's own turn over `dt`, at the speed of the (new) state blend. */
export function turnKern(sim: KernSim, dt: number): KernSim {
  'worklet';
  return { ...sim, phi: sim.phi + dt * blend(sim.w, SPIN) };
}

export function stepKern(prev: KernSim, dt: number, state: OrbState): KernSim {
  'worklet';
  return turnKern({ ...stepOrbSim(prev, dt, state, KERN_SETTLE), phi: prev.phi }, dt);
}

/** The prototype's stills: "happy" 0.6 s in, every other state 2.6 s. */
export function stillKern(state: OrbState): KernSim {
  'worklet';
  return settleInto(newKern(state), stepKern, state, state === 'happy' ? 0.6 : 2.6);
}

/** The prototype writes path numbers with two decimals. */
function f2(n: number): number {
  'worklet';
  return Math.round(n * 100) / 100;
}

/** One arm of light: a tapering band that winds out from the core (the prototype's path). */
export function kernArm(base: number, twist: number, len: number, width: number): string {
  'worklet';
  const left: string[] = [];
  const right: string[] = [];
  for (let j = 0; j <= KERN_SEGMENTS; j++) {
    const u = j / KERN_SEGMENTS;
    const r = 3 + u * len;
    const th = base + twist * u;
    const x = Math.cos(th) * r;
    const y = Math.sin(th) * r;
    const wd =
      width *
      Math.pow(1 - u, 0.9) *
      (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.6 + 0.15)));
    const nx = -Math.sin(th) * wd * 0.5;
    const ny = Math.cos(th) * wd * 0.5;
    left.push(`${f2(x + nx)} ${f2(y + ny)}`);
    right.push(`${f2(x - nx)} ${f2(y - ny)}`);
  }
  right.reverse();
  return `M${left.join('L')}L${right.join('L')}Z`;
}

export function kernPose(sim: KernSim, voice: number, detail: KernDetail): KernPose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wListen = w[1] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[HAPPY] ?? 0;
  const vo = clamp(voice);
  const sp = speech(t);
  const phi = sim.phi;

  const beatT = ((t % 2.4) + 2.4) % 2.4;
  const beat =
    Math.exp(-Math.pow((beatT - 0.2) * 9, 2)) + 0.6 * Math.exp(-Math.pow((beatT - 0.5) * 9, 2));
  const hf = wHappy * (h < 1.6 ? Math.exp(-Math.pow((h - 0.35) * 3.2, 2)) : 0);
  const len = blend(w, LEN) + wSpeak * sp * 10 + hf * 8;
  const core = blend(w, CORE) + wListen * vo * 7 + wWait * beat * 3 + wSpeak * sp * 6 + hf * 8;
  const width = blend(w, WIDTH) * 2.6;
  const twist = blend(w, TWIST);
  const arms: string[] = [];
  if (detail.whirl)
    for (let i = 0; i < 3; i++) arms.push(kernArm(phi + (i * TAU) / 3, twist, len, width));

  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    arms,
    armOp: clamp(blend(w, ARM_OP) + hf * 0.3),
    blueX: Math.cos(phi * 0.6) * 16,
    blueY: Math.sin(phi * 0.6) * 16,
    pinkX: Math.cos(phi * 0.6 + Math.PI) * 16,
    pinkY: Math.sin(phi * 0.6 + Math.PI) * 16,
    glowR: core * 2.2,
    dotR: core * 0.5,
    flareOp: hf * 0.85,
    flareR: 20 + hf * 20,
    burstU: (h - 0.3) / 1.2,
    burstGate: wHappy,
  };
}

/** Where the whirl's "happy" sparkles spread: from the glass's edge outwards. */
export const KERN_BURST: BurstSpot = { cx: 0, cy: 0, reach: 46, r0: 40 };

export type KernDetail = {
  whirl: boolean;
  /** Sparkles in the "happy" shower (the prototype's 14). */
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

export function kernDetail(size: number): KernDetail {
  const level = orbLevel(size);
  if (level === 'none') return { whirl: false, sparkles: 0, shadow: false, halo: false };
  if (level === 'avatar') return { whirl: true, sparkles: 7, shadow: false, halo: false };
  return { whirl: true, sparkles: 14, shadow: true, halo: true };
}

export const KERN: SignatureMaths<KernSim, KernPose, KernDetail> = {
  settle: KERN_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newKern, stepKern, state);
  },
  still: stillKern,
  step: stepKern,
  pose: kernPose,
  // Everything of the whirl lies in the glass.
  order: () => {
    'worklet';
    return firstOrder([]);
  },
  nodes: () => {
    'worklet';
    return [];
  },
};
