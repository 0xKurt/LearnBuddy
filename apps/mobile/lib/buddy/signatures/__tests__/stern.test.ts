import { describe, expect, it } from 'vitest';

import { ORB_STATES, TAU } from '../core.js';
import {
  STERN_SETTLE,
  newStern,
  sternDetail,
  sternPose,
  stepStern,
  stillStern,
  type SternSim,
} from '../stern.js';
import { protoVoice } from './proto.js';

// The prototype (round 1, variant 5 "Funkelstern", orb-varianten.html) is the reference. Read
// from its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's scale,
// the halo's opacity, the star's translate, rotation and ray scale, its light's radius and
// opacity and the cross's opacity, the first trail star (translate, rotation, scale,
// opacity), the first speaking star (translate, rotation, scale) and the shimmer (its sweep
// and opacity). Two decimals.
const PROTOTYPE: Record<
  string,
  {
    orb: number;
    halo: number;
    star: number[];
    glow: number[];
    ghost0: number[];
    mini0: number[];
    sweep: number[];
  }
> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    star: [-21, -25, 7.42, 14.83],
    glow: [15.57, 0.7, 0.45],
    ghost0: [-32.45, 2.68, 0, 0, 0],
    mini0: [-45.06, -38.89, 47.08, 0],
    sweep: [33.38, 0],
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    star: [-21, -25, 7.98, 14.33],
    glow: [15.05, 0.7, 0.45],
    ghost0: [-0.87, -28.38, 0, 0, 0],
    mini0: [-56.66, -45.59, 82.52, 0],
    sweep: [67.81, 0],
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    star: [-21, -25, 0.67, 18.25],
    glow: [19.16, 0.97, 0.81],
    ghost0: [-32.45, 2.68, 0, 0, 0],
    mini0: [-45.06, -38.89, 47.08, 0],
    sweep: [33.38, 0],
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    star: [-21, -25, 0.06, 20.53],
    glow: [21.56, 1, 0.85],
    ghost0: [-0.87, -28.38, 0, 0, 0],
    mini0: [-56.66, -45.59, 82.52, 0],
    sweep: [67.81, 0],
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    star: [-29.8, -8.11, 197.31, 12.71],
    glow: [13.35, 0.7, 0.45],
    ghost0: [-32.45, 2.68, 0, 5.91, 0.73],
    mini0: [-45.06, -38.89, 47.08, 0],
    sweep: [33.38, 0],
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    star: [9.17, -28.11, 301.95, 12.51],
    glow: [13.14, 0.7, 0.45],
    ghost0: [-0.87, -28.38, 0, 6.45, 0.79],
    mini0: [-56.66, -45.59, 82.52, 0],
    sweep: [67.81, 0],
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    star: [-21, -25, 0.67, 10.5],
    glow: [11.03, 0.7, 0.45],
    ghost0: [-32.45, 2.68, 0, 0, 0],
    mini0: [-45.06, -38.89, 47.08, 0],
    sweep: [33.38, 0.7],
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    star: [-21, -25, 0.06, 10.75],
    glow: [11.29, 0.7, 0.45],
    ghost0: [-0.87, -28.38, 0, 0, 0],
    mini0: [-56.66, -45.59, 82.52, 0],
    sweep: [67.81, 0.59],
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    star: [-21, -25, 2.76, 15.24],
    glow: [16, 0.7, 0.5],
    ghost0: [-32.45, 2.68, 0, 0, 0],
    mini0: [-45.06, -38.89, 47.08, 3.82],
    sweep: [33.38, 0],
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    star: [-21, -25, 0.06, 14],
    glow: [14.7, 0.7, 0.45],
    ghost0: [-0.87, -28.38, 0, 0, 0],
    mini0: [-56.66, -45.59, 82.52, 0.92],
    sweep: [67.81, 0],
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    star: [-1.91, -75, 164.3, 23.17],
    glow: [24.32, 0.7, 0.45],
    ghost0: [-32.45, 2.68, 0, 0, 0],
    mini0: [-45.06, -38.89, 47.08, 0],
    sweep: [33.38, 0],
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    star: [-0.15, -79.61, 237.42, 24.13],
    glow: [25.34, 0.7, 0.45],
    ghost0: [-0.87, -28.38, 0, 0, 0],
    mini0: [-56.66, -45.59, 82.52, 0],
    sweep: [67.81, 0],
  },
};

const run = (sim: SternSim, secs: number, state: 'idle'): SternSim => {
  let s = sim;
  for (let i = 0; i < Math.round(secs * 60); i++) s = stepStern(s, 1 / 60, state);
  return s;
};

describe('the star moves exactly like the prototype', () => {
  for (const s of ORB_STATES) {
    for (const n of [30, 62]) {
      it(`${s} after ${n} frames`, () => {
        const ref = PROTOTYPE[`${s}${n}`];
        if (!ref) throw new Error('no reference');
        let sim = run(newStern('idle'), 1.5, 'idle');
        // The prototype's jump() renders once more than it steps: one more step of its path.
        sim = { ...sim, ph: sim.ph + (1 / 60) * (TAU / 2.1) };
        for (let i = 0; i < n; i++) sim = stepStern(sim, 0.016, s);
        const p = sternPose(sim, protoVoice(sim.t));
        expect(p.orb).toBeCloseTo(ref.orb, 4);
        expect(p.halo).toBeCloseTo(ref.halo, 2);
        const star = [p.x, p.y, p.rot, p.r];
        star.forEach((v, i) => expect(v, `star ${i}`).toBeCloseTo(ref.star[i] ?? NaN, 1));
        const glow = [p.glowR, p.glowOp, p.crossOp];
        glow.forEach((v, i) => expect(v, `glow ${i}`).toBeCloseTo(ref.glow[i] ?? NaN, 1));
        p.ghosts
          .slice(0, 5)
          .forEach((v, i) => expect(v, `ghost ${i}`).toBeCloseTo(ref.ghost0[i] ?? NaN, 1));
        p.minis
          .slice(0, 4)
          .forEach((v, i) => expect(v, `mini ${i}`).toBeCloseTo(ref.mini0[i] ?? NaN, 1));
        expect(p.sweepX).toBeCloseTo(ref.sweep[0] ?? NaN, 1);
        expect(p.sweepOp).toBeCloseTo(ref.sweep[1] ?? NaN, 1);
      });
    }
  }
});

describe('star states', () => {
  it('jumps out of the glass when happy and glides home, then rests as idle', () => {
    let sim = run(newStern('idle'), 1, 'idle');
    const home = sternPose(sim, 0);
    sim = stepStern(sim, 1 / 60, 'happy');
    let top = Infinity;
    for (let i = 0; i < 60 * 3; i++) {
      sim = stepStern(sim, 1 / 60, 'happy');
      top = Math.min(top, sternPose(sim, 0).y);
    }
    expect(top).toBeLessThan(-75);
    const back = sternPose(sim, 0);
    expect(back.x).toBeCloseTo(home.x, 5);
    expect(back.y).toBeCloseTo(home.y, 5);
    expect(sim.w[0]).toBeGreaterThan(0.95);
    expect(STERN_SETTLE).toBeGreaterThan(1.9);
  });

  it('grows with her voice while listening', () => {
    const sim = stillStern('listen');
    expect(sternPose(sim, 1).r).toBeGreaterThan(sternPose(sim, 0).r + 5);
  });

  it('draws its trail only while thinking and the shimmer only while waiting', () => {
    const think = sternPose(stillStern('think'), 0);
    const wait = sternPose(stillStern('wait'), 0);
    const idle = sternPose(stillStern('idle'), 0);
    expect(think.ghosts[3]).toBeGreaterThan(5);
    expect(idle.ghosts[3]).toBe(0);
    // The prototype's still of "wait" (1.7 s) catches the shimmer mid-glass.
    expect(wait.sweepOp).toBeGreaterThan(0.5);
    expect(idle.sweepOp).toBe(0);
  });

  it('a still pose is the same every time', () => {
    for (const s of ORB_STATES)
      expect(sternPose(stillStern(s), 0.3)).toEqual(sternPose(stillStern(s), 0.3));
  });

  it('draws no star on the tiniest orb, fewer sparkles on avatars', () => {
    expect(sternDetail(18).star).toBe(false);
    expect(sternDetail(26).sparkles).toBeLessThan(sternDetail(200).sparkles);
  });
});
