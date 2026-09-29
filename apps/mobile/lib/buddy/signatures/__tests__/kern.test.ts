import { describe, expect, it } from 'vitest';

import { ORB_STATES, TAU } from '../core.js';
import {
  KERN_SETTLE,
  kernDetail,
  kernPose,
  newKern,
  stepKern,
  stillKern,
  turnKern,
  type KernSim,
} from '../kern.js';
import { protoVoice } from './proto.js';

// The prototype (round 1, variant 3 "Lichtkern", orb-varianten.html) is the reference. Read
// from its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's scale,
// the halo's opacity, points of the first arm (root left, tip left, mid left, a right-hand
// point; and the path's count of numbers), two numbers of the third arm, the blue and pink
// clouds (cx, cy), the arms' opacity, the core's light and dot radii, the flare (opacity,
// radius). Two decimals.
const PROTOTYPE: Record<
  string,
  {
    orb: number;
    halo: number;
    arm0: number[];
    arm2: number[];
    clouds: number[];
    core: number[];
    flare: number[];
  }
> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    arm0: [-5.68, 2.53, -22.38, 5.68, -29.56, -31.23, -21.03, 9.54, 108],
    arm2: [5.04, 3.65, 7.31, 32.98],
    clouds: [8.74, 13.4, -8.74, -13.4],
    core: [0.9, 22, 5],
    flare: [0, 20],
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    arm0: [-6.19, 0.61, -23.03, -1.69, -18.17, -38.97, -22.97, 2.4, 108],
    arm2: [3.62, 5.06, -3.5, 33.6],
    clouds: [6.01, 14.83, -6.01, -14.83],
    core: [0.9, 22, 5],
    flare: [0, 20],
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    arm0: [-4.72, 2.94, -12.74, 12.19, -31.64, 5.37, -10.06, 14.48, 108],
    arm2: [4.91, 2.62, 21.17, 14.01],
    clouds: [9.31, 13.01, -9.31, -13.01],
    core: [0.72, 31.39, 7.13],
    flare: [0, 20],
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    arm0: [-5.16, 1.94, -14.14, 9.66, -31.05, 1.46, -11.91, 12.31, 108],
    arm2: [4.26, 3.5, 18.41, 16.33],
    clouds: [7.65, 14.05, -7.65, -14.05],
    core: [0.7, 37.3, 8.48],
    flare: [0, 20],
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    arm0: [-5.5, -2.12, -9.77, -21.9, 42.42, -14.47, -13.11, -20.08, 108],
    arm2: [0.92, 5.82, -35.1, 2.26],
    clouds: [1.4, 15.94, -1.4, -15.94],
    core: [0.99, 18, 4.09],
    flare: [0, 20],
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    arm0: [2.51, -5.29, 23.08, -6.81, 6.31, 44.54, 21.74, -10.34, 108],
    arm2: [-5.84, 0.47, 3.47, -35.13],
    clouds: [-12.56, 9.91, 12.56, -9.91],
    core: [1, 17.63, 4.01],
    flare: [0, 20],
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    arm0: [-3.92, 3.01, -13.78, 7.72, -26.59, -10.13, -12.11, 10.15, 108],
    arm2: [4.56, 1.89, 12.4, 18.88],
    clouds: [9.42, 12.94, -9.42, -12.94],
    core: [0.58, 15, 3.41],
    flare: [0, 20],
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    arm0: [-4.27, 2.27, -14.24, 5.1, -23.61, -13.32, -13.03, 7.67, 108],
    arm2: [4.1, 2.56, 8.86, 19.65],
    clouds: [7.94, 13.89, -7.94, -13.89],
    core: [0.55, 16.9, 3.84],
    flare: [0, 20],
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    arm0: [-5.96, 1.79, -21.57, 3.5, -26.75, -30.44, -20.54, 7.46, 108],
    arm2: [4.53, 4.27, 5.04, 31.47],
    clouds: [7.69, 14.03, -7.69, -14.03],
    core: [0.85, 23.53, 5.35],
    flare: [0, 20],
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    arm0: [-6.05, -1.47, -19.7, -7.59, -7.75, -38.25, -20.8, -3.65, 108],
    arm2: [1.75, 5.97, -10.97, 28.7],
    clouds: [2.92, 15.73, -2.92, -15.73],
    core: [0.85, 22, 5],
    flare: [0, 20],
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    arm0: [-6.88, -0.56, -27.34, -9.3, -2.04, -54.54, -28.48, -4.78, 108],
    arm2: [2.95, 6.24, -18.07, 38.67],
    clouds: [4.87, 15.24, -4.87, -15.24],
    core: [1, 39.46, 8.97],
    flare: [0.65, 35.3],
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    arm0: [-2.94, -6.31, -4.48, -25.76, 42.23, -24.99, -9.03, -24.53, 108],
    arm2: [-4, 5.7, -38.38, 2.42],
    clouds: [-5.03, 15.19, 5.03, -15.19],
    core: [1, 26.63, 6.05],
    flare: [0.01, 20.29],
  },
};

const numbers = (d: string): number[] => (d.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
const FULL = kernDetail(200);

const run = (sim: KernSim, secs: number, state: 'idle'): KernSim => {
  let s = sim;
  for (let i = 0; i < Math.round(secs * 60); i++) s = stepKern(s, 1 / 60, state);
  return s;
};

describe('the whirl moves exactly like the prototype', () => {
  for (const s of ORB_STATES) {
    for (const n of [30, 62]) {
      it(`${s} after ${n} frames`, () => {
        const ref = PROTOTYPE[`${s}${n}`];
        if (!ref) throw new Error('no reference');
        // The prototype's jump() renders once more than it steps: one more turn of the whirl.
        let sim = turnKern(run(newKern('idle'), 1.5, 'idle'), 1 / 60);
        for (let i = 0; i < n; i++) sim = stepKern(sim, 0.016, s);
        const p = kernPose(sim, protoVoice(sim.t), FULL);
        expect(p.orb).toBeCloseTo(ref.orb, 4);
        expect(p.halo).toBeCloseTo(ref.halo, 2);
        const a0 = numbers(p.arms[0] ?? '');
        const mine0 = [a0[0], a0[1], a0[26], a0[27], a0[52], a0[53], a0[80], a0[81], a0.length];
        mine0.forEach((v, i) => expect(v, `arm0 ${i}`).toBeCloseTo(ref.arm0[i] ?? NaN, 1));
        const a2 = numbers(p.arms[2] ?? '');
        [a2[0], a2[1], a2[40], a2[41]].forEach((v, i) =>
          expect(v, `arm2 ${i}`).toBeCloseTo(ref.arm2[i] ?? NaN, 1),
        );
        [p.blueX, p.blueY, p.pinkX, p.pinkY].forEach((v, i) =>
          expect(v, `cloud ${i}`).toBeCloseTo(ref.clouds[i] ?? NaN, 1),
        );
        [p.armOp, p.glowR, p.dotR].forEach((v, i) =>
          expect(v, `core ${i}`).toBeCloseTo(ref.core[i] ?? NaN, 1),
        );
        expect(p.flareOp).toBeCloseTo(ref.flare[0] ?? NaN, 1);
        expect(p.flareR).toBeCloseTo(ref.flare[1] ?? NaN, 1);
      });
    }
  }
});

describe('whirl states', () => {
  it('turns fast while thinking and slowly while waiting', () => {
    const turn = (s: 'think' | 'wait'): number => {
      let sim = stillKern(s);
      const from = sim.phi;
      for (let i = 0; i < 60; i++) sim = stepKern(sim, 1 / 60, s);
      return sim.phi - from;
    };
    expect(turn('think')).toBeCloseTo(TAU / 1.9, 3);
    expect(turn('wait')).toBeCloseTo(TAU / 18, 3);
  });

  it('the core grows with her voice while listening', () => {
    const sim = stillKern('listen');
    expect(kernPose(sim, 1, FULL).dotR).toBeGreaterThan(kernPose(sim, 0, FULL).dotR + 3);
  });

  it('flares when happy, then rests as idle', () => {
    let sim = run(newKern('idle'), 1, 'idle');
    let flare = 0;
    for (let i = 0; i < 60 * 3; i++) {
      sim = stepKern(sim, 1 / 60, 'happy');
      flare = Math.max(flare, kernPose(sim, 0, FULL).flareOp);
    }
    // Its peak (0.35 s in) comes while "happy" is still blending in.
    expect(flare).toBeGreaterThan(0.6);
    expect(kernPose(sim, 0, FULL).flareOp).toBe(0);
    expect(sim.w[0]).toBeGreaterThan(0.95);
    expect(KERN_SETTLE).toBeGreaterThan(1.5);
  });

  it('a still pose is the same every time', () => {
    for (const s of ORB_STATES)
      expect(kernPose(stillKern(s), 0.3, FULL)).toEqual(kernPose(stillKern(s), 0.3, FULL));
  });

  it('draws no whirl on the tiniest orb, fewer sparkles on avatars', () => {
    expect(kernDetail(18).whirl).toBe(false);
    expect(kernPose(stillKern('idle'), 0, kernDetail(18)).arms).toEqual([]);
    expect(kernDetail(26).whirl).toBe(true);
    expect(kernDetail(26).sparkles).toBeLessThan(kernDetail(200).sparkles);
  });
});
