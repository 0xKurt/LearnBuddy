// The prototype's colourful sparkle language (round 2, `makeSparkField`): small pastel
// sparkles round Buddy whose behaviour follows the state — they drift and twinkle (idle),
// stream towards him with her voice (listen), whirl round him as a colourful tail (think),
// blink quietly one after another (wait), leave him with every word (speak) and dance upwards
// (happy). Used by "sternchen"; phase 2's "mondfunken" and "nurfunken" use it with their own
// options. Pure maths (core.ts).

import {
  HAPPY,
  SPARK_COLS,
  TAU,
  clamp,
  easeOut,
  frac,
  lerp,
  orbitPt,
  protoRandom,
  smooth,
  speech,
} from './core.js';

/** One sparkle of the field: its shape and colour, and its fixed random numbers. */
export type FieldSpark = {
  /** 0 a dot, 1 a four-pointed sparkle, 2 a soft five-pointed star. */
  kind: number;
  color: string;
  a: number;
  rr: number;
  ph: number;
  s: number;
  dir: number;
};

/** The prototype's options (makeSparkField `opt`); the defaults are round 2's. */
export type FieldOptions = {
  /** Size factor. */
  size: number;
  /** Opacity boost. */
  boost: number;
  /** How many of them show while idle, and while waiting. */
  idle: number;
  wait: number;
  /** How sharply they blink while waiting (the power of the blink). */
  waitPow: number;
};

export const FIELD_DEFAULTS: FieldOptions = { size: 1, boost: 1, idle: 8, wait: 11, waitPow: 4 };

/** The field's `n` sparkles (the same every time for a seed). */
export function fieldSparks(n: number, seed: number): FieldSpark[] {
  const out: FieldSpark[] = [];
  for (let i = 0; i < n; i++)
    out.push({
      kind: i % 3,
      color: SPARK_COLS[i % SPARK_COLS.length] ?? '#ffffff',
      a: protoRandom(seed + i) * TAU,
      rr: protoRandom(seed + i * 3),
      ph: protoRandom(seed + i * 7),
      s: 2.8 + protoRandom(seed + i * 11) * 2.8,
      dir: protoRandom(seed + i * 5) > 0.5 ? 1 : -1,
    });
  return out;
}

/**
 * Where sparkle `i` of `n` is: x, y, z (< 0 behind the glass), rotation (degrees), scale,
 * opacity — pushed onto `out`. `w` the state weights, `t` the time, `h` the time since
 * "happy" began, `vo` her voice.
 */
export function placeSpark(
  out: number[],
  p: FieldSpark,
  i: number,
  n: number,
  w: number[],
  t: number,
  h: number,
  vo: number,
  opt: FieldOptions,
): void {
  'worklet';
  let X = 0;
  let Y = 0;
  let Z = 0;
  let OP = 0;
  let S = 0;
  let sum = 0;
  const add = (q: number, x: number, y: number, z: number, op: number, s: number): void => {
    if (q < 0.001) return;
    X += q * x;
    Y += q * y;
    Z += q * z;
    OP += q * op;
    S += q * s;
    sum += q;
  };
  {
    const a = p.a + t * 0.09 * p.dir;
    const r = 74 + p.rr * 22;
    add(
      w[0] ?? 0,
      Math.cos(a) * r,
      Math.sin(a) * r * 0.8 + Math.sin(t * 0.7 + p.ph * 6) * 4,
      1,
      (i < opt.idle ? 1 : 0) * (0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3 + p.ph * 9))),
      p.s * 0.9,
    );
  }
  {
    const u = frac(t * 0.42 * (0.75 + 0.5 * p.rr) + p.ph);
    const r = lerp(102, 58, u * u);
    const a = p.a + u * 0.7 * p.dir;
    add(
      w[1] ?? 0,
      Math.cos(a) * r,
      Math.sin(a) * r,
      1,
      Math.sin(Math.PI * u) * (0.3 + 0.7 * vo),
      p.s * (1.1 - 0.45 * u),
    );
  }
  {
    const q = orbitPt((t * TAU) / 1.7 - i * (TAU / n) * 0.6, 78 + (p.rr - 0.5) * 10, 0.34, -18);
    add(w[2] ?? 0, q.x, q.y, q.z, 1 - (i / n) * 0.75, p.s * (1.15 - (i / n) * 0.6));
  }
  {
    const r = 70 + p.rr * 26;
    const tw = Math.pow(Math.max(0, Math.sin(t * 1.05 + p.ph * TAU)), opt.waitPow);
    add(
      w[3] ?? 0,
      Math.cos(p.a) * r,
      Math.sin(p.a) * r * 0.85,
      1,
      (i < opt.wait ? 1 : 0) * tw * 0.95,
      p.s * (0.7 + 0.5 * tw),
    );
  }
  {
    const u = frac(t * 0.7 + p.ph);
    const r = 58 + easeOut(u) * 46;
    const beat = speech(t - u * 1.4);
    add(
      w[4] ?? 0,
      Math.cos(p.a) * r,
      Math.sin(p.a) * r * 0.9,
      1,
      Math.sin(Math.PI * u) * (0.2 + 0.9 * beat),
      p.s * (0.8 + 0.6 * beat),
    );
  }
  {
    const u = frac(t * 0.5 + p.ph);
    const a = p.a + u * 2.4 * p.dir;
    const r = 62 + u * 34;
    add(
      w[HAPPY] ?? 0,
      Math.cos(a) * r,
      Math.sin(a) * r * 0.85 - u * 18,
      1,
      Math.sin(Math.PI * u) * smooth((h - 0.6) / 0.6),
      p.s * 1.1,
    );
  }
  if (sum < 0.001) {
    out.push(0, 0, 1, 0, 0, 0);
    return;
  }
  X /= sum;
  Y /= sum;
  Z /= sum;
  S /= sum;
  out.push(
    X,
    Y,
    Z,
    t * 25 * p.dir + p.a * 57,
    S * opt.size,
    clamp(OP * opt.boost) * (Z < 0 ? 0.6 : 1),
  );
}
