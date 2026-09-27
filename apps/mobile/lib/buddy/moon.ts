// Buddy's moon (owner decision 2026-09-27, variant 1 "Mond"): a small pearl moon on a tilted
// orbit that passes in front of and behind the glass orb. It is Buddy's attention made
// visible, and each of its six states is a clearly different movement:
//   idle    circles slowly and draws a faint trail of light;
//   listen  stops at the upper right and glows with her voice;
//   think   races round, the trail becomes a ring of light;
//   wait    hovers and bobs, a soft ping says "your turn";
//   speak   sways and pulses in the rhythm of Buddy's words;
//   happy   spirals up, flashes in a shower of sparkles and glides back.
// States blend (weights with a 0.2 s time constant), so a change never jumps.
//
// Pure maths, no React: the same functions run on the UI thread (they are worklets,
// components/lb/BuddyOrb.tsx drives them from a frame callback), in unit tests and — with
// the same numbers — in scripts/brand/render-icons.mjs. Units: the orb's radius is 54.
// docs/DESIGN-BRIEF.md §Buddy's moon.

export const MOON_STATES = ['idle', 'listen', 'think', 'wait', 'speak', 'happy'] as const;
export type MoonState = (typeof MOON_STATES)[number];

const TAU = Math.PI * 2;

/** The orb's radius in moon units; everything else is measured against it. */
export const ORB_R = 54;

/** Seconds from the start of "happy" until the moon is back in its orbit. */
export const HAPPY_SECONDS = 2.1;
/** After this long, a finished "happy" hands over to idle by itself. */
export const HAPPY_SETTLE = 2.4;

// One row per state (order of MOON_STATES), as in the approved prototype.
//              idle      listen  think       wait  speak happy
const P_R = [80, 76, 78, 76, 76, 82];
const P_K = [0.3, 0.3, 0.34, 0.3, 0.3, 0.3];
const P_SPEED = [TAU / 9, 0, TAU / 1.25, 0, 0, TAU / 3.2];
const P_PARK = [0, 1, 0, 1, 1, 0];
const P_LIFT = [0, 22, 0, 16, 20, 0];
const P_SIZE = [1, 1.25, 0.9, 1.05, 1.05, 1.05];
const P_GLOW = [0.55, 1, 0.7, 0.6, 0.75, 0.9];
const P_TRAIL = [0.5, 0, 1, 0, 0, 0.8];
/** The orbit is tilted by this much (degrees), seen from slightly above. */
const TILT = -18;
/** Where the moon parks (orbit angle): upper right, in front of the orb. */
const PARK_ANGLE = 0.3;

export type MoonSim = {
  /** Seconds since start. */
  t: number;
  /** Seconds since "happy" began (large when none is playing). */
  hT: number;
  /** The moon's angle on its orbit. */
  a: number;
  /** How much of each state is showing (order of MOON_STATES), summing to about 1. */
  w: number[];
  /** The state asked for. */
  target: number;
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

export function moonIndex(state: MoonState): number {
  'worklet';
  const i = MOON_STATES.indexOf(state);
  return i < 0 ? 0 : i;
}

const clamp = (x: number, a = 0, b = 1): number => {
  'worklet';
  return Math.min(b, Math.max(a, x));
};
const lerp = (a: number, b: number, t: number): number => {
  'worklet';
  return a + (b - a) * t;
};
const smooth = (x: number): number => {
  'worklet';
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const easeInOut = (x: number): number => {
  'worklet';
  const t = clamp(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Blend one parameter row with the current weights. */
function blend(w: number[], row: number[]): number {
  'worklet';
  let v = 0;
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    v += (w[i] ?? 0) * (row[i] ?? 0);
    sum += w[i] ?? 0;
  }
  return v / (sum || 1);
}

/** A point on the tilted orbit seen from slightly above: z > 0 is in front of the orb. */
export function orbitPt(
  a: number,
  R: number,
  k: number,
  tiltDeg: number = TILT,
): { x: number; y: number; z: number } {
  'worklet';
  const x = R * Math.cos(a);
  const y = R * k * Math.sin(a);
  const t = (tiltDeg * Math.PI) / 180;
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

export function newMoon(state: MoonState = 'idle'): MoonSim {
  'worklet';
  const target = moonIndex(state);
  const w = [0, 0, 0, 0, 0, 0];
  w[target] = 1;
  return { t: 0, hT: state === 'happy' ? 0 : 99, a: 0.9, w, target };
}

/** The state that is really showing: a finished "happy" goes back to idle. */
export function effectiveState(sim: MoonSim): number {
  'worklet';
  return sim.target === 5 && sim.hT > HAPPY_SETTLE ? 0 : sim.target;
}

/** One step of `dt` seconds towards `state` (a new "happy" starts its flight). */
export function stepMoon(prev: MoonSim, dt: number, state: MoonState): MoonSim {
  'worklet';
  const target = moonIndex(state);
  let hT = prev.hT + dt;
  if (target !== prev.target && target === 5) hT = 0;
  const next: MoonSim = { t: prev.t + dt, hT, a: prev.a, w: prev.w.slice(), target };
  const on = effectiveState(next);
  const k = 1 - Math.exp(-dt / 0.2);
  for (let i = 0; i < 6; i++)
    next.w[i] = (next.w[i] ?? 0) + ((i === on ? 1 : 0) - (next.w[i] ?? 0)) * k;
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
export function stillMoon(state: MoonState, secs: number): MoonSim {
  'worklet';
  let sim = newMoon(state);
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) sim = stepMoon(sim, 1 / 60, state);
  return sim;
}

/** How long a still pose simulates per state (the prototype's stills). */
export function stillSeconds(state: MoonState): number {
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
  const wIdle = w[0] ?? 0;
  const wListen = w[1] ?? 0;
  const wThink = w[2] ?? 0;
  const wWait = w[3] ?? 0;
  const wSpeak = w[4] ?? 0;
  const wHappy = w[5] ?? 0;
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

  const bounce = h < 2 ? 0.05 * Math.exp(-2.4 * h) * Math.sin(h * 10) : 0;
  const orb =
    1 +
    wIdle * 0.016 * Math.sin((t * TAU) / 4.2) +
    wListen * (0.012 + vo * 0.035) +
    wThink * 0.008 * Math.sin(t * 9) +
    wWait * 0.012 * Math.sin((t * TAU) / 3.2) +
    wSpeak * sp * 0.035 +
    wHappy * bounce;
  const halo =
    0.6 * wIdle +
    (0.75 + vo * 0.25) * wListen +
    0.5 * wThink +
    0.5 * wWait +
    (0.65 + sp * 0.3) * wSpeak +
    0.95 * wHappy;

  return {
    orb,
    halo,
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

/** One sparkle of the "happy" burst: direction, reach, size, spin. */
export type Sparkle = { a: number; d: number; s: number; spin: number };

const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A fixed, evenly spread shower of `n` sparkles (the same every time). */
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

/** Where a sparkle is at burst progress u (0…1): centre, scale, rotation, opacity. */
export function sparklePose(
  q: Sparkle,
  u: number,
): { x: number; y: number; scale: number; rot: number; op: number } {
  'worklet';
  const cx = 0;
  const cy = -84;
  const reach = 46;
  const r0 = 8;
  const e = 1 - Math.pow(1 - clamp(u), 3);
  const d = r0 + q.d * reach * e;
  const sc = q.s * (u < 0.18 ? u / 0.18 : 1 - ((u - 0.18) / 0.82) * 0.85);
  return {
    x: cx + Math.cos(q.a) * d,
    y: cy + Math.sin(q.a) * d + u * u * 10,
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

/** How much of the moon an orb of a given size draws (small avatars stay calm). */
export type MoonDetail = {
  moon: boolean;
  /** Trail dots. */
  ghosts: number;
  reflection: boolean;
  ping: boolean;
  /** Sparkles in the "happy" burst. */
  sparkles: number;
  /** The moon drawn larger than scale, so it still reads on a small orb. */
  boost: number;
  /** A soft shadow under the orb. */
  shadow: boolean;
};

/** Below this size (px) the orb has no moon: it would be a speck. */
export const MOON_MIN_SIZE = 22;
/** From this size (px) on, the full moon: trail, reflection, burst, shadow. */
export const MOON_FULL_SIZE = 56;

export function moonDetail(size: number): MoonDetail {
  if (size < MOON_MIN_SIZE)
    return {
      moon: false,
      ghosts: 0,
      reflection: false,
      ping: false,
      sparkles: 0,
      boost: 1,
      shadow: false,
    };
  if (size < MOON_FULL_SIZE)
    return {
      moon: true,
      ghosts: 4,
      reflection: false,
      ping: true,
      sparkles: 6,
      boost: 1.5,
      shadow: false,
    };
  return {
    moon: true,
    ghosts: 8,
    reflection: true,
    ping: true,
    sparkles: 12,
    boost: 1,
    shadow: true,
  };
}

/** Talk mode's states (components/voice/TalkOrb.tsx). */
export type TalkMode = 'idle' | 'listening' | 'thinking' | 'waiting' | 'speaking';

/** The moon for a talk-mode state. */
export function moonForTalk(mode: TalkMode): MoonState {
  switch (mode) {
    case 'listening':
      return 'listen';
    case 'thinking':
      return 'think';
    case 'waiting':
      return 'wait';
    case 'speaking':
      return 'speak';
    default:
      return 'idle';
  }
}

/**
 * Talk mode's state from the screen's phase: Buddy's natural voice still loading counts as
 * thinking; paused after a turn is her turn (waiting) — unless something went wrong, then
 * Buddy just rests.
 */
export function talkMode(input: {
  phase: 'listening' | 'thinking' | 'speaking' | 'paused';
  /** The microphone is recording (or starting). */
  hearing: boolean;
  transcribing: boolean;
  voiceLoading: boolean;
  /** A problem, a hint or a denied microphone is shown. */
  trouble: boolean;
}): TalkMode {
  const { phase } = input;
  if (phase === 'thinking' || input.transcribing || (phase === 'speaking' && input.voiceLoading))
    return 'thinking';
  if (phase === 'speaking') return 'speaking';
  if (input.hearing) return 'listening';
  if (phase === 'paused' && !input.trouble) return 'waiting';
  return 'idle';
}

/**
 * The moon beside one of Buddy's replies about a practice answer: a reply that just
 * arrived after a right answer celebrates (happy); otherwise it rests.
 */
export function moonForReply(input: { fresh: boolean; afterCorrect: boolean }): MoonState {
  return input.fresh && input.afterCorrect ? 'happy' : 'idle';
}
