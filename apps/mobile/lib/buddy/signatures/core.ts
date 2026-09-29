// What every signature of Buddy shares (docs/DESIGN-BRIEF.md §Buddy's signature): the six
// states and how they blend, the glass orb's own breathing and halo, the stacking order of
// parts that pass in front of and behind the glass, the sparkle shower, the size levels.
// A signature (mond.ts, ring.ts, …) adds only its own movement on top.
//
// The reference for all of it is the prototype's shared `Orb` class (orb-varianten*.html):
// the same numbers, so a ported variant moves exactly like the one that was approved.
// Pure maths, no React: the functions run on the UI thread (worklets), in unit tests and in
// scripts. Units: the orb's radius is 54.

export const ORB_STATES = ['idle', 'listen', 'think', 'wait', 'speak', 'happy'] as const;
export type OrbState = (typeof ORB_STATES)[number];

export const TAU = Math.PI * 2;

/** The orb's radius in signature units; everything else is measured against it. */
export const ORB_R = 54;

/** Index of "happy" in ORB_STATES. */
export const HAPPY = 5;

export function stateIndex(state: OrbState): number {
  'worklet';
  const i = ORB_STATES.indexOf(state);
  return i < 0 ? 0 : i;
}

export const clamp = (x: number, a = 0, b = 1): number => {
  'worklet';
  return Math.min(b, Math.max(a, x));
};
export const lerp = (a: number, b: number, t: number): number => {
  'worklet';
  return a + (b - a) * t;
};
export const smooth = (x: number): number => {
  'worklet';
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
export const easeOut = (x: number): number => {
  'worklet';
  return 1 - Math.pow(1 - clamp(x), 3);
};
export const easeInOut = (x: number): number => {
  'worklet';
  const t = clamp(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** The fractional part (always 0…1, also for negative x). */
export const frac = (x: number): number => {
  'worklet';
  return x - Math.floor(x);
};

/** Blend one parameter row (one value per state, order of ORB_STATES) with the weights. */
export function blend(w: number[], row: number[]): number {
  'worklet';
  let v = 0;
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    v += (w[i] ?? 0) * (row[i] ?? 0);
    sum += w[i] ?? 0;
  }
  return v / (sum || 1);
}

/** The prototype's usual orbit tilt (degrees): seen from slightly above. */
const TILT = -18;

/** A point on a tilted circular orbit seen from slightly above: z > 0 is in front of the orb. */
// The tilt default lives in the body: the worklets Babel plugin captures outer constants
// referenced in a worklet's body, but not ones in parameter defaults — `= TILT` there
// crashed release builds on the UI thread ("Property 'TILT' doesn't exist").
export function orbitPt(
  a: number,
  R: number,
  k: number,
  tiltDeg?: number,
): { x: number; y: number; z: number } {
  'worklet';
  const x = R * Math.cos(a);
  const y = R * k * Math.sin(a);
  const t = ((tiltDeg ?? TILT) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: x * c - y * s, y: x * s + y * c, z: Math.sin(a) };
}

/** The rhythm of Buddy's own speech (0…1): phrases of uneven syllables with short rests. */
export function speech(t: number): number {
  'worklet';
  const ph = ((t % 2.6) + 2.6) % 2.6;
  const gate = smooth(ph / 0.15) * smooth((2.1 - ph) / 0.25);
  const syl =
    Math.pow(Math.abs(Math.sin(t * TAU * 2.3)), 1.6) *
    (0.55 + 0.45 * Math.sin(t * TAU * 0.9 + 1.3));
  return gate * (0.2 + 0.8 * syl);
}

/** What every signature's simulation carries: time, the "happy" clock, the state blend. */
export type OrbSim = {
  /** Seconds since start. */
  t: number;
  /** Seconds since "happy" began (large when none is playing). */
  hT: number;
  /** How much of each state is showing (order of ORB_STATES), summing to about 1. */
  w: number[];
  /** The state asked for. */
  target: number;
};

export function newOrbSim(state: OrbState): OrbSim {
  'worklet';
  const target = stateIndex(state);
  const w = [0, 0, 0, 0, 0, 0];
  w[target] = 1;
  return { t: 0, hT: state === 'happy' ? 0 : 99, w, target };
}

/** The state that is really showing: a "happy" that finished `settle` seconds ago is idle. */
export function shownState(sim: OrbSim, settle: number): number {
  'worklet';
  return sim.target === HAPPY && sim.hT > settle ? 0 : sim.target;
}

/**
 * One step of `dt` seconds towards `state`: time, the "happy" clock (a new "happy" starts in
 * this very step, as the prototype: hT = 0, then + dt) and the weights (0.2 s time constant).
 */
export function stepOrbSim(prev: OrbSim, dt: number, state: OrbState, settle: number): OrbSim {
  'worklet';
  const target = stateIndex(state);
  let hT = prev.hT + dt;
  if (target !== prev.target && target === HAPPY) hT = dt;
  const next: OrbSim = { t: prev.t + dt, hT, w: prev.w.slice(), target };
  const on = shownState(next, settle);
  const k = 1 - Math.exp(-dt / 0.2);
  for (let i = 0; i < 6; i++)
    next.w[i] = (next.w[i] ?? 0) + ((i === on ? 1 : 0) - (next.w[i] ?? 0)) * k;
  return next;
}

/** The glass orb itself in this frame: its breathing/pulse scale and its halo's strength. */
export type BasePose = { orb: number; halo: number };

/** The prototype's Orb.render: the same for every signature. `voice` is her voice (0…1). */
export function basePose(sim: OrbSim, voice: number): BasePose {
  'worklet';
  const w = sim.w;
  const t = sim.t;
  const h = sim.hT;
  const vo = clamp(voice);
  const sp = speech(t);
  const bounce = h < 2 ? 0.05 * Math.exp(-2.4 * h) * Math.sin(h * 10) : 0;
  const orb =
    1 +
    (w[0] ?? 0) * 0.016 * Math.sin((t * TAU) / 4.2) +
    (w[1] ?? 0) * (0.012 + vo * 0.035) +
    (w[2] ?? 0) * 0.008 * Math.sin(t * 9) +
    (w[3] ?? 0) * 0.012 * Math.sin((t * TAU) / 3.2) +
    (w[4] ?? 0) * sp * 0.035 +
    (w[5] ?? 0) * bounce;
  const halo =
    0.6 * (w[0] ?? 0) +
    (0.75 + vo * 0.25) * (w[1] ?? 0) +
    0.5 * (w[2] ?? 0) +
    0.5 * (w[3] ?? 0) +
    (0.65 + sp * 0.3) * (w[4] ?? 0) +
    0.95 * (w[5] ?? 0);
  return { orb, halo };
}

/**
 * Which part lies on top of which. The prototype keeps a signature's parts as SVG nodes in
 * two groups (behind and in front of the glass) and moves a node to the end of the other
 * group when it crosses sides, so the part that crossed last is drawn on top. `seq` is a
 * stacking number per node (higher is on top).
 */
export type NodeOrder = { front: boolean[]; seq: number[]; next: number };

/** A first order: `front` says where each node starts, in the prototype's creation order. */
export function firstOrder(front: boolean[]): NodeOrder {
  'worklet';
  const seq: number[] = [];
  for (let i = 0; i < front.length; i++) seq.push(i);
  return { front: front.slice(), seq, next: front.length };
}

/**
 * The order after this frame: `zs` has each node's depth (≥ 0 in front), in the order the
 * prototype places them; each node that changed sides goes on top of its side.
 */
export function placeNodes(order: NodeOrder, zs: number[]): NodeOrder {
  'worklet';
  const front = order.front.slice();
  const seq = order.seq.slice();
  let next = order.next;
  for (let k = 0; k < front.length; k++) {
    const here = (zs[k] ?? 0) >= 0;
    if (front[k] !== here) {
      front[k] = here;
      seq[k] = next;
      next += 1;
    }
  }
  return { front, seq, next };
}

/** One sparkle of a shower: direction, reach, size, spin. */
export type Sparkle = { a: number; d: number; s: number; spin: number };

const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** The prototype's fixed pseudo-random numbers (0…1). */
export const protoRandom = rnd;

/** A fixed, evenly spread shower of `n` sparkles (the prototype's makeBurst). */
export function sparkles(n: number, seed = 3): Sparkle[] {
  const out: Sparkle[] = [];
  for (let i = 0; i < n; i++)
    out.push({
      a: (i / n) * TAU + (rnd(seed + i) - 0.5) * 0.55,
      d: 0.55 + 0.5 * rnd(seed + i * 7),
      s: 3 + 3.6 * rnd(seed + i * 13),
      spin: rnd(seed + i * 3) > 0.5 ? 1 : -1,
    });
  return out;
}

/** Where a shower spreads: its centre, how far it reaches, where it starts. */
export type BurstSpot = { cx: number; cy: number; reach: number; r0: number };

/** Where a sparkle is at burst progress u (0…1): centre, scale, rotation, opacity. */
export function burstPose(
  q: Sparkle,
  u: number,
  spot: BurstSpot,
): { x: number; y: number; scale: number; rot: number; op: number } {
  'worklet';
  const e = easeOut(u);
  const d = spot.r0 + q.d * spot.reach * e;
  const sc = q.s * (u < 0.18 ? u / 0.18 : 1 - ((u - 0.18) / 0.82) * 0.85);
  return {
    x: spot.cx + Math.cos(q.a) * d,
    y: spot.cy + Math.sin(q.a) * d + u * u * 10,
    scale: Math.max(0, sc),
    rot: u * 160 * q.spin,
    op: u > 0 && u < 1 ? 1 - smooth((u - 0.5) / 0.5) : 0,
  };
}

/** A four-pointed sparkle with concave sides, radius r (SVG path). */
export function starPath(r: number, inner: number): string {
  const k = r * inner;
  return `M0 ${-r}Q${k} ${-k} ${r} 0Q${k} ${k} 0 ${r}Q${-k} ${k} ${-r} 0Q${-k} ${-k} 0 ${-r}Z`;
}

/** The prototype writes path numbers with two decimals. */
const f2 = (n: number): number => Math.round(n * 100) / 100;

/** A soft five-pointed star with rounded tips, outer radius R (SVG path, the prototype's). */
export function star5Path(R: number, inner: number, round: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * inner : R;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const at = (p: [number, number], q: [number, number], k: number): [number, number] => [
    p[0] + (q[0] - p[0]) * k,
    p[1] + (q[1] - p[1]) * k,
  ];
  let d = '';
  for (let i = 0; i < 10; i++) {
    const v = pts[i] ?? [0, 0];
    const prev = pts[(i + 9) % 10] ?? v;
    const next = pts[(i + 1) % 10] ?? v;
    const k = i % 2 ? round * 0.6 : round;
    const a = at(v, prev, k);
    const b = at(v, next, k);
    d += `${i ? 'L' : 'M'}${f2(a[0])} ${f2(a[1])}Q${f2(v[0])} ${f2(v[1])} ${f2(b[0])} ${f2(b[1])}`;
  }
  return `${d}Z`;
}

/** The prototype's pastel sparkle colours (round 2 on). */
export const SPARK_COLS = [
  '#b89cff',
  '#ff9fcf',
  '#8fb3ff',
  '#ffc98a',
  '#86d9bb',
  '#ffffff',
  '#d7a6ff',
  '#ff8fb8',
] as const;

/** The prototype's burst colours (makeBurst, every variant). */
export const BURST_COLS = ['#ffffff', '#d4c2ff', '#ffc2e0', '#ffffff', '#c3d2ff'] as const;

/**
 * How much of a signature an orb of a given size draws: none (a speck), an avatar's
 * (the same signature at the same scale, fewer small parts, no reflection, shadow or halo)
 * or the prototype's full one.
 */
export type OrbLevel = 'none' | 'avatar' | 'full';

/** Below this size (px) the orb has no signature: it would be a speck. */
export const SIGNATURE_MIN_SIZE = 22;
/** From this size (px) on, the full signature exactly as the prototype draws it. */
export const SIGNATURE_FULL_SIZE = 56;

export function orbLevel(size: number): OrbLevel {
  if (size < SIGNATURE_MIN_SIZE) return 'none';
  return size < SIGNATURE_FULL_SIZE ? 'avatar' : 'full';
}

/**
 * Settle into a state without animating (reduce motion, a still avatar, the app icon):
 * `secs` of simulated time with the state fully on.
 */
export function settleInto<S extends OrbSim>(
  first: S,
  step: (prev: S, dt: number, state: OrbState) => S,
  state: OrbState,
  secs: number,
): S {
  'worklet';
  let sim = first;
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) sim = step(sim, 1 / 60, state);
  return sim;
}

/** A live orb's first frame: 1.5 s into its state (a "happy" flies from idle, so idle). */
export function liveStart<S extends OrbSim>(
  create: (state: OrbState) => S,
  step: (prev: S, dt: number, state: OrbState) => S,
  state: OrbState,
): S {
  'worklet';
  const s: OrbState = state === 'happy' ? 'idle' : state;
  return settleInto(create(s), step, s, 1.5);
}

/**
 * A signature's maths as the renderer drives it (components/lb/signatures/useSignature.ts).
 * S is its simulation, P its pose per frame, D what an orb of a given size draws of it.
 */
export type SignatureMaths<S extends OrbSim, P extends BasePose, D> = {
  /** Seconds after which a finished "happy" hands over to idle by itself. */
  settle: number;
  /** A live orb's first frame (a "happy" flies from the orbit, so it starts idle). */
  start: (state: OrbState) => S;
  /** The still pose of a state (reduce motion, an older avatar): the prototype's stills. */
  still: (state: OrbState) => S;
  step: (prev: S, dt: number, state: OrbState) => S;
  /** Where everything is. `voice` is her voice (0…1) while listening. */
  pose: (sim: S, voice: number, detail: D) => P;
  /** The stacking order's first state (no parts that change sides: an empty order). */
  order: (detail: D) => NodeOrder;
  /** Each stacked part's depth (≥ 0 in front), in the order of `order`. */
  nodes: (pose: P) => number[];
};
