import { describe, expect, it } from 'vitest';

import { TAU, placeNodes, type NodeOrder, type OrbState } from '../core.js';
import {
  NURSTERN,
  STERNCHEN,
  STERNCHEN_SETTLE,
  newSternchen,
  nursternDetail,
  sternchenDetail,
  stepSternchen,
  stillSternchen,
  type SternchenPose,
  type SternchenSim,
} from '../sternchen.js';
import { protoVoice } from './proto.js';

type Ref = {
  orb: number;
  halo: number;
  star: number[];
  glow: number[];
  refl: number[];
  g0?: number[];
  f0?: number[];
  f5?: number[];
  rings: number[];
  order?: string;
};

// The prototypes are the reference: round 2 variant A "Sternchen" (orb-varianten-2.html) and
// round 3 A1 "Nur der große Stern" (orb-varianten-3.html). Read from their SVG after
// jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's scale, the halo's
// opacity, the star (translate, side: 1 in front, its rotation and scale), its light
// (opacity, scale), its reflection (cx, cy, opacity), the first tail sparkle and field
// sparkles 0 and 5 (translate, rotation, scale, opacity, side), the first ring of light
// (r, width, opacity) and which parts lie on top (front|back, bottom to top). Two decimals.
const STERNCHEN_REF: Record<string, Ref> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    star: [-35.75, 32.67, 1, 39.6, 1.1],
    glow: [0.6, 1.02],
    refl: [-33.22, 30.36, 0.55],
    g0: [-34.56, 32.52, 118.8, 4.01, 0.29, 1],
    f0: [88.87, -22.69, 378.22, 4.83, 0.3, 1],
    f5: [36.43, 59.39, 24.17, 2.92, 0.33, 1],
    rings: [],
    order:
      'star, f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13|',
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    star: [-55.28, 33.54, 1, 49.84, 1.07],
    glow: [0.6, 1],
    refl: [-38.47, 23.34, 0.4],
    g0: [-51.72, 35.7, 149.52, 3.92, 0.29, 1],
    f0: [90.21, -18.39, 391.02, 4.83, 0.34, 1],
    f5: [39.81, 56.58, 11.37, 2.92, 0.48, 1],
    rings: [],
    order:
      'star, f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13|',
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    star: [-63.91, -14.67, -1, 3.59, 1.21],
    glow: [1, 1.27],
    refl: [-43.86, -10.07, 0.1],
    g0: [-64.66, 7.24, 118.8, 3.39, 0, -1],
    f0: [66.21, 5.55, 378.22, 3.78, 0.11, 1],
    f5: [33.56, 92.8, 24.17, 3.41, 0.11, 1],
    rings: [],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|star, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13',
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    star: [67.44, -52.46, -1, 0.35, 1.37],
    glow: [1, 1.53],
    refl: [35.52, -27.63, 0.03],
    g0: [69.49, -26.53, 149.52, 3.52, 0, -1],
    f0: [93.03, -37.89, 391.02, 5.46, 0.33, 1],
    f5: [45.07, 87.35, 11.37, 3.16, 0.47, 1],
    rings: [],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|star, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13',
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    star: [-79.99, 8.55, 1, 255.65, 0.99],
    glow: [0.78, 0.98],
    refl: [-44.75, 4.78, 0.19],
    g0: [-78.43, 3.6, 118.8, 3.83, 0.9, 1],
    f0: [51.1, 6.93, 378.22, 6.05, 0.94, 1],
    f5: [68.11, -19.24, 24.17, 3.11, 0.44, -1],
    rings: [],
    order:
      'star, f0, f1, f2, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13, f3, f4|f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15',
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    star: [-33.63, 38.7, -1, 346.78, 0.85],
    glow: [0.8, 0.84],
    refl: [-29.51, 33.97, 0.14],
    g0: [-38.81, 45.76, 149.52, 3.3, 0.93, -1],
    f0: [-73.38, 30.12, 391.02, 6.17, 1, 1],
    f5: [-4.71, 28.9, 11.37, 3.12, 0.76, 1],
    rings: [],
    order:
      'f0, f1, f2, g8, g9, g10, g11, g12, g13, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12|f13, f14, f15, star, g0, g1, g2, g3, g4, g5, g6, g7',
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    star: [-63.91, -12.85, -1, -10.92, 1.02],
    glow: [0.69, 0.97],
    refl: [-44.12, -8.87, 0.1],
    g0: [-64.66, 7.24, 118.8, 3.39, 0, -1],
    f0: [82.29, -37.86, 378.22, 6.3, 0.89, 1],
    f5: [23.34, 65.01, 24.17, 2.33, 0.03, 1],
    rings: [],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|star, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13',
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    star: [67.44, -49, -1, -3.75, 1.06],
    glow: [0.7, 1.02],
    refl: [36.41, -26.45, 0.04],
    g0: [69.49, -26.53, 149.52, 3.52, 0, -1],
    f0: [81.7, -39.23, 391.02, 5.25, 0.53, 1],
    f5: [22.16, 65.51, 11.37, 2.28, 0, 1],
    rings: [],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|star, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13',
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    star: [-63.91, -13.33, -1, 12.55, 1.04],
    glow: [0.83, 1.04],
    refl: [-44.05, -9.19, 0.1],
    g0: [-64.66, 7.24, 118.8, 3.39, 0, -1],
    f0: [78.04, -37.79, 378.22, 5.11, 0.35, 1],
    f5: [28.89, 86, 24.17, 3.71, 0.61, 1],
    rings: [],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|star, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13',
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    star: [67.44, -49.82, -1, -7.07, 1.06],
    glow: [0.8, 1.05],
    refl: [36.19, -26.74, 0.03],
    g0: [69.49, -26.53, 149.52, 3.52, 0, -1],
    f0: [88.92, -45.22, 391.02, 5.21, 0.4, 1],
    f5: [17.39, 54.3, 11.37, 2.6, 0.03, 1],
    rings: [],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15|star, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13',
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    star: [17.49, -69.72, 1, 178.17, 1.26],
    glow: [1, 1.48],
    refl: [10.95, -43.65, 0.3],
    g0: [-59.27, 34.26, 118.8, 3.9, 0.27, 1],
    f0: [0.31, 54.56, 378.22, 5.81, 0.03, 1],
    f5: [56.34, 32.82, 24.17, 3.51, 0.03, 1],
    rings: [],
    order:
      'star, f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13|',
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    star: [-3.33, -83.29, 1, 394.37, 1.14],
    glow: [1, 1.33],
    refl: [-1.8, -44.96, 0.15],
    g0: [-72.36, 15.84, 149.52, 3.46, 0.23, -1],
    f0: [67.22, -10.05, 391.02, 5.9, 0.36, 1],
    f5: [79.98, -8.97, 11.37, 3.57, 0.72, 1],
    rings: [],
    order:
      'star, f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, g5, g6, g7, g8, g9, g10, g11, g12, g13|g0, g1, g2, g3, g4',
  },
};
const NURSTERN_REF: Record<string, Ref> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    star: [-35.75, 32.67, 1, 39.6, 1.1],
    glow: [0.59, 1.02],
    refl: [-33.22, 30.36, 0.55],
    rings: [54, -285.69, 0],
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    star: [-55.28, 33.54, 1, 49.84, 1.07],
    glow: [0.5, 0.97],
    refl: [-38.47, 23.34, 0.4],
    rings: [54, -287.17, 0],
  },
  idle80: {
    orb: 0.98639,
    halo: 0.6,
    star: [-63.88, 32.51, 1, 55.6, 1.06],
    glow: [0.51, 0.95],
    refl: [-40.11, 20.41, 0.31],
    rings: [54, -288, 0],
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    star: [-63.91, -14.67, -1, 3.59, 1.21],
    glow: [1, 1.27],
    refl: [-43.86, -10.07, 0.1],
    rings: [54, -285.69, 0],
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    star: [67.44, -52.46, -1, 0.35, 1.37],
    glow: [1, 1.45],
    refl: [35.52, -27.63, 0.03],
    rings: [54, -287.17, 0],
  },
  listen80: {
    orb: 1.03413,
    halo: 0.91,
    star: [72.62, -45.5, 1, 0.09, 1.5],
    glow: [1, 1.63],
    refl: [38.13, -23.89, 0.11],
    rings: [54, -288, 0],
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    star: [-79.99, 8.55, 1, 255.65, 0.99],
    glow: [0.77, 0.98],
    refl: [-44.75, 4.78, 0.19],
    rings: [54, -285.69, 0],
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    star: [-33.63, 38.7, -1, 346.78, 0.85],
    glow: [0.67, 0.81],
    refl: [-29.51, 33.97, 0.14],
    rings: [54, -287.17, 0],
  },
  think80: {
    orb: 0.9990800000000001,
    halo: 0.5,
    star: [14.33, -18.9, -1, 29.24, 0.84],
    glow: [0.69, 0.8],
    refl: [27.19, -35.86, 0.14],
    rings: [54, -288, 0],
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    star: [-63.91, -12.85, -1, -10.92, 1.02],
    glow: [0.68, 0.97],
    refl: [-44.12, -8.87, 0.1],
    rings: [54, -285.69, 0],
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    star: [67.44, -49, -1, -3.75, 1.06],
    glow: [0.59, 0.98],
    refl: [36.41, -26.45, 0.04],
    rings: [54, -287.17, 0],
  },
  wait80: {
    orb: 0.99118,
    halo: 0.5,
    star: [72.62, -40.66, 1, 6.82, 1.11],
    glow: [0.6, 1.03],
    refl: [39.26, -21.99, 0.15],
    rings: [54, -288, 0],
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    star: [-63.91, -13.33, -1, 12.55, 1.04],
    glow: [0.82, 1.04],
    refl: [-44.05, -9.19, 0.1],
    rings: [54, -285.69, 0],
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    star: [67.44, -49.82, -1, -7.07, 1.06],
    glow: [0.67, 1.01],
    refl: [36.19, -26.74, 0.03],
    rings: [54, -287.17, 0],
  },
  speak80: {
    orb: 1.00845,
    halo: 0.72,
    star: [72.62, -44.58, 1, 9.53, 1.16],
    glow: [0.77, 1.14],
    refl: [38.35, -23.54, 0.12],
    rings: [54, -288, 0],
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    star: [17.49, -69.72, 1, 178.17, 1.26],
    glow: [1, 1.48],
    refl: [10.95, -43.65, 0.3],
    rings: [12, 4.65, 0],
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    star: [-3.33, -83.29, 1, 394.37, 1.14],
    glow: [1, 1.28],
    refl: [-1.8, -44.96, 0.15],
    rings: [12, 3.17, 0],
  },
  happy80: {
    orb: 1.00051,
    halo: 0.95,
    star: [-0.07, -83.88, 1, 32.48, 1.81],
    glow: [1, 1.67],
    refl: [-0.04, -45, 0.14],
    rings: [36.67, 2.34, 0.67],
  },
};

const FULL = sternchenDetail(200);

/**
 * The prototype's jump('idle', 1.5): its last two renders place the parts, the second one
 * after one more idle step of the star (jump renders once more than it steps).
 */
function afterJump(): { sim: SternchenSim; order: NodeOrder } {
  let sim = newSternchen('idle');
  for (let i = 0; i < 90; i++) sim = stepSternchen(sim, 1 / 60, 'idle');
  let order = placeNodes(STERNCHEN.order(FULL), STERNCHEN.nodes(STERNCHEN.pose(sim, 0.5, FULL)));
  sim = { ...sim, a: sim.a + (1 / 60) * (TAU / 10) };
  order = placeNodes(order, STERNCHEN.nodes(STERNCHEN.pose(sim, 0.5, FULL)));
  return { sim, order };
}

/** Node names as the prototype's: the star, the tail g0…, the field f0…. */
function stackOf(order: NodeOrder): string {
  const name = (k: number) =>
    k === 0 ? 'star' : k <= FULL.ghosts ? `g${k - 1}` : `f${k - 1 - FULL.ghosts}`;
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

function check(p: SternchenPose, ref: Ref): void {
  expect(p.orb).toBeCloseTo(ref.orb, 4);
  expect(p.halo).toBeCloseTo(ref.halo, 2);
  const star = [p.x, p.y, p.z >= 0 ? 1 : -1, p.rot, p.scale];
  star.forEach((v, i) => expect(v, `star ${i}`).toBeCloseTo(ref.star[i] ?? NaN, 1));
  expect(p.glowOp, 'glow').toBeCloseTo(ref.glow[0] ?? NaN, 1);
  expect(p.glowScale, 'glow scale').toBeCloseTo(ref.glow[1] ?? NaN, 1);
  [p.reflX, p.reflY, p.reflOp].forEach((v, i) =>
    expect(v, `refl ${i}`).toBeCloseTo(ref.refl[i] ?? NaN, 1),
  );
  const part = (list: number[], k: number, want: number[] | undefined, name: string) => {
    if (!want || want.length === 0) return;
    const o = k * 6;
    expect(list[o], `${name} x`).toBeCloseTo(want[0] ?? NaN, 1);
    expect(list[o + 1], `${name} y`).toBeCloseTo(want[1] ?? NaN, 1);
    // The prototype writes rotations unwrapped; they are compared as angles.
    expect(angle((list[o + 3] ?? 0) - (want[2] ?? 0)), `${name} rot`).toBeCloseTo(0, 0);
    expect(list[o + 4], `${name} scale`).toBeCloseTo(want[3] ?? NaN, 1);
    expect(list[o + 5], `${name} opacity`).toBeCloseTo(want[4] ?? NaN, 1);
    expect((list[o + 2] ?? 0) >= 0 ? 1 : -1, `${name} side`).toBe(want[5]);
  };
  part(p.ghosts, 0, ref.g0, 'tail 0');
  part(p.field, 0, ref.f0, 'field 0');
  part(p.field, 5, ref.f5, 'field 5');
  if (ref.rings.length > 0) {
    expect(p.rings[0], 'ring r').toBeCloseTo(ref.rings[0] ?? NaN, 1);
    expect(p.rings[1], 'ring width').toBeCloseTo(ref.rings[1] ?? NaN, 1);
    expect(p.rings[2], 'ring opacity').toBeCloseTo(ref.rings[2] ?? NaN, 1);
  }
}

describe('"sternchen" moves exactly like the prototype', () => {
  for (const [key, ref] of Object.entries(STERNCHEN_REF)) {
    it(key, () => {
      const state = key.replace(/\d+$/, '') as OrbState;
      const n = Number(key.slice(state.length));
      let { sim, order } = afterJump();
      for (let i = 0; i < n; i++) {
        sim = stepSternchen(sim, 0.016, state);
        const pose = STERNCHEN.pose(sim, protoVoice(sim.t), FULL);
        order = placeNodes(order, STERNCHEN.nodes(pose));
      }
      check(STERNCHEN.pose(sim, protoVoice(sim.t), FULL), ref);
      expect(stackOf(order)).toBe(ref.order);
    });
  }
});

describe('"nurstern" moves exactly like the prototype', () => {
  for (const [key, ref] of Object.entries(NURSTERN_REF)) {
    it(key, () => {
      const state = key.replace(/\d+$/, '') as OrbState;
      const n = Number(key.slice(state.length));
      let { sim } = afterJump();
      for (let i = 0; i < n; i++) sim = stepSternchen(sim, 0.016, state);
      check(NURSTERN.pose(sim, protoVoice(sim.t), nursternDetail(200)), ref);
    });
  }
});

describe('star states', () => {
  it('flies a lap of honour when happy, starting where it was, and comes home as idle', () => {
    let sim = newSternchen('idle');
    for (let i = 0; i < 60; i++) sim = stepSternchen(sim, 1 / 60, 'idle');
    const before = STERNCHEN.pose(sim, 0.5, FULL);
    sim = stepSternchen(sim, 1 / 60, 'happy');
    expect(sim.h0).toBeCloseTo(Math.atan2(before.y, before.x), 1);
    let top = Infinity;
    for (let i = 0; i < 60 * 4; i++) {
      sim = stepSternchen(sim, 1 / 60, 'happy');
      top = Math.min(top, STERNCHEN.pose(sim, 0.5, FULL).y);
    }
    expect(top).toBeLessThan(-80);
    expect(sim.w[0]).toBeGreaterThan(0.95);
    expect(STERNCHEN_SETTLE).toBeGreaterThan(2.3);
  });

  it('"nurstern" is the star alone: no tail, no sparkles, no confetti, but rings of light', () => {
    const detail = nursternDetail(200);
    expect(detail.ghosts + detail.sparks + detail.confetti).toBe(0);
    const top = NURSTERN.pose(stillSternchen('happy', 1.3), 0.5, detail);
    expect(top.ghosts).toEqual([]);
    expect(top.field).toEqual([]);
    expect(top.burstGate).toBe(0);
    expect(Math.max(top.rings[2] ?? 0, top.rings[5] ?? 0, top.rings[8] ?? 0)).toBeGreaterThan(0.3);
    const sparkly = STERNCHEN.pose(stillSternchen('happy', 1.05), 0.5, FULL);
    expect(sparkly.rings).toEqual([]);
    expect(sparkly.field).toHaveLength(16 * 6);
  });

  it('a still pose is the same every time', () => {
    for (const s of ['idle', 'listen', 'think', 'wait', 'speak', 'happy'] as const)
      expect(STERNCHEN.pose(STERNCHEN.still(s), 0.3, FULL)).toEqual(
        STERNCHEN.pose(STERNCHEN.still(s), 0.3, FULL),
      );
  });

  it('draws no star on the tiniest orb and fewer sparkles on avatars', () => {
    expect(sternchenDetail(18).star).toBe(false);
    const avatar = sternchenDetail(26);
    expect(avatar.ghosts).toBeLessThan(FULL.ghosts);
    expect(avatar.sparks).toBeLessThan(FULL.sparks);
    expect(avatar.reflection).toBe(false);
    expect(STERNCHEN.pose(STERNCHEN.still('think'), 0.5, avatar).ghosts).toHaveLength(7 * 6);
  });
});
