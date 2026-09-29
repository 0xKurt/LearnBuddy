// Signatures "sternchen" and "nurstern" — the daughter's idea (prototype round 2, variant A
// "Sternchen", and round 3, A1 "Nur der große Stern"): a soft, round five-pointed star flies
// round Buddy.
//   idle    circles at leisure, turning a little;
//   listen  stops at the upper right and glows with her voice;
//   think   flies a quick figure of eight in front of and behind the orb;
//   wait    swings gently as if on a thread;
//   speak   hops in the rhythm of the words;
//   happy   flies a lap of honour round Buddy and glides back.
// "sternchen" adds its colourful tail of little sparkles, pastel sparkles round Buddy
// (sparkField.ts) and confetti at the top of "happy". "nurstern" is the star alone: no tail,
// no sparkles, no confetti — at the top of "happy" it whirls once round itself and sends out
// soft rings of light instead.
//
// Pure maths (core.ts); the drawing is components/lb/signatures/SternchenSignature.tsx.

import {
  HAPPY,
  ORB_R,
  TAU,
  basePose,
  blend,
  clamp,
  easeInOut,
  easeOut,
  firstOrder,
  lerp,
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
import { FIELD_DEFAULTS, fieldSparks, placeSpark } from './sparkField.js';

/** When "happy" hands back to idle: the star is home at 2.3 s, confetti and rings end by 2.31 s. */
export const STERNCHEN_SETTLE = 2.6;

// One row per state (order of ORB_STATES), as in the prototype's STERNCHEN.params.
//               idle      listen  think       wait  speak happy
const P_R = [80, 76, 84, 76, 76, 82];
const P_SPEED = [TAU / 10, 0, TAU / 2.3, 0, 0, TAU / 3];
const P_PARK = [0, 1, 0, 1, 1, 0];
const P_LIFT = [0, 24, 0, 20, 20, 0];
const P_SIZE = [1, 1.3, 0.95, 1.1, 1.1, 1.1];
const P_GLOW = [0.6, 1, 0.8, 0.7, 0.8, 1];
const P_TRAIL = [0.6, 0, 1, 0, 0, 0.8];
const P_EIGHT = [0, 0, 1, 0, 0, 0];
/** The orbit's depth (k) and tilt are the same in every state. */
const K = 0.3;
const TILT = -18;
/** Where the star parks (orbit angle): upper right, in front of the orb. */
const PARK_ANGLE = 0.3;

/** The prototype's tail, field and confetti. */
export const STAR_GHOSTS = 14;
export const STAR_SPARKS = 16;
export const STAR_CONFETTI = 18;
/** The field's sparkles (seed 7), the same every time. */
export const STAR_FIELD = fieldSparks(STAR_SPARKS, 7);

export type SternchenSim = OrbSim & {
  /** The star's angle on its orbit. */
  a: number;
  /** Where the lap of honour starts (the star's direction from the centre when "happy" began). */
  h0: number;
};

export type SternchenPose = {
  orb: number;
  halo: number;
  /** The star: centre, in front (z ≥ 0) or behind; its turn (degrees) and scale. */
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  /** Its soft light: opacity and scale. */
  glowOp: number;
  glowScale: number;
  /** Its warm reflection on the glass. */
  reflX: number;
  reflY: number;
  reflOp: number;
  /** The tail: x, y, z, rotation, scale, opacity per little sparkle. */
  ghosts: number[];
  /** The field round Buddy: x, y, z, rotation, scale, opacity per sparkle. */
  field: number[];
  /** "nurstern"'s rings of light round the star: radius, line width, opacity each. */
  rings: number[];
  burstU: number;
  burstGate: number;
};

export function newSternchen(state: OrbState = 'idle'): SternchenSim {
  'worklet';
  return { ...newOrbSim(state), a: 0.9, h0: 0 };
}

/** A point of the flight: the tilted orbit, or (thinking) a figure of eight. */
function flight(a: number, R: number, eight: number): { x: number; y: number; z: number } {
  'worklet';
  const e = orbitPt(a, R, K, TILT);
  const tt = (TILT * Math.PI) / 180;
  const x8 = R * Math.cos(a);
  const y8 = 30 * Math.sin(2 * a);
  const qx = x8 * Math.cos(tt) - y8 * Math.sin(tt);
  const qy = x8 * Math.sin(tt) + y8 * Math.cos(tt);
  return { x: lerp(e.x, qx, eight), y: lerp(e.y, qy, eight), z: lerp(e.z, Math.sin(a), eight) };
}

/** The star before "happy" takes it: on its flight, lifted, hopping or swinging. */
function flightPoint(sim: SternchenSim, sp: number): { x: number; y: number; z: number } {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const pt = flight(sim.a, blend(w, P_R), blend(w, P_EIGHT));
  let y = pt.y - blend(w, P_LIFT);
  y -= (w[4] ?? 0) * Math.abs(Math.sin(t * TAU * 1.15)) * 6 * (0.3 + sp);
  y += (w[3] ?? 0) * Math.sin((t * TAU) / 2.6) * 2;
  return { x: pt.x, y, z: pt.z };
}

/**
 * One step of `dt` seconds towards `state`. `aim`: when a new "happy" begins, remember where
 * the star is (its lap of honour starts there). The prototype's stills skip that, so they
 * pass false.
 */
function stepStar(prev: SternchenSim, dt: number, state: OrbState, aim: boolean): SternchenSim {
  'worklet';
  const next: SternchenSim = {
    ...stepOrbSim(prev, dt, state, STERNCHEN_SETTLE),
    a: prev.a,
    h0: prev.h0,
  };
  const park = blend(next.w, P_PARK);
  const speed = blend(next.w, P_SPEED);
  let d = (((PARK_ANGLE - next.a) % TAU) + TAU) % TAU;
  if (d > TAU - 0.7) d -= TAU;
  next.a += dt * ((1 - park) * speed + park * clamp(d * 3.4, -3, 6));
  if (aim && next.hT < 1.1 && next.hT < dt * 1.5) {
    const p = flightPoint(next, speech(next.t));
    next.h0 = Math.atan2(p.y, p.x);
  }
  return next;
}

export function stepSternchen(prev: SternchenSim, dt: number, state: OrbState): SternchenSim {
  'worklet';
  return stepStar(prev, dt, state, true);
}

function stepStill(prev: SternchenSim, dt: number, state: OrbState): SternchenSim {
  'worklet';
  return stepStar(prev, dt, state, false);
}

/** The prototype's stills (`happy` differs: "sternchen" 1.05 s, "nurstern" 1.3 s). */
export function stillSternchen(state: OrbState, happySecs: number): SternchenSim {
  'worklet';
  const secs = state === 'happy' ? happySecs : state === 'think' ? 2.2 : 2.6;
  return settleInto(newSternchen(state), stepStill, state, secs);
}

/** What differs between "sternchen" and "nurstern" (the prototype's flags). */
export type StarLook = {
  /** The colourful tail, the sparkle field and the confetti ("sternchen"). */
  sparkly: boolean;
  /** Whirl and rings of light at the top of "happy" ("nurstern"). */
  cheer: boolean;
};

export type StarDetail = {
  star: boolean;
  /** Tail sparkles, field sparkles, confetti (0 for "nurstern"). */
  ghosts: number;
  sparks: number;
  confetti: number;
  reflection: boolean;
  shadow: boolean;
  halo: boolean;
};

export function sternchenPose(
  sim: SternchenSim,
  voice: number,
  look: StarLook,
  detail: { ghosts: number; sparks: number },
): SternchenPose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wListen = w[1] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[HAPPY] ?? 0;
  const vo = clamp(voice);
  const sp = speech(t);
  const park = blend(w, P_PARK);
  const speed = blend(w, P_SPEED);
  const eff = (1 - park) * speed;
  const R = blend(w, P_R);
  const eight = blend(w, P_EIGHT);

  const pt = flightPoint(sim, sp);
  let x = pt.x;
  let y = pt.y;
  let z = pt.z;
  let rot =
    (w[0] ?? 0) * ((t * 20) % 360) +
    (w[2] ?? 0) * ((t * 140) % 360) +
    (w[3] ?? 0) * 16 * Math.sin((t * TAU) / 2.6) +
    wSpeak * 10 * Math.sin(t * TAU * 1.15);
  let scale = blend(w, P_SIZE) * (1 + wListen * vo * 0.22 + wSpeak * sp * 0.2) * (1 + 0.12 * pt.z);
  let glow = blend(w, P_GLOW) + wListen * vo * 0.5 + wSpeak * sp * 0.4;

  // Happy: a lap of honour round Buddy, a pause at the top, then home.
  let hm = 0;
  let hx = 0;
  let hy = -84;
  let hs = 1;
  if (h < 1.1) {
    const dd = ((((-Math.PI / 2 - sim.h0) % TAU) + TAU) % TAU) + TAU;
    const th = sim.h0 + dd * easeInOut(h / 1.1);
    hx = Math.cos(th) * 84;
    hy = Math.sin(th) * 84;
    hm = smooth(h / 0.15);
    hs = 1.1;
    rot += wHappy * h * 400;
  } else if (h < 1.5) {
    hm = 1;
    hs = 1.2 + 0.3 * Math.sin((Math.PI * (h - 1.1)) / 0.4);
  } else if (h < 2.3) {
    const u = easeInOut((h - 1.5) / 0.8);
    hm = 1 - u;
    hs = lerp(1.2, 1, u);
  }
  x = lerp(x, hx, wHappy * hm);
  y = lerp(y, hy, wHappy * hm);
  if (wHappy * hm > 0.5) z = 1;
  scale *= lerp(1, hs, wHappy);
  glow += wHappy * hm * 0.5;
  if (look.cheer) glow *= 0.9 + 0.12 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
  const glowScale = scale * (0.75 + clamp(glow, 0, 1.4) * 0.3);

  // "nurstern" at the top of "happy": one whirl round itself (two fifths of a turn) and a swell.
  let bodyRot = rot;
  let bodyScale = scale;
  if (look.cheer) {
    const cu = (h - 1.05) / 0.6;
    if (cu > 0 && cu < 1) {
      bodyRot = rot + wHappy * easeInOut(cu) * 144;
      bodyScale = scale * (1 + wHappy * 0.25 * Math.sin(Math.PI * cu));
    }
  }

  const dist = Math.hypot(x, y) || 1;
  const near = clamp(1 - (dist - ORB_R) / 40) * (z >= 0 ? 1 : 0.25);

  // The tail: fewer sparkles are spaced wider (it keeps its length).
  const ghosts: number[] = [];
  const n = look.sparkly ? Math.max(0, Math.floor(detail.ghosts)) : 0;
  const spacing = n > 0 ? STAR_GHOSTS / n : 1;
  const step = clamp(eff * 0.045, 0, 0.3) * spacing;
  const hide = 1 - wHappy * (h < 2.3 ? 1 : 0) * 0.7;
  for (let i = 0; i < n; i++) {
    const gp = flight(sim.a - (i + 1) * step, R, eight);
    const k = 1 - (i + 1) / (n + 1);
    const jx = Math.sin(i * 1.7 + t * 3) * 2.2;
    const jy = Math.cos(i * 2.3 + t * 2.4) * 2.2;
    ghosts.push(
      gp.x + jx,
      gp.y + jy,
      gp.z,
      i * 37 + t * 60,
      (1.4 + k * 2.4) * (1 + 0.12 * gp.z),
      blend(w, P_TRAIL) * k * clamp(eff / 1.2) * hide,
    );
  }

  const field: number[] = [];
  const m = look.sparkly ? Math.min(STAR_SPARKS, Math.max(0, Math.floor(detail.sparks))) : 0;
  for (let i = 0; i < m; i++) {
    const p = STAR_FIELD[i];
    if (p) placeSpark(field, p, i, m, w, t, h, vo, FIELD_DEFAULTS);
  }

  const rings: number[] = [];
  if (look.cheer)
    for (let i = 0; i < 3; i++) {
      const u = (h - 1.05 - i * 0.18) / 0.9;
      const on = u > 0 && u < 1;
      rings.push(12 + easeOut(u) * 42, 2.6 * (1 - u) + 0.4, on ? wHappy * (1 - u) * 0.9 : 0);
    }

  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    x,
    y,
    z,
    rot: bodyRot,
    scale: bodyScale,
    glowOp: clamp(glow),
    glowScale,
    reflX: (x / dist) * 45,
    reflY: (y / dist) * 45,
    reflOp: near * 0.55,
    ghosts,
    field,
    rings,
    burstU: look.sparkly ? (h - 1.05) / 1.2 : -1,
    burstGate: look.sparkly ? wHappy : 0,
  };
}

/** Where the confetti spreads: round the top of the lap of honour. */
export const STERNCHEN_BURST: BurstSpot = { cx: 0, cy: -84, reach: 50, r0: 8 };

/**
 * The stacking order (core.ts NodeOrder). Nodes: 0 the star, 1… the tail, then the field —
 * the tail starts behind the glass, the star and the field in front.
 */
function starOrder(detail: StarDetail): NodeOrder {
  'worklet';
  const front = [true];
  for (let i = 0; i < detail.ghosts; i++) front.push(false);
  for (let i = 0; i < detail.sparks; i++) front.push(true);
  return firstOrder(front);
}

/** Each node's depth, in the order the prototype places them: the star, the tail, the field. */
function starNodes(pose: SternchenPose): number[] {
  'worklet';
  const zs = [pose.z];
  for (let i = 2; i < pose.ghosts.length; i += 6) zs.push(pose.ghosts[i] ?? 0);
  for (let i = 2; i < pose.field.length; i += 6) zs.push(pose.field[i] ?? 0);
  return zs;
}

function starDetail(size: number, look: StarLook): StarDetail {
  const level = orbLevel(size);
  if (level === 'none')
    return {
      star: false,
      ghosts: 0,
      sparks: 0,
      confetti: 0,
      reflection: false,
      shadow: false,
      halo: false,
    };
  const s = look.sparkly;
  if (level === 'avatar')
    return {
      star: true,
      ghosts: s ? 7 : 0,
      sparks: s ? 8 : 0,
      confetti: s ? 9 : 0,
      reflection: false,
      shadow: false,
      halo: false,
    };
  return {
    star: true,
    ghosts: s ? STAR_GHOSTS : 0,
    sparks: s ? STAR_SPARKS : 0,
    confetti: s ? STAR_CONFETTI : 0,
    reflection: true,
    shadow: true,
    halo: true,
  };
}

const SPARKLY: StarLook = { sparkly: true, cheer: false };
const ALONE: StarLook = { sparkly: false, cheer: true };

export const sternchenDetail = (size: number): StarDetail => starDetail(size, SPARKLY);
export const nursternDetail = (size: number): StarDetail => starDetail(size, ALONE);

export const STERNCHEN: SignatureMaths<SternchenSim, SternchenPose, StarDetail> = {
  settle: STERNCHEN_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newSternchen, stepSternchen, state);
  },
  still: (state) => {
    'worklet';
    return stillSternchen(state, 1.05);
  },
  step: stepSternchen,
  pose: (sim, voice, detail) => {
    'worklet';
    return sternchenPose(sim, voice, SPARKLY, detail);
  },
  order: starOrder,
  nodes: starNodes,
};

export const NURSTERN: SignatureMaths<SternchenSim, SternchenPose, StarDetail> = {
  settle: STERNCHEN_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newSternchen, stepSternchen, state);
  },
  still: (state) => {
    'worklet';
    return stillSternchen(state, 1.3);
  },
  step: stepSternchen,
  pose: (sim, voice, detail) => {
    'worklet';
    return sternchenPose(sim, voice, ALONE, detail);
  },
  order: starOrder,
  nodes: starNodes,
};
