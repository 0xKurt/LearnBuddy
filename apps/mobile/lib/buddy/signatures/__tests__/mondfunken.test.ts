import { describe, expect, it } from 'vitest';

import { TAU, placeNodes, type NodeOrder, type OrbState } from '../core.js';
import { MOND, newMoon, stepMoon, type MoonSim } from '../mond.js';
import { MONDFUNKEN, mondfunkenDetail, type MondfunkenPose } from '../mondfunken.js';
import { protoVoice } from './proto.js';

type Ref = {
  orb: number;
  halo: number;
  moon: number[];
  glow: number[];
  refl: number[];
  ping: number[];
  g0: number[];
  g5: number[];
  f0: number[];
  f5: number[];
  burst: number;
  order: string;
};

// The prototype is the reference: round 2 variant B "Mond mit Funken" (orb-varianten-2.html).
// Read from its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's
// scale, the halo's opacity, the moon (translate, scale, side: 1 in front), its light
// (opacity, scale), its reflection (cx, cy, opacity), the ping (r, opacity), trail sparkles
// 0 and 5 and field sparkles 0 and 5 (translate, rotation, scale, opacity, side), the
// shower's opacity and which parts lie on top (front|back, bottom to top). Two decimals.
const REF: Record<string, Ref> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    moon: [-44.79, 33.47, 1.09, 1],
    glow: [0.55, 1.02],
    refl: [-36.05, 26.94, 0.59],
    ping: [11.6, 0],
    g0: [-43.63, 33.44, 118.8, 4.81, 0.19, 1],
    g5: [-31.34, 30.64, 303.8, 3.47, 0.11, 1],
    f0: [92.2, -14.27, 384.65, 4.88, 0.3, 1],
    f5: [65.16, -28.33, 289.02, 2.87, 0.3, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, ping, moon, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11|',
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    moon: [-63.63, 32.56, 1.06, 1],
    glow: [0.55, 1.02],
    refl: [-40.06, 20.5, 0.35],
    ping: [16.15, 0],
    g0: [-60.5, 34.7, 149.52, 4.66, 0.19, 1],
    g5: [-55.77, 33.94, 334.52, 3.38, 0.11, 1],
    f0: [93.07, -9.96, 397.45, 4.88, 0.36, 1],
    f5: [63.36, -32.08, 276.22, 2.87, 0.34, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, ping, moon, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11|',
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    moon: [-59.56, -16.41, 1.15, -1],
    glow: [1, 1.21],
    refl: [-43.38, -11.95, 0.15],
    ping: [11.6, 0],
    g0: [-60.25, -16.32, 118.8, 4.05, 0, -1],
    g5: [-57.72, -18.07, 303.8, 2.9, 0, -1],
    f0: [63.19, 13.33, 384.65, 3.76, 0.08, 1],
    f5: [42.37, -53.61, 289.02, 2.32, 0.16, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|moon, ping, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    moon: [68.39, -49.93, 1.33, -1],
    glow: [1, 1.3],
    refl: [36.35, -26.53, 0.05],
    ping: [16.15, 0],
    g0: [70.25, -48.02, 149.52, 4.27, 0, -1],
    g5: [67.86, -49.53, 334.52, 3.06, 0, -1],
    f0: [96.76, -25.24, 397.45, 5.44, 0.37, 1],
    f5: [94.92, -36.6, 276.22, 3.45, 0.06, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|moon, ping, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    moon: [-69.87, 10.08, 0.86, -1],
    glow: [0.69, 1.07],
    refl: [-44.54, 6.43, 0.08],
    ping: [11.6, 0],
    g0: [-74.39, 16.41, 118.8, 4.25, 0.85, -1],
    g5: [-50.06, 32.86, 303.8, 3.39, 0.49, 1],
    f0: [51.5, 7.71, 384.65, 6.11, 0.94, 1],
    f5: [67.85, -26.11, 289.02, 3.05, 0.43, -1],
    burst: 0,
    order:
      'f0, f1, f2, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, f3, f4|f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, moon, ping, g0, g1',
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    moon: [71.87, -27.89, 0.88, -1],
    glow: [0.7, 1.08],
    refl: [41.95, -16.28, 0.06],
    ping: [16.15, 0],
    g0: [67.95, -29.73, 149.52, 4.21, 0.88, -1],
    g5: [2.31, -28.08, 334.52, 2.78, 0.52, -1],
    f0: [-73.52, 30.25, 397.45, 6.22, 1, 1],
    f5: [-4.32, 27.02, 276.22, 3.06, 0.76, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12|f13, f14, f15, moon, ping, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    moon: [-59.56, -13.36, 0.96, -1],
    glow: [0.6, 1.04],
    refl: [-43.91, -9.85, 0.12],
    ping: [11.6, 0.65],
    g0: [-60.25, -10.86, 118.8, 4.05, 0, -1],
    g5: [-57.72, -12.62, 303.8, 2.9, 0, -1],
    f0: [87.25, -29.92, 384.65, 6.3, 0.87, 1],
    f5: [67.03, -21.19, 289.02, 2.29, 0.03, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|moon, ping, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    moon: [68.39, -46.94, 1.02, -1],
    glow: [0.6, 1.04],
    refl: [37.1, -25.46, 0.04],
    ping: [16.15, 0.49],
    g0: [70.25, -42.06, 149.52, 4.27, 0, -1],
    g5: [67.86, -43.57, 334.52, 3.06, 0, -1],
    f0: [86.8, -31.33, 397.45, 4.91, 0.39, 1],
    f5: [67.19, -20.56, 276.22, 2.23, 0, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|moon, ping, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    moon: [-57.88, -14.59, 1, -1],
    glow: [0.79, 1.12],
    refl: [-43.64, -11, 0.15],
    ping: [11.6, 0],
    g0: [-60.25, -14.5, 118.8, 4.05, 0, -1],
    g5: [-57.72, -16.25, 303.8, 2.9, 0, -1],
    f0: [83.34, -30.1, 384.65, 5, 0.33, 1],
    f5: [92.52, -30.51, 289.02, 3.54, 0.63, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|moon, ping, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    moon: [70.92, -47.94, 1.02, -1],
    glow: [0.75, 1.1],
    refl: [37.28, -25.2, 0.04],
    ping: [16.15, 0],
    g0: [70.25, -46.03, 149.52, 4.27, 0, -1],
    g5: [67.86, -47.54, 334.52, 3.06, 0, -1],
    f0: [94.26, -36.03, 397.45, 5.07, 0.34, 1],
    f5: [97.66, -31.59, 276.22, 3.81, 0.09, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|moon, ping, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    moon: [-21.89, -38.34, 1.3, 1],
    glow: [1, 1.32],
    refl: [-22.31, -39.08, 0.87],
    ping: [11.6, 0],
    g0: [-63.56, 33.76, 118.8, 4.67, 0.06, 1],
    g5: [-38.72, 32.13, 303.8, 3.45, 0.04, 1],
    f0: [-12.47, 53.6, 384.65, 5.86, 0.03, 1],
    f5: [47.49, -46.09, 289.02, 3.45, 0.03, 1],
    burst: 0,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, ping, moon, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11|',
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    moon: [-0.5, -83.34, 1.54, 1],
    glow: [1, 1.32],
    refl: [-0.27, -45, 0.24],
    ping: [16.15, 0],
    g0: [-71.88, 14.82, 149.52, 4.17, 0, -1],
    g5: [-78.7, 25, 334.52, 3.14, 0, -1],
    f0: [68.32, -1.43, 397.45, 5.95, 0.39, 1],
    f5: [8.79, -73.87, 276.22, 3.5, 0.72, 1],
    burst: 0.99,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, ping, moon, g6, g7, g8, g9, g10, g11|g0, g1, g2, g3, g4, g5',
  },
  happy80: {
    orb: 1.00051,
    halo: 0.95,
    moon: [-0.08, -83.86, 1.22, 1],
    glow: [1, 1.32],
    refl: [-0.04, -45, 0.23],
    ping: [18.71, 0],
    g0: [-46.43, -4.33, 166.8, 3.95, 0, -1],
    g5: [-70.71, 9.48, 351.8, 2.94, 0, -1],
    f0: [67.95, 17.05, 404.65, 5.96, 0.85, 1],
    f5: [-19.33, -79.26, 269.02, 3.5, 0.94, 1],
    burst: 1,
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, ping, moon|g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11',
  },
};
const FULL = mondfunkenDetail(200);

/**
 * The prototype's jump('idle', 1.5): its last two renders place the parts, the second one
 * after one more idle step of the moon (jump renders once more than it steps).
 */
function afterJump(): { sim: MoonSim; order: NodeOrder } {
  let sim = newMoon('idle');
  for (let i = 0; i < 90; i++) sim = stepMoon(sim, 1 / 60, 'idle');
  const pose = (s: MoonSim) => MONDFUNKEN.pose(s, 0.5, FULL);
  let order = placeNodes(MONDFUNKEN.order(FULL), MONDFUNKEN.nodes(pose(sim)));
  sim = { ...sim, a: sim.a + (1 / 60) * (TAU / 9) };
  order = placeNodes(order, MONDFUNKEN.nodes(pose(sim)));
  return { sim, order };
}

/** Node names as the prototype's: the moon, the ping, the trail g0…, the field f0…. */
function stackOf(order: NodeOrder): string {
  const name = (k: number) =>
    k === 0
      ? 'moon'
      : k === 1
        ? 'ping'
        : k < 2 + FULL.ghosts
          ? `g${k - 2}`
          : `f${k - 2 - FULL.ghosts}`;
  const side = (front: boolean) =>
    order.seq
      .map((q, k) => ({ q, k }))
      .filter(({ k }) => order.front[k] === front)
      .sort((a, b) => a.q - b.q)
      .map(({ k }) => name(k))
      .join(', ');
  return `${side(true)}|${side(false)}`;
}

const angle = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

function check(p: MondfunkenPose, ref: Ref): void {
  expect(p.orb).toBeCloseTo(ref.orb, 4);
  expect(p.halo).toBeCloseTo(ref.halo, 2);
  const moon = [p.x, p.y, p.scale, p.z >= 0 ? 1 : -1];
  moon.forEach((v, i) => expect(v, `moon ${i}`).toBeCloseTo(ref.moon[i] ?? NaN, 1));
  // The renderer draws the light as the prototype: opacity clamp(glow), scale 0.8 + 0.4 × glow.
  expect(Math.min(1, Math.max(0, p.glow)), 'glow').toBeCloseTo(ref.glow[0] ?? NaN, 1);
  expect(0.8 + Math.min(1.3, Math.max(0, p.glow)) * 0.4, 'glow scale').toBeCloseTo(
    ref.glow[1] ?? NaN,
    1,
  );
  [p.reflX, p.reflY, p.reflOp].forEach((v, i) =>
    expect(v, `refl ${i}`).toBeCloseTo(ref.refl[i] ?? NaN, 1),
  );
  expect(p.pingR, 'ping r').toBeCloseTo(ref.ping[0] ?? NaN, 1);
  expect(p.pingOp, 'ping opacity').toBeCloseTo(ref.ping[1] ?? NaN, 1);
  const part = (list: number[], k: number, want: number[], name: string) => {
    const o = k * 6;
    expect(list[o], `${name} x`).toBeCloseTo(want[0] ?? NaN, 1);
    expect(list[o + 1], `${name} y`).toBeCloseTo(want[1] ?? NaN, 1);
    // The prototype writes rotations unwrapped; they are compared as angles.
    expect(angle((list[o + 3] ?? 0) - (want[2] ?? 0)), `${name} rot`).toBeCloseTo(0, 0);
    expect(list[o + 4], `${name} scale`).toBeCloseTo(want[3] ?? NaN, 1);
    expect(list[o + 5], `${name} opacity`).toBeCloseTo(want[4] ?? NaN, 1);
    expect((list[o + 2] ?? 0) >= 0 ? 1 : -1, `${name} side`).toBe(want[5]);
  };
  part(p.ghosts, 0, ref.g0, 'trail 0');
  part(p.ghosts, 5, ref.g5, 'trail 5');
  part(p.field, 0, ref.f0, 'field 0');
  part(p.field, 5, ref.f5, 'field 5');
  const on = p.burstU > 0 && p.burstU < 1 && p.burstGate > 0.02;
  expect(on ? p.burstGate : 0, 'shower').toBeCloseTo(ref.burst, 1);
}

describe('"mondfunken" moves exactly like the prototype', () => {
  for (const [key, ref] of Object.entries(REF)) {
    it(key, () => {
      const state = key.replace(/\d+$/, '') as OrbState;
      const n = Number(key.slice(state.length));
      let { sim, order } = afterJump();
      for (let i = 0; i < n; i++) {
        sim = MONDFUNKEN.step(sim, 0.016, state);
        order = placeNodes(order, MONDFUNKEN.nodes(MONDFUNKEN.pose(sim, protoVoice(sim.t), FULL)));
      }
      check(MONDFUNKEN.pose(sim, protoVoice(sim.t), FULL), ref);
      expect(stackOf(order)).toBe(ref.order);
    });
  }
});

describe('moon with sparkles', () => {
  it('is the moon of "mond", unchanged, with a colourful trail and a field', () => {
    const sim = MOND.still('think');
    const moon = MOND.pose(sim, 0.4, { ...FULL, moon: true });
    const sparkly = MONDFUNKEN.pose(sim, 0.4, FULL);
    for (const k of ['orb', 'halo', 'x', 'y', 'z', 'scale', 'glow', 'reflOp', 'pingR'] as const)
      expect(sparkly[k]).toBe(moon[k]);
    expect(sparkly.ghosts).toHaveLength(12 * 6);
    expect(sparkly.field).toHaveLength(16 * 6);
    expect(MONDFUNKEN.settle).toBe(MOND.settle);
  });

  it('a still pose is the same every time', () => {
    for (const s of ['idle', 'listen', 'think', 'wait', 'speak', 'happy'] as const)
      expect(MONDFUNKEN.pose(MONDFUNKEN.still(s), 0.3, FULL)).toEqual(
        MONDFUNKEN.pose(MONDFUNKEN.still(s), 0.3, FULL),
      );
  });

  it('draws nothing on the tiniest orb and fewer sparkles on avatars', () => {
    expect(mondfunkenDetail(18).moon).toBe(false);
    const avatar = mondfunkenDetail(26);
    expect(avatar.ghosts).toBeLessThan(FULL.ghosts);
    expect(avatar.sparks).toBeLessThan(FULL.sparks);
    expect(avatar.sparkles).toBeLessThan(FULL.sparkles);
    expect(avatar.reflection).toBe(false);
    const pose = MONDFUNKEN.pose(MONDFUNKEN.still('think'), 0.5, avatar);
    expect(pose.ghosts).toHaveLength(6 * 6);
    expect(pose.field).toHaveLength(8 * 6);
    expect(MONDFUNKEN.nodes(pose)).toHaveLength(2 + 6 + 8);
  });
});
