import { describe, expect, it } from 'vitest';

import {
  burstPose,
  placeNodes,
  sparkles,
  type NodeOrder,
  type OrbSim,
  type OrbState,
} from '../core.js';
import {
  NURFUNKEN,
  NURFUNKEN_BURST,
  NURFUNKEN_CONFETTI,
  newNurfunken,
  nurfunkenDetail,
  stepNurfunken,
  type NurfunkenPose,
} from '../nurfunken.js';
import { protoVoice } from './proto.js';

type Ref = {
  orb: number;
  halo: number;
  f0: number[];
  f5: number[];
  f13: number[];
  f21: number[];
  burst: number[];
  order: string;
};

// The prototype is the reference: round 3 A2 "Nur die bunten Sternchen"
// (orb-varianten-3.html). Read from its SVG after jump('idle', 1.5), setState(state) and n
// steps of 16 ms: the orb's scale, the halo's opacity, field sparkles 0, 5, 13 and 21
// (translate, rotation, scale, opacity, side: 1 in front), the confetti's opacity and its
// fourth piece (translate, rotation, scale, opacity) and which sparkles lie on top
// (front|back, bottom to top). Two decimals.
const REF: Record<string, Ref> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    f0: [88.87, -22.69, 378.22, 8.7, 0.43, 1],
    f5: [36.43, 59.39, 24.17, 5.26, 0.47, 1],
    f13: [3.61, -74.34, 310.29, 6.15, 0, 1],
    f21: [92.52, 9.06, -30.13, 7.38, 0, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    f0: [90.21, -18.39, 391.02, 8.7, 0.47, 1],
    f5: [39.81, 56.58, 11.37, 5.26, 0.67, 1],
    f13: [7.66, -74.09, 323.09, 6.15, 0, 1],
    f21: [93.12, 6.76, -42.93, 7.38, 0, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    f0: [66.21, 5.55, 378.22, 6.81, 0.15, 1],
    f5: [33.56, 92.8, 24.17, 6.13, 0.16, 1],
    f13: [13.69, -91.4, 310.29, 6.21, 0.46, 1],
    f21: [82.47, -8.87, -30.13, 6.62, 0.4, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    f0: [93.03, -37.89, 391.02, 9.83, 0.46, 1],
    f5: [45.07, 87.35, 11.37, 5.68, 0.65, 1],
    f13: [25.92, -79.23, 323.09, 5.52, 0.74, 1],
    f21: [61.18, -19.38, -42.93, 5.6, 0.18, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    f0: [51.1, 6.93, 378.22, 10.9, 1, 1],
    f5: [70.09, -11.88, 24.17, 5.86, 1, 1],
    f13: [18.62, -36.67, 310.29, 5.5, 0.43, -1],
    f21: [-55.26, 6.95, -30.13, 4.97, 0.22, -1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6|f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21',
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    f0: [-73.38, 30.12, 391.02, 11.1, 1, 1],
    f5: [-27.49, 33.39, 11.37, 5.92, 1, 1],
    f13: [62.75, -2.75, 323.09, 5.44, 0.77, 1],
    f21: [55.95, -36.02, -42.93, 4.75, 0.24, -1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17|f18, f19, f20, f21',
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    f0: [82.29, -37.86, 378.22, 11.34, 1, 1],
    f5: [23.34, 65.01, 24.17, 4.2, 0.04, 1],
    f13: [-10.44, -73.06, 310.29, 4.9, 0, 1],
    f21: [88.41, 24.87, -30.13, 5.89, 0, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    f0: [81.7, -39.23, 391.02, 10.35, 0.99, 1],
    f5: [22.16, 65.51, 11.37, 4.1, 0, 1],
    f13: [-11.7, -72.94, 323.09, 4.79, 0, 1],
    f21: [88.03, 26.31, -42.93, 6.94, 0, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    f0: [78.04, -37.79, 378.22, 9.2, 0.49, 1],
    f5: [28.89, 86, 24.17, 6.69, 0.86, 1],
    f13: [-12.6, -91.03, 310.29, 6.49, 0.14, 1],
    f21: [64.85, 18.78, -30.13, 8.14, 0.12, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    f0: [88.92, -45.22, 391.02, 9.38, 0.56, 1],
    f5: [17.39, 54.3, 11.37, 4.68, 0.04, 1],
    f13: [-11.68, -77.04, 323.09, 5.47, 0.21, 1],
    f21: [89.57, 28.34, -42.93, 8.03, 0.63, 1],
    burst: [0],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    f0: [0.31, 54.56, 378.22, 10.46, 0.04, 1],
    f5: [56.34, 32.82, 24.17, 6.32, 0.04, 1],
    f13: [65.26, -42.58, 310.29, 7.39, 0, 1],
    f21: [32.29, -72.2, -30.13, 8.87, 0, 1],
    burst: [0.91, 65.09, 47.55, 43.43, 3.43, 1],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    f0: [67.22, -10.05, 391.02, 10.62, 0.5, 1],
    f5: [79.98, -8.97, 11.37, 6.42, 1, 1],
    f13: [86.77, -2.89, 323.09, 7.5, 0.65, 1],
    f21: [-26.6, -91.67, -42.93, 9.01, 0.25, 1],
    burst: [0.99, 75.04, 58.03, 101.94, 2, 0.82],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
  happy80: {
    orb: 1.00051,
    halo: 0.95,
    f0: [70.71, 8.02, 398.22, 10.63, 1, 1],
    f5: [80.16, -36.4, 4.17, 6.43, 1, 1],
    f13: [81.73, 21.32, 330.29, 7.51, 0.35, 1],
    f21: [63.15, 8.87, -50.13, 9.02, 0.28, 1],
    burst: [1, 76.33, 62, 134.86, 1.19, 0.23],
    order:
      'f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21|',
  },
};
const FULL = nurfunkenDetail(200);
const CONFETTI = sparkles(NURFUNKEN_CONFETTI, 9);

/** The prototype's jump('idle', 1.5) (nothing of this variant moves in its extra render). */
function afterJump(): { sim: OrbSim; order: NodeOrder } {
  let sim = newNurfunken('idle');
  for (let i = 0; i < 90; i++) sim = stepNurfunken(sim, 1 / 60, 'idle');
  const order = placeNodes(NURFUNKEN.order(FULL), NURFUNKEN.nodes(NURFUNKEN.pose(sim, 0.5, FULL)));
  return { sim, order };
}

function stackOf(order: NodeOrder): string {
  const side = (front: boolean) =>
    order.seq
      .map((q, k) => ({ q, k }))
      .filter(({ k }) => order.front[k] === front)
      .sort((a, b) => a.q - b.q)
      .map(({ k }) => `f${k}`)
      .join(', ');
  return `${side(true)}|${side(false)}`;
}

const angle = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

function check(p: NurfunkenPose, ref: Ref): void {
  expect(p.orb).toBeCloseTo(ref.orb, 4);
  expect(p.halo).toBeCloseTo(ref.halo, 2);
  const part = (k: number, want: number[], name: string) => {
    const o = k * 6;
    const list = p.field;
    expect(list[o], `${name} x`).toBeCloseTo(want[0] ?? NaN, 1);
    expect(list[o + 1], `${name} y`).toBeCloseTo(want[1] ?? NaN, 1);
    expect(angle((list[o + 3] ?? 0) - (want[2] ?? 0)), `${name} rot`).toBeCloseTo(0, 0);
    expect(list[o + 4], `${name} scale`).toBeCloseTo(want[3] ?? NaN, 1);
    expect(list[o + 5], `${name} opacity`).toBeCloseTo(want[4] ?? NaN, 1);
    expect((list[o + 2] ?? 0) >= 0 ? 1 : -1, `${name} side`).toBe(want[5]);
  };
  part(0, ref.f0, 'field 0');
  part(5, ref.f5, 'field 5');
  part(13, ref.f13, 'field 13');
  part(21, ref.f21, 'field 21');
  const on = p.burstU > 0 && p.burstU < 1 && p.burstGate > 0.02;
  expect(on ? p.burstGate : 0, 'confetti').toBeCloseTo(ref.burst[0] ?? NaN, 1);
  const q = CONFETTI[3];
  if (on && q) {
    const s = burstPose(q, p.burstU, NURFUNKEN_BURST);
    [s.x, s.y].forEach((v, i) =>
      expect(v, `confetti ${i}`).toBeCloseTo(ref.burst[i + 1] ?? NaN, 1),
    );
    expect(angle(s.rot - (ref.burst[3] ?? 0)), 'confetti rot').toBeCloseTo(0, 0);
    expect(s.scale, 'confetti scale').toBeCloseTo(ref.burst[4] ?? NaN, 1);
    expect(s.op, 'confetti opacity').toBeCloseTo(ref.burst[5] ?? NaN, 1);
  }
}

describe('"nurfunken" moves exactly like the prototype', () => {
  for (const [key, ref] of Object.entries(REF)) {
    it(key, () => {
      const state = key.replace(/\d+$/, '') as OrbState;
      const n = Number(key.slice(state.length));
      let { sim, order } = afterJump();
      for (let i = 0; i < n; i++) {
        sim = stepNurfunken(sim, 0.016, state);
        order = placeNodes(order, NURFUNKEN.nodes(NURFUNKEN.pose(sim, protoVoice(sim.t), FULL)));
      }
      check(NURFUNKEN.pose(sim, protoVoice(sim.t), FULL), ref);
      expect(stackOf(order)).toBe(ref.order);
    });
  }
});

describe('only the sparkles', () => {
  it('celebrates with confetti first, then the sparkles dance, then back to idle', () => {
    let sim = NURFUNKEN.start('idle');
    sim = stepNurfunken(sim, 1 / 60, 'happy');
    let confetti = 0;
    for (let i = 0; i < 60 * 3.5; i++) {
      sim = stepNurfunken(sim, 1 / 60, 'happy');
      const p = NURFUNKEN.pose(sim, 0.5, FULL);
      if (p.burstU > 0 && p.burstU < 1) confetti = sim.hT;
    }
    expect(confetti).toBeGreaterThan(1.4);
    expect(confetti).toBeLessThan(NURFUNKEN.settle);
    expect(sim.w[0]).toBeGreaterThan(0.9);
  });

  it('its still "happy" is the confetti in mid-flight, as the prototype', () => {
    const p = NURFUNKEN.pose(NURFUNKEN.still('happy'), 0.5, FULL);
    expect(p.burstU).toBeGreaterThan(0.3);
    expect(p.burstU).toBeLessThan(0.7);
    for (const s of ['idle', 'listen', 'think', 'wait', 'speak', 'happy'] as const)
      expect(NURFUNKEN.pose(NURFUNKEN.still(s), 0.3, FULL)).toEqual(
        NURFUNKEN.pose(NURFUNKEN.still(s), 0.3, FULL),
      );
  });

  it('draws nothing on the tiniest orb and fewer sparkles on avatars', () => {
    expect(nurfunkenDetail(18).sparks).toBe(0);
    const avatar = nurfunkenDetail(26);
    expect(avatar.sparks).toBeLessThan(FULL.sparks);
    expect(avatar.confetti).toBeLessThan(FULL.confetti);
    expect(avatar.shadow || avatar.halo).toBe(false);
    expect(NURFUNKEN.pose(NURFUNKEN.still('wait'), 0.5, avatar).field).toHaveLength(12 * 6);
  });
});
