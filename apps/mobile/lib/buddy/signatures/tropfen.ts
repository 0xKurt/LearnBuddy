// Signature "tropfen" (prototype round 2, variant C "Tropfen"): Buddy is no rigid glass but a
// soft drop of jelly — the shape itself shows what he is doing.
//   idle    wobbles very gently, like a drop that breathes;
//   listen  leans towards her, fine ripples run over it with her voice;
//   think   kneads itself slowly into a soft, turning triangle;
//   wait    gets heavier at the bottom, a little drop forms and falls;
//   speak   squashes and stretches in the rhythm of the words;
//   happy   hops up, lands softly and splashes colourful droplets.
//
// Unlike every other signature it has no part beside the glass: it deforms the glass itself
// (OrbStage's `shape`: the outline, the squash and the hop). Pure maths (core.ts); the
// drawing is components/lb/signatures/TropfenSignature.tsx.

import {
  ORB_R,
  TAU,
  basePose,
  clamp,
  easeOut,
  firstOrder,
  lerp,
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

/**
 * When "happy" hands back to idle: the hop has landed at 1.05 s, the splash ends at 1.7 s,
 * the shower at 1.9 s and the last wobble at 2.2 s.
 */
export const TROPFEN_SETTLE = 2.3;

/** Points on the outline (the prototype's N). */
export const TROPFEN_POINTS = 96;
/** The splash's droplets on landing and the sparkles of the shower (the prototype's). */
export const TROPFEN_SPLASH = 9;
export const TROPFEN_SPARKLES = 12;

/** The drop has no state of its own: the shared simulation is all it needs. */
export type TropfenSim = OrbSim;

/** The glass's shape in this frame (what OrbStage's `shape` needs, stage.tsx GlassShape). */
export type TropfenPose = {
  orb: number;
  halo: number;
  /** The outline: its radius at each of TROPFEN_POINTS evenly spaced angles, × ORB_R. */
  k: number[];
  /** The squash (horizontal, vertical) and the hop (units, up is negative). */
  sx: number;
  sy: number;
  dy: number;
  /** The shadow narrows while Buddy is in the air. */
  shadowX: number;
  /** The little drop under Buddy: centre (y), radii, opacity; its highlight (x, y, r). */
  dropY: number;
  dropRx: number;
  dropRy: number;
  dropOp: number;
  hiX: number;
  hiY: number;
  hiR: number;
  /** The splash on landing: x, y, radius, opacity per droplet. */
  splash: number[];
  burstU: number;
  burstGate: number;
};

export function newTropfen(state: OrbState = 'idle'): TropfenSim {
  'worklet';
  return newOrbSim(state);
}

export function stepTropfen(prev: TropfenSim, dt: number, state: OrbState): TropfenSim {
  'worklet';
  return stepOrbSim(prev, dt, state, TROPFEN_SETTLE);
}

/** The prototype's stills: "happy" 1.1 s in, "wait" 2.2 s (a drop hanging), others 2.6 s. */
export function stillTropfen(state: OrbState): TropfenSim {
  'worklet';
  const secs = state === 'happy' ? 1.1 : state === 'wait' ? 2.2 : 2.6;
  return settleInto(newTropfen(state), stepTropfen, state, secs);
}

/** The outline's radius (× ORB_R) at each angle: waves of 2, 3, 4 and 6, a lean, a weight. */
export function tropfenOutline(sim: TropfenSim, voice: number): number[] {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const wIdle = w[0] ?? 0;
  const wListen = w[1] ?? 0;
  const wThink = w[2] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[5] ?? 0;
  const vo = clamp(voice);
  const sp = speech(t);
  const lean = wListen * (0.035 + vo * 0.04);
  const heavy = wWait * (0.045 + 0.01 * Math.sin((t * TAU) / 3.2));
  const A2 = 0.034 * wIdle + 0.02 * wThink + 0.012 * wWait + 0.015 * wSpeak + 0.015 * wListen;
  const A3 = 0.02 * wIdle + 0.06 * wThink + 0.01 * wSpeak;
  const A4 = 0.006 * wIdle + 0.016 * wSpeak * (0.4 + sp);
  const A6 = wListen * 0.014 * vo;
  let wob = 0;
  if (h < 2.2 && h > 0.8) {
    const u = h - 0.8;
    wob = wHappy * 0.07 * Math.exp(-u * 3) * Math.cos(u * 14);
  }
  const turn3 = t * (0.5 * wIdle + 2.2 * wThink + 0.5);
  const k: number[] = [];
  for (let j = 0; j < TROPFEN_POINTS; j++) {
    const th = (j / TROPFEN_POINTS) * TAU;
    k.push(
      1 +
        A2 * Math.cos(2 * (th - t * 0.3)) +
        A3 * Math.cos(3 * th - turn3) +
        A4 * Math.cos(4 * th + t * 5) +
        A6 * Math.cos(6 * th - t * 7) +
        lean * Math.cos(th + Math.PI / 4) +
        heavy * Math.cos(th - Math.PI / 2) +
        wob * Math.cos(2 * th),
    );
  }
  return k;
}

/** The outline as an SVG path (signature units), two decimals as the prototype writes it. */
export function tropfenPath(k: number[]): string {
  'worklet';
  let d = '';
  const n = k.length;
  for (let j = 0; j < n; j++) {
    const th = (j / n) * TAU;
    const r = ORB_R * (k[j] ?? 1);
    const x = Math.round(Math.cos(th) * r * 100) / 100;
    const y = Math.round(Math.sin(th) * r * 100) / 100;
    d += `${j ? 'L' : 'M'}${x} ${y}`;
  }
  return `${d}Z`;
}

export function tropfenPose(sim: TropfenSim, voice: number, splashes: number): TropfenPose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const R = ORB_R;
  const wIdle = w[0] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[5] ?? 0;
  const sp = speech(t);

  // Squash, stretch and the hop.
  const breath = Math.sin((t * TAU) / 4.2);
  let sx = 1 + wIdle * 0.015 * breath - wSpeak * sp * 0.045;
  let sy = 1 - wIdle * 0.015 * breath + wSpeak * sp * 0.065;
  let dy = 0;
  if (h < 2.2) {
    let hsx = 1;
    let hsy = 1;
    let hdy = 0;
    if (h < 0.25) {
      const u = Math.sin(((Math.PI * h) / 0.25) * 0.5);
      hsx = 1 + 0.1 * u;
      hsy = 1 - 0.1 * u;
      hdy = 5 * u;
    } else if (h < 0.8) {
      const u = (h - 0.25) / 0.55;
      hdy = -24 * Math.sin(Math.PI * u) + 5 * (1 - smooth(u * 4));
      hsx = 0.94 + 0.06 * u;
      hsy = 1.08 - 0.08 * u;
    } else if (h < 1.05) {
      const u = Math.sin((Math.PI * (h - 0.8)) / 0.25);
      hsx = 1 + 0.09 * u;
      hsy = 1 - 0.09 * u;
      hdy = 4 * u;
    }
    sx = lerp(sx, hsx, wHappy);
    sy = lerp(sy, hsy, wHappy);
    dy = lerp(0, hdy, wHappy);
  }

  // The drop: forms under Buddy, lets go, falls and fades.
  const du = (((t % 3.2) + 3.2) % 3.2) / 3.2;
  const grow = smooth(du / 0.6);
  const fall = Math.max(0, (du - 0.7) / 0.3);
  const dr = 2 + 4.2 * grow;
  const baseY = R * (1 + 0.045) + dr * 0.6;
  const dropY = baseY + (du < 0.7 ? dr * 0.3 * grow : 4 + fall * fall * 26);

  // The splash on landing.
  const su = (h - 0.8) / 0.9;
  const e = easeOut(su);
  const sr = 52 + e * 44;
  const sOp = wHappy * (su > 0 && su < 1 ? 1 - smooth((su - 0.5) / 0.5) : 0);
  const splash: number[] = [];
  const n = Math.max(0, Math.floor(splashes));
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1.08 + (0.84 * i) / Math.max(1, n - 1));
    splash.push(
      Math.cos(a) * sr * 1.25,
      52 + Math.sin(a) * sr * 0.75 + su * su * 40,
      2.6 + (i % 3),
      sOp,
    );
  }

  const base = basePose(sim, voice);
  return {
    orb: base.orb,
    halo: base.halo,
    k: tropfenOutline(sim, voice),
    sx,
    sy,
    dy,
    shadowX: 1 - Math.max(0, -dy) / 60,
    dropY,
    dropRx: dr * 0.92,
    dropRy: dr * (du < 0.7 ? 1.05 + 0.1 * grow : 1.1),
    dropOp: wWait * (du < 0.7 ? 1 : 1 - fall),
    hiX: -dr * 0.35,
    hiY: dropY - dr * 0.4,
    hiR: dr * 0.22,
    splash,
    burstU: (h - 0.7) / 1.2,
    burstGate: wHappy,
  };
}

/** Where the "happy" shower spreads: from a ring round the orb, a little above its centre. */
export const TROPFEN_BURST: BurstSpot = { cx: 0, cy: -30, reach: 50, r0: 50 };

export type TropfenDetail = {
  /** The soft, moving glass (off: the round glass of a speck-sized orb). */
  jelly: boolean;
  /** Droplets of the landing splash and sparkles of the shower. */
  splash: number;
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

export function tropfenDetail(size: number): TropfenDetail {
  const level = orbLevel(size);
  if (level === 'none') return { jelly: false, splash: 0, sparkles: 0, shadow: false, halo: false };
  if (level === 'avatar')
    return { jelly: true, splash: 5, sparkles: 6, shadow: false, halo: false };
  return {
    jelly: true,
    splash: TROPFEN_SPLASH,
    sparkles: TROPFEN_SPARKLES,
    shadow: true,
    halo: true,
  };
}

export const TROPFEN: SignatureMaths<TropfenSim, TropfenPose, TropfenDetail> = {
  settle: TROPFEN_SETTLE,
  start: (state) => {
    'worklet';
    return liveStart(newTropfen, stepTropfen, state);
  },
  still: stillTropfen,
  step: stepTropfen,
  pose: (sim, voice, detail) => {
    'worklet';
    return tropfenPose(sim, voice, detail.splash);
  },
  // Nothing passes behind the glass.
  order: () => {
    'worklet';
    return firstOrder([]);
  },
  nodes: () => {
    'worklet';
    return [];
  },
};
