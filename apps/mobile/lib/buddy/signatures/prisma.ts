// Signature "prisma" (prototype round 2, variant E "Prisma"): Buddy breaks light like a
// prism — a bright beam goes in at the upper left, a fan of pastel rainbow comes out at the
// lower right, and a small caustic rainbow lies on the glass.
//   idle    a soft rainbow fan falls to the lower right and breathes quietly;
//   listen  a bright beam flows into Buddy with her voice;
//   think   the rainbow wanders round like a lighthouse;
//   wait    only a narrow, quiet rainbow stripe that pulses slowly;
//   speak   the rainbow shines out in the rhythm of the words;
//   happy   rainbows in all directions, and colourful sparkles.
//
// Pure maths (core.ts); the drawing is components/lb/signatures/PrismaSignature.tsx.

import {
  HAPPY,
  ORB_R,
  TAU,
  basePose,
  blend,
  clamp,
  firstOrder,
  liveStart,
  newOrbSim,
  orbLevel,
  settleInto,
  smooth,
  speech,
  stepOrbSim,
  type BurstSpot,
  type OrbSim,
  type OrbState,
  type SignatureMaths,
} from './core.js';

/** When "happy" hands back to idle: the sparkles end at 1.55 s, the three fans turn on. */
export const PRISMA_SETTLE = 2.2;

// One row per state (order of ORB_STATES), as in the prototype's PRISMA.params (`ang` is 38
// in every state).
//                idle  listen think      wait  speak happy
const P_SPREAD = [20, 13, 16, 6, 19, 22];
const P_L = [72, 52, 66, 50, 62, 76];
const P_OP = [0.85, 0.5, 0.85, 0.55, 0.85, 0.95];
const P_BEAM = [0.25, 1, 0.15, 0.15, 0.2, 0.3];
const P_SPIN = [0, 0, TAU / 2.6, 0, 0, TAU / 2];
/** Where the fan points (degrees, clockwise from the right): the lower right. */
const ANG = 38;

/** The rainbow's pastel colours, from the fan's one edge to the other. */
export const PRISMA_COLS = [
  '#ff9fc0',
  '#ffbf94',
  '#ffe38f',
  '#9fe3be',
  '#95c1ff',
  '#bba0ff',
] as const;

/** Where a fan leaves the glass (units from the centre) and where the beam enters it. */
export const FAN_EXIT = ORB_R - 2;
export const BEAM_ENTRY = ORB_R - 3;
/** Where the beam starts (units from the centre). */
export const BEAM_START = 110;
/** A fan's rays are this long at most (for the drawing's size): speaking's 62 × 1.4, blended. */
export const FAN_MAX = 90;

export type PrismaSim = OrbSim & {
  /** How far the rainbow has turned (radians): it wanders round while thinking and happy. */
  rot: number;
};

export type PrismaPose = {
  orb: number;
  halo: number;
  /** Three fans: direction (degrees), half spread (degrees), length, opacity each. */
  fans: number[];
  /** The beam: direction (degrees, pointing from the centre to where it comes from), half width, opacity. */
  beamAng: number;
  beamW: number;
  beamOp: number;
  /** The caustic rainbow on the glass: its turn (degrees) and opacity. */
  causRot: number;
  causOp: number;
  burstU: number;
  burstGate: number;
};

export function newPrisma(state: OrbState = 'idle'): PrismaSim {
  'worklet';
  return { ...newOrbSim(state), rot: 0 };
}

export function stepPrisma(prev: PrismaSim, dt: number, state: OrbState): PrismaSim {
  'worklet';
  const next = stepOrbSim(prev, dt, state, PRISMA_SETTLE);
  return { ...next, rot: prev.rot + dt * blend(next.w, P_SPIN) };
}

/** The prototype's stills: "happy" 0.9 s, the others 2.6 s. */
export function stillPrisma(state: OrbState): PrismaSim {
  'worklet';
  return settleInto(newPrisma(state), stepPrisma, state, state === 'happy' ? 0.9 : 2.6);
}

export function prismaPose(sim: PrismaSim, voice: number): PrismaPose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wIdle = w[0] ?? 0;
  const wListen = w[1] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[HAPPY] ?? 0;
  const vo = clamp(voice);
  const sp = speech(t);
  const pOp = blend(w, P_OP);

  // The prototype turns radians into degrees with 57.3.
  const ang = ANG + wIdle * 5 * Math.sin(t * 0.45) + sim.rot * 57.3;
  const L =
    blend(w, P_L) *
    (1 + wSpeak * sp * 0.4 + wListen * vo * 0.1 + wWait * 0.12 * Math.sin((t * TAU) / 3));
  const op = pOp * (1 + wSpeak * (sp - 0.4) * 0.5 + wWait * 0.3 * Math.sin((t * TAU) / 3));
  const spread = blend(w, P_SPREAD);
  const hf = wHappy * smooth((h - 0.1) / 0.4);

  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    fans: [
      ang,
      spread,
      L,
      clamp(op),
      ang + 120,
      spread,
      L * 0.95,
      clamp(op * hf),
      ang + 240,
      spread,
      L * 0.95,
      clamp(op * hf),
    ],
    beamAng: ang + 180 - 8,
    beamW: 2.6 + wListen * vo * 3.4,
    beamOp: clamp(blend(w, P_BEAM) * (1 + wListen * (vo - 0.4))),
    causRot: ang - 38 + 150,
    causOp: 0.45 + 0.35 * pOp,
    burstU: (h - 0.25) / 1.3,
    burstGate: wHappy,
  };
}

/**
 * Ray `i` (0…5) of a fan in the fan's own frame: x along the fan from where it leaves the
 * glass, in units of the fan's length (the fan's light fades out at 1). Three points: the
 * ray's root inside the glass and its two outer corners.
 */
export function wedgePoints(i: number, spreadDeg: number, L: number): number[] {
  'worklet';
  const s = (spreadDeg * Math.PI) / 180;
  const a0 = -s + (2 * s * i) / 6;
  const a1 = -s + (2 * s * (i + 1)) / 6 + 0.01;
  const k = (3.5 * (i - 2.5)) / 2.5;
  const Lr = L || 1;
  return [
    (FAN_EXIT * 0.8 - FAN_EXIT) / Lr,
    k / Lr,
    Math.cos(a0),
    Math.sin(a0),
    Math.cos(a1),
    Math.sin(a1),
  ];
}

/** The same ray as an SVG path (the fan's frame). */
export function wedgePath(i: number, spreadDeg: number, L: number): string {
  'worklet';
  const p = wedgePoints(i, spreadDeg, L);
  return `M${p[0]} ${p[1]}L${p[2]} ${p[3]}L${p[4]} ${p[5]}Z`;
}

/** The beam in its own frame (x from the centre towards where it comes from): four corners. */
export function beamPath(halfWidth: number): string {
  'worklet';
  const n = halfWidth;
  return `M${BEAM_START} ${n * 0.4}L${BEAM_ENTRY} ${n}L${BEAM_ENTRY} ${-n}L${BEAM_START} ${-n * 0.4}Z`;
}

/** Where the confetti spreads: from the glass's edge outwards, all round. */
export const PRISMA_BURST: BurstSpot = { cx: 0, cy: 0, reach: 50, r0: 58 };

export type PrismaDetail = {
  prism: boolean;
  /** Sparkles in the "happy" shower. */
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

export function prismaDetail(size: number): PrismaDetail {
  const level = orbLevel(size);
  if (level === 'none') return { prism: false, sparkles: 0, shadow: false, halo: false };
  // A chat avatar: the same fans, beam and caustic at the same scale, half the sparkles.
  if (level === 'avatar') return { prism: true, sparkles: 8, shadow: false, halo: false };
  return { prism: true, sparkles: 16, shadow: true, halo: true };
}

export const PRISMA: SignatureMaths<PrismaSim, PrismaPose, PrismaDetail> = {
  settle: PRISMA_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newPrisma, stepPrisma, state);
  },
  still: stillPrisma,
  step: stepPrisma,
  pose: (sim, voice) => {
    'worklet';
    return prismaPose(sim, voice);
  },
  // No part changes sides: the fans and the beam stay behind the glass.
  order: () => {
    'worklet';
    return firstOrder([]);
  },
  nodes: () => {
    'worklet';
    return [];
  },
};
