// Signature "mond" — Buddy's moon, the chosen default (owner decision 2026-09-27, prototype
// round 1, variant 1 "Mond"): a small pearl moon on a tilted orbit that passes in front of
// and behind the glass orb. It is Buddy's attention made visible, and each of its six
// states is a clearly different movement:
//   idle    circles slowly and draws a faint trail of light;
//   listen  stops at the upper right and glows with her voice;
//   think   races round, the trail becomes a ring of light;
//   wait    hovers and bobs, a soft ping says "your turn";
//   speak   sways and pulses in the rhythm of Buddy's words;
//   happy   spirals up, flashes in a shower of sparkles and glides back.
// States blend (core.ts), so a change never jumps.
//
// Pure maths, no React: the same functions run on the UI thread (worklets,
// components/lb/signatures/MondSignature.tsx), in unit tests and — with the same numbers —
// in scripts/brand/render-icons.mjs. Units: the orb's radius is 54.
// docs/DESIGN-BRIEF.md §Buddy's moon.

import {
  HAPPY,
  ORB_R,
  TAU,
  basePose,
  blend,
  burstPose,
  clamp,
  easeInOut,
  lerp,
  newOrbSim,
  orbLevel,
  orbitPt,
  placeNodes,
  settleInto,
  shownState,
  smooth,
  speech,
  stepOrbSim,
  type BurstSpot,
  type NodeOrder,
  type OrbSim,
  type OrbState,
  type SignatureMaths,
  type Sparkle,
} from './core.js';

/** Seconds from the start of "happy" until the moon is back in its orbit. */
export const HAPPY_SECONDS = 2.1;
/** After this long, a finished "happy" hands over to idle by itself. */
export const HAPPY_SETTLE = 2.4;

// One row per state (order of ORB_STATES), as in the approved prototype.
//              idle      listen  think       wait  speak happy
const P_R = [80, 76, 78, 76, 76, 82];
const P_K = [0.3, 0.3, 0.34, 0.3, 0.3, 0.3];
const P_SPEED = [TAU / 9, 0, TAU / 1.25, 0, 0, TAU / 3.2];
const P_PARK = [0, 1, 0, 1, 1, 0];
const P_LIFT = [0, 22, 0, 16, 20, 0];
const P_SIZE = [1, 1.25, 0.9, 1.05, 1.05, 1.05];
const P_GLOW = [0.55, 1, 0.7, 0.6, 0.75, 0.9];
const P_TRAIL = [0.5, 0, 1, 0, 0, 0.8];
/** Where the moon parks (orbit angle): upper right, in front of the orb. */
const PARK_ANGLE = 0.3;

export type MoonSim = OrbSim & {
  /** The moon's angle on its orbit. */
  a: number;
};

export type MoonPose = {
  /** The orb's breathing/pulse scale. */
  orb: number;
  /** The halo's strength (0…1+). */
  halo: number;
  /** The moon: position (units from the orb's centre), in front (z ≥ 0) or behind, scale, glow. */
  x: number;
  y: number;
  z: number;
  scale: number;
  glow: number;
  /** The moon's reflection on the glass. */
  reflX: number;
  reflY: number;
  reflRot: number;
  reflOp: number;
  /** The waiting ping ring around the moon. */
  pingR: number;
  pingOp: number;
  /** The trail: x, y, z, r, opacity per ghost. */
  ghosts: number[];
  /** Sparkle burst progress (0…1, outside = none) and strength. */
  burstU: number;
  burstGate: number;
};

export function newMoon(state: OrbState = 'idle'): MoonSim {
  'worklet';
  return { ...newOrbSim(state), a: 0.9 };
}

/** The state that is really showing: a finished "happy" goes back to idle. */
export function effectiveState(sim: MoonSim): number {
  'worklet';
  return shownState(sim, HAPPY_SETTLE);
}

/** One step of `dt` seconds towards `state` (a new "happy" starts its flight). */
export function stepMoon(prev: MoonSim, dt: number, state: OrbState): MoonSim {
  'worklet';
  const next: MoonSim = { ...stepOrbSim(prev, dt, state, HAPPY_SETTLE), a: prev.a };
  const park = blend(next.w, P_PARK);
  const speed = blend(next.w, P_SPEED);
  let d = (((PARK_ANGLE - next.a) % TAU) + TAU) % TAU;
  if (d > TAU - 0.7) d -= TAU;
  next.a += dt * ((1 - park) * speed + park * clamp(d * 3.4, -3, 6));
  return next;
}

/**
 * Settle into a state without animating (reduce motion, a still avatar, the app icon):
 * `secs` of simulated time with the state fully on.
 */
export function stillMoon(state: OrbState, secs: number): MoonSim {
  'worklet';
  return settleInto(newMoon(state), stepMoon, state, secs);
}

/** How long a still pose simulates per state (the prototype's stills). */
export function stillSeconds(state: OrbState): number {
  'worklet';
  return state === 'happy' ? 1.0 : 2.6;
}

/**
 * Where everything is in this frame. `voice` is her voice (0…1) while listening; `ghosts`
 * how many trail dots are drawn (the trail keeps its length, fewer dots are spaced wider).
 */
export function moonPose(sim: MoonSim, voice: number, ghosts: number): MoonPose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const wListen = w[1] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[HAPPY] ?? 0;
  const vo = clamp(voice);
  const sp = speech(t);

  const R = blend(w, P_R);
  const k = blend(w, P_K);
  const park = blend(w, P_PARK);
  const speed = blend(w, P_SPEED);
  const lift = blend(w, P_LIFT);
  const size = blend(w, P_SIZE);
  const trail = blend(w, P_TRAIL);
  const eff = (1 - park) * speed;

  const pt = orbitPt(sim.a, R, k);
  const bob = wWait * Math.sin((t * TAU) / 1.8) * 4.5;
  let x = pt.x + wSpeak * Math.sin(t * TAU * 0.55) * 3.5;
  let y = pt.y - lift - bob;
  let z = pt.z;
  let scale = size * (1 + wListen * vo * 0.22 + wSpeak * sp * 0.32) * (1 + 0.12 * pt.z);
  let glow = blend(w, P_GLOW) + wListen * vo * 0.6 + wSpeak * sp * 0.5;

  // Happy: spiral up, flash with a shower of sparkles, glide back.
  const h = sim.hT;
  let hm = 0;
  let hs = 1;
  let hx = 0;
  let hy = -84;
  if (h < 0.85) {
    const u = easeInOut(h / 0.85);
    hm = smooth(h / 0.2);
    const sa = h * 13;
    const rr = (1 - u) * 20;
    hx = lerp(x, 0, u) + Math.cos(sa) * rr * u;
    hy = lerp(y, -84, u) + Math.sin(sa) * rr * 0.35 * u;
    hs = 1 + 0.3 * u;
  } else if (h < 1.25) {
    hm = 1;
    hs = 1.3 + 0.3 * Math.sin((Math.PI * (h - 0.85)) / 0.4);
  } else if (h < HAPPY_SECONDS) {
    const u = easeInOut((h - 1.25) / 0.85);
    hm = 1 - u;
    hs = lerp(1.3, 1, u);
  }
  x = lerp(x, hx, wHappy * hm);
  y = lerp(y, hy, wHappy * hm);
  if (wHappy * hm > 0.5) z = 1;
  glow += wHappy * hm * 0.6;
  scale *= lerp(1, hs, wHappy);

  const dist = Math.hypot(x, y) || 1;
  const nx = x / dist;
  const ny = y / dist;
  const near = clamp(1 - (dist - ORB_R) / 40) * (z >= 0 ? 1 : 0.25) * clamp(scale);
  const pu = (((t % 1.8) + 1.8) % 1.8) / 1.8;

  const hide = 1 - wHappy * hm;
  const n = Math.max(0, Math.floor(ghosts));
  const spacing = n > 0 ? 12 / n : 1;
  const step = clamp(eff * 0.042, 0, 0.32) * spacing;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const gp = orbitPt(sim.a - (i + 1) * step, R, k);
    const op = trail * (1 - (i + 1) / (n + 1)) * 0.8 * clamp(eff / 1.6) * hide;
    out.push(gp.x, gp.y - lift, gp.z, (4.2 - i * 0.24 * spacing) * (1 + 0.12 * gp.z), op);
  }

  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    x,
    y,
    z,
    scale,
    glow,
    reflX: nx * 45,
    reflY: ny * 45,
    reflRot: Math.atan2(ny, nx) * (180 / Math.PI) + 90,
    reflOp: near * (0.45 + glow * 0.3),
    pingR: 10 + pu * 16,
    pingOp: wWait * (1 - pu) * 0.8,
    ghosts: out,
    burstU: (h - 0.8) / 1.2,
    burstGate: wHappy,
  };
}

/**
 * Which of the moon's parts lies on top of which (core.ts NodeOrder). Nodes: 0 the moon,
 * 1 the ping, 2… the trail dots.
 */
export type MoonOrder = NodeOrder;

/** The prototype's first order: the trail behind the glass, the ping and then the moon in front. */
export function newOrder(ghosts: number): MoonOrder {
  'worklet';
  const n = Math.max(0, Math.floor(ghosts));
  const front: boolean[] = [true, true];
  const seq: number[] = [n + 1, n];
  for (let i = 0; i < n; i++) {
    front.push(false);
    seq.push(i);
  }
  return { front, seq, next: n + 2 };
}

/** Each node's depth in the order the prototype places them: the moon, the ping, the dots. */
export function moonNodes(pose: MoonPose): number[] {
  'worklet';
  const zs = [pose.z, pose.z];
  const n = Math.floor(pose.ghosts.length / 5);
  for (let i = 0; i < n; i++) zs.push(pose.ghosts[i * 5 + 2] ?? 0);
  return zs;
}

/** The order after this frame's pose: each part that changed sides goes on top of its side. */
export function placeOrder(order: MoonOrder, pose: MoonPose): MoonOrder {
  'worklet';
  return placeNodes(order, moonNodes(pose));
}

/** Where the moon's "happy" shower spreads: above the orb. */
export const MOON_BURST: BurstSpot = { cx: 0, cy: -84, reach: 46, r0: 8 };

/** Where a sparkle of the "happy" shower is at burst progress u (0…1). */
export function sparklePose(
  q: Sparkle,
  u: number,
): { x: number; y: number; scale: number; rot: number; op: number } {
  'worklet';
  return burstPose(q, u, MOON_BURST);
}

/** How much of the moon an orb of a given size draws (small avatars stay calm). */
export type MoonDetail = {
  moon: boolean;
  /** Trail dots (the prototype's 12; fewer are spaced wider, the trail keeps its length). */
  ghosts: number;
  reflection: boolean;
  ping: boolean;
  /** Sparkles in the "happy" burst. */
  sparkles: number;
  /** The soft shadow under the orb and the white halo around it (the prototype's stage). */
  shadow: boolean;
  halo: boolean;
};

/** The prototype's trail and burst. */
export const PROTO_GHOSTS = 12;
export const PROTO_SPARKLES = 14;

export function moonDetail(size: number): MoonDetail {
  const level = orbLevel(size);
  if (level === 'none')
    return {
      moon: false,
      ghosts: 0,
      reflection: false,
      ping: false,
      sparkles: 0,
      shadow: false,
      halo: false,
    };
  // A chat avatar (about 26 px): the same moon at the same scale, only fewer trail dots
  // and sparkles (each would be under a pixel) and no reflection, shadow or halo.
  if (level === 'avatar')
    return {
      moon: true,
      ghosts: 6,
      reflection: false,
      ping: true,
      sparkles: 7,
      shadow: false,
      halo: false,
    };
  return {
    moon: true,
    ghosts: PROTO_GHOSTS,
    reflection: true,
    ping: true,
    sparkles: PROTO_SPARKLES,
    shadow: true,
    halo: true,
  };
}

/** The moon as the renderer drives it (components/lb/signatures/useSignature.ts). */
export const MOND: SignatureMaths<MoonSim, MoonPose, MoonDetail> = {
  settle: HAPPY_SETTLE,
  start: (state) => {
    'worklet';
    return stillMoon(state === 'happy' ? 'idle' : state, 1.5);
  },
  still: (state) => {
    'worklet';
    return stillMoon(state, stillSeconds(state));
  },
  step: stepMoon,
  pose: (sim, voice, detail) => {
    'worklet';
    return moonPose(sim, voice, detail.ghosts);
  },
  order: (detail) => {
    'worklet';
    return newOrder(detail.ghosts);
  },
  nodes: moonNodes,
};
