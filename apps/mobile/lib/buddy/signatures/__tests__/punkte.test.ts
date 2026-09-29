import { describe, expect, it } from 'vitest';

import { ORB_STATES, firstOrder, placeNodes, type NodeOrder } from '../core.js';
import {
  PUNKTE,
  PUNKTE_SETTLE,
  flyPunkte,
  newPunkte,
  punkteDetail,
  punktePose,
  punktePoseOf,
  stepPunkte,
  stillPunkte,
  type PunkteSim,
} from '../punkte.js';
import { protoVoice } from './proto.js';

// The prototype (round 1, variant 4 "Drei Punkte", orb-varianten.html) is the reference. Read
// from its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's scale,
// the halo's opacity, per dot its translate, scale, glow opacity and side (1 in front of the
// glass, −1 behind), and the dots' stacking (front group | back group, bottom first). Two
// decimals.
const PROTOTYPE: Record<string, { orb: number; halo: number; dots: number[][]; order: string }> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    dots: [
      [-41.19, 29.61, 1.11, 0.45, 1],
      [-38.49, -11.85, 0.87, 0.45, -1],
      [79.68, -17.76, 1.01, 0.45, 1],
    ],
    order: '0,2|1',
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    dots: [
      [-60.65, 29.17, 1.08, 0.45, 1],
      [-14.45, -19.89, 0.86, 0.45, -1],
      [75.1, -9.28, 1.06, 0.45, 1],
    ],
    order: '0,2|1',
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    dots: [
      [-28, -50.24, 1.18, 0.49, 1],
      [-6.54, -61.07, 1.21, 0.57, 1],
      [34.54, -58.2, 1.22, 0.55, 1],
    ],
    order: '0,2,1|',
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    dots: [
      [-25.89, -65.08, 1.36, 0.66, 1],
      [-0.19, -70.35, 1.32, 0.63, 1],
      [26.07, -65.56, 1.33, 0.63, 1],
    ],
    order: '0,2,1|',
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    dots: [
      [-37.75, 28.25, 1.11, 0.45, 1],
      [-10.21, 17.87, 1.09, 0.45, 1],
      [37.77, 8.87, 1.11, 0.45, 1],
    ],
    order: '0,2,1|',
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    dots: [
      [-23.43, -16.08, 0.87, 0.45, -1],
      [-51.71, -4.44, 0.9, 0.45, -1],
      [-67.79, 8.91, 0.95, 0.45, -1],
    ],
    order: '|0,1,2',
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    dots: [
      [-20.14, 69.26, 1.12, 0.55, 1],
      [-6.54, 61.59, 1.26, 0.81, 1],
      [26.67, 64.33, 1.17, 0.64, 1],
    ],
    order: '0,2,1|',
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    dots: [
      [-16.56, 81.36, 1.05, 0.45, 1],
      [-0.19, 80.68, 1.05, 0.45, 1],
      [16.75, 78.67, 1.05, 0.45, 1],
    ],
    order: '0,2,1|',
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    dots: [
      [38.32, -27.84, 1.02, 0.51, 1],
      [47.36, -41.11, 1.16, 0.62, 1],
      [76, -48.52, 1.09, 0.56, 1],
    ],
    order: '0,2,1|',
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    dots: [
      [52.75, -38.51, 0.91, 0.45, 1],
      [63.72, -46.68, 0.91, 0.45, 1],
      [75.24, -54.09, 0.91, 0.45, 1],
    ],
    order: '0,2,1|',
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    dots: [
      [-11.9, -63.11, 1.29, 0.45, 1],
      [-4.52, -75.31, 1.24, 0.45, 1],
      [16.43, -71.43, 1.28, 0.45, 1],
    ],
    order: '0,2,1|',
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    dots: [
      [-72.82, 0.23, 0.99, 0.45, -1],
      [49.32, -39.21, 0.93, 0.45, -1],
      [23.5, 4.43, 1.14, 0.45, 1],
    ],
    order: '2|1,0',
  },
};

const FULL = punkteDetail(200);

/** The prototype's stacking: each group's nodes, bottom first. */
const stacking = (order: NodeOrder): string => {
  const side = (front: boolean): string =>
    order.seq
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => order.front[i] === front)
      .sort((a, b) => a.s - b.s)
      .map(({ i }) => i)
      .join(',');
  return `${side(true)}|${side(false)}`;
};

describe('the dots move exactly like the prototype', () => {
  for (const s of ORB_STATES) {
    for (const n of [30, 62]) {
      it(`${s} after ${n} frames`, () => {
        const ref = PROTOTYPE[`${s}${n}`];
        if (!ref) throw new Error('no reference');
        let sim: PunkteSim = newPunkte('idle');
        for (let i = 0; i < 90; i++) sim = stepPunkte(sim, 1 / 60, 'idle');
        const voices = (x: PunkteSim): number[] => [0, 1, 2].map((i) => protoVoice(x.t - i * 0.13));
        // jump() places the dots in its last render and once more in an extra render, which
        // also moves them one more step (their phases and springs, no time).
        let order = placeNodes(
          firstOrder([true, true, true]),
          PUNKTE.nodes(punktePose(sim, 0, FULL)),
        );
        sim = flyPunkte(sim, 1 / 60);
        order = placeNodes(order, PUNKTE.nodes(punktePose(sim, 0, FULL)));
        for (let i = 0; i < n; i++) {
          sim = stepPunkte(sim, 0.016, s);
          order = placeNodes(order, PUNKTE.nodes(punktePose(sim, 0, FULL)));
        }
        const p = punktePoseOf(sim, voices(sim), FULL);
        expect(p.orb).toBeCloseTo(ref.orb, 4);
        expect(p.halo).toBeCloseTo(ref.halo, 2);
        ref.dots.forEach((d, i) => {
          const o = i * 5;
          const z = p.dots[o + 2] ?? 0;
          const mine = [p.dots[o], p.dots[o + 1], p.dots[o + 3], p.dots[o + 4], z >= 0 ? 1 : -1];
          mine.forEach((v, k) => expect(v, `dot ${i} ${k}`).toBeCloseTo(d[k] ?? NaN, 1));
        });
        expect(stacking(order)).toBe(ref.order);
      });
    }
  }
});

describe('dot states', () => {
  it('whirl up when happy, fly a lap of honour, then rest as idle', () => {
    let sim = stillPunkte('idle');
    sim = stepPunkte(sim, 1 / 60, 'happy');
    let top = Infinity;
    for (let i = 0; i < 48; i++) {
      sim = stepPunkte(sim, 1 / 60, 'happy');
      top = Math.min(top, sim.dots[1] ?? 0, sim.dots[7] ?? 0, sim.dots[13] ?? 0);
    }
    expect(top).toBeLessThan(-70);
    const ph = sim.ph;
    for (let i = 0; i < 60 * (PUNKTE_SETTLE - 0.8); i++) sim = stepPunkte(sim, 1 / 60, 'happy');
    // One full lap (and a little blending) after the whirl.
    expect(sim.ph - ph).toBeGreaterThan(Math.PI * 2 * 0.95);
    for (let i = 0; i < 60; i++) sim = stepPunkte(sim, 1 / 60, 'happy');
    expect(sim.w[0]).toBeGreaterThan(0.95);
  });

  it('gather above the orb while listening and line up below while waiting', () => {
    const listen = punktePose(stillPunkte('listen'), 0.4, FULL).dots;
    const wait = punktePose(stillPunkte('wait'), 0.4, FULL).dots;
    for (let i = 0; i < 3; i++) {
      expect(listen[i * 5 + 1]).toBeLessThan(-60);
      expect(wait[i * 5 + 1]).toBeGreaterThan(70);
    }
  });

  it('grow with her voice while listening', () => {
    const sim = stillPunkte('listen');
    expect(punktePose(sim, 1, FULL).dots[3]).toBeGreaterThan(
      (punktePose(sim, 0, FULL).dots[3] ?? 0) + 0.3,
    );
  });

  it('a still pose is the same every time', () => {
    for (const s of ORB_STATES)
      expect(punktePose(stillPunkte(s), 0.3, FULL)).toEqual(punktePose(stillPunkte(s), 0.3, FULL));
  });

  it('draws no dots on the tiniest orb, fewer sparkles on avatars', () => {
    expect(punktePose(stillPunkte('idle'), 0, punkteDetail(18)).dots).toEqual([]);
    expect(PUNKTE.order(punkteDetail(18)).front).toEqual([]);
    expect(punkteDetail(26).dots).toBe(true);
    expect(punkteDetail(26).sparkles).toBeLessThan(punkteDetail(200).sparkles);
  });
});
