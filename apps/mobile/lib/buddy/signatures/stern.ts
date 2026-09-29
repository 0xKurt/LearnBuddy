// Signature "stern" (prototype round 1, variant 5 "Funkelstern"): the glint on the glass is a
// four-pointed star. It twinkles, wanders over the orb and jumps out when something works.
//   idle    the star sits as the highlight at the upper left and flashes now and then;
//   listen  it grows large and calm, its rays grow with her voice;
//   think   it glides quickly over the glass, drawing little stars behind it;
//   wait    it becomes small and quiet, a shimmer of light sweeps slowly over the orb;
//   speak   it twinkles in rhythm, little stars leave it towards the rim;
//   happy   it jumps out of the glass, twinkles in a shower of stars and glides back.
//
// The star takes the place of the glass's own highlight. Pure maths (core.ts); the drawing
// is components/lb/signatures/SternSignature.tsx.

import {
  HAPPY,
  TAU,
  basePose,
  clamp,
  easeInOut,
  firstOrder,
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

/** When "happy" hands back to idle: the star is home at 1.9 s, the shower ends at 1.61 s. */
export const STERN_SETTLE = 2.2;

/** Where the star sits as the glass's highlight (upper left). */
const HX = -21;
const HY = -25;

/** Little stars behind the thinking star; little stars leaving the speaking one. */
export const STERN_GHOSTS = 6;
export const STERN_MINIS = 3;

export type SternSim = OrbSim & {
  /** Where the thinking star is on its path over the glass. */
  ph: number;
};

export type SternPose = {
  orb: number;
  halo: number;
  /** The star: centre, ray size (radius, units), turn (degrees). */
  x: number;
  y: number;
  r: number;
  rot: number;
  /** Its soft light (radius, opacity) and the small diagonal cross between its rays. */
  glowR: number;
  glowOp: number;
  crossOp: number;
  /** The thinking trail: x, y, rotation, scale (radius), opacity per little star. */
  ghosts: number[];
  /** Little stars leaving it while speaking: x, y, rotation, scale (radius) each. */
  minis: number[];
  /** The waiting shimmer: how far it has swept (units, along its 28° axis) and its opacity. */
  sweepX: number;
  sweepOp: number;
  burstU: number;
  burstGate: number;
};

export function newStern(state: OrbState = 'idle'): SternSim {
  'worklet';
  return { ...newOrbSim(state), ph: -2.2 };
}

export function stepStern(prev: SternSim, dt: number, state: OrbState): SternSim {
  'worklet';
  return { ...stepOrbSim(prev, dt, state, STERN_SETTLE), ph: prev.ph + (dt * TAU) / 2.1 };
}

/** The prototype's stills: "happy" 0.8 s in, "wait" 1.7 s, every other state 2.6 s. */
export function stillStern(state: OrbState): SternSim {
  'worklet';
  const secs = state === 'happy' ? 0.8 : state === 'wait' ? 1.7 : 2.6;
  return settleInto(newStern(state), stepStern, state, secs);
}

/** The thinking star's path over the glass: an ellipse turned by −0.35 rad. */
function glide(a: number): { x: number; y: number } {
  'worklet';
  const x = Math.cos(a) * 33;
  const y = Math.sin(a) * 28;
  const r = -0.35;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

export function sternPose(sim: SternSim, voice: number): SternPose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wIdle = w[0] ?? 0;
  const wListen = w[1] ?? 0;
  const wThink = w[2] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[HAPPY] ?? 0;
  const vo = clamp(voice);
  const sp = speech(t);
  const ph = sim.ph;

  const think = glide(ph);
  let hx = HX;
  let hy = HY;
  let hr = 0;
  let hs = 1;
  if (h < 0.5) {
    const u = easeInOut(h / 0.5);
    hx = lerp(HX, 0, u);
    hy = lerp(HY, -80, u);
    hr = u * 180;
    hs = 1 + 0.5 * u;
  } else if (h < 1.0) {
    hx = 0;
    hy = -80;
    hr = 180 + (h - 0.5) * 120;
    hs = 1.5 + 0.25 * Math.sin((Math.PI * (h - 0.5)) / 0.5);
  } else if (h < 1.9) {
    const u = easeInOut((h - 1) / 0.9);
    hx = lerp(0, HX, u);
    hy = lerp(-80, HY, u);
    hr = 240 + u * 120;
    hs = lerp(1.5, 1, u);
  }
  const x = HX * (1 - wThink - wHappy) + think.x * wThink + hx * wHappy;
  const y = HY * (1 - wThink - wHappy) + think.y * wThink + hy * wHappy;
  const flashT = ((t % 4.5) + 4.5) % 4.5;
  const flash = Math.exp(-Math.pow((flashT - 0.3) * 5, 2));
  const slow = 0.5 + 0.5 * Math.sin((t * TAU) / 2.8);
  const r =
    wIdle * (15 * (1 + 0.05 * Math.sin(t * 1.7)) + flash * 6) +
    wListen * (18 + vo * 6) +
    wThink * 12.5 +
    wWait * (10 + slow * 4) +
    wSpeak * (14 + sp * 10) +
    wHappy * 16 * hs;
  const rot =
    wIdle * 8 * Math.sin(t * 0.6) + wThink * ((ph * 57.3) % 360) + wSpeak * sp * 18 + wHappy * hr;

  const ghosts: number[] = [];
  for (let i = 0; i < STERN_GHOSTS; i++) {
    const p = glide(ph - (i + 1) * 0.32);
    ghosts.push(
      p.x,
      p.y,
      i * 20,
      Math.max((6.5 - i * 0.9) * wThink, 0),
      wThink * (1 - i / STERN_GHOSTS) * 0.8,
    );
  }
  const minis: number[] = [];
  for (let i = 0; i < STERN_MINIS; i++) {
    const e = (((t + i * 0.43) % 1.3) + 1.3) % 1.3;
    const u = e / 1.3;
    const a = ((-150 + i * 26) * Math.PI) / 180;
    const d = 10 + u * 34;
    const sc = 6 * Math.sin(Math.PI * u) * wSpeak * (0.6 + sp * 0.8);
    minis.push(HX + Math.cos(a) * d, HY + Math.sin(a) * d, u * 90, Math.max(sc, 0));
  }
  const su = (((t % 3.4) + 3.4) % 3.4) / 3.4;

  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    x,
    y,
    r,
    rot,
    glowR: r * 1.05,
    glowOp: 0.7 + wListen * 0.3 + flash * wIdle * 0.3,
    crossOp: 0.45 + 0.4 * (wIdle * flash + wSpeak * sp + wListen),
    ghosts,
    minis,
    sweepX: lerp(-80, 80, easeInOut(su)),
    sweepOp: wWait * Math.sin(Math.PI * su) * 0.8,
    burstU: (h - 0.46) / 1.15,
    burstGate: wHappy,
  };
}

/** Where the star's "happy" shower spreads: round its jump above the orb. */
export const STERN_BURST: BurstSpot = { cx: 0, cy: -80, reach: 48, r0: 2 };

export type SternDetail = {
  star: boolean;
  /** Sparkles in the "happy" shower (the prototype's 16). */
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

export function sternDetail(size: number): SternDetail {
  const level = orbLevel(size);
  if (level === 'none') return { star: false, sparkles: 0, shadow: false, halo: false };
  if (level === 'avatar') return { star: true, sparkles: 8, shadow: false, halo: false };
  return { star: true, sparkles: 16, shadow: true, halo: true };
}

export const STERN: SignatureMaths<SternSim, SternPose, SternDetail> = {
  settle: STERN_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newStern, stepStern, state);
  },
  still: stillStern,
  step: stepStern,
  pose: (sim, voice) => {
    'worklet';
    return sternPose(sim, voice);
  },
  // Everything of the star lies in front of the glass.
  order: () => {
    'worklet';
    return firstOrder([]);
  },
  nodes: () => {
    'worklet';
    return [];
  },
};
