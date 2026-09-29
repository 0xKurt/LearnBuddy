import { describe, expect, it } from 'vitest';

import { ORB_R, ORB_STATES, TAU, type OrbState } from '../core.js';
import {
  RING,
  RING_SETTLE,
  newRing,
  ringDetail,
  ringPose,
  stepRing,
  stillRing,
  type RingSim,
} from '../ring.js';
import { protoVoice } from './proto.js';

const run = (sim: RingSim, state: OrbState, secs: number, dt = 1 / 60): RingSim => {
  let s = sim;
  for (let i = 0; i < Math.round(secs / dt); i++) s = stepRing(s, dt, state);
  return s;
};

// The prototype (round 1, variant 2 "Ring", orb-varianten.html) is the reference. Read from
// its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's scale, the
// halo's opacity, the band's tilt, the line's rx, ry, width and opacity, the first glint's
// translate, rotation and scale, and its side (1 in front, -1 behind). Two decimals.
const PROTOTYPE: Record<
  string,
  { orb: number; halo: number; tilt: number; ring: number[]; glint: number[] }
> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    tilt: -16,
    ring: [84, 21.84, 3.2, 0.8],
    glint: [-83.9, -1.08, 95.2, 1, -1],
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    tilt: -16,
    ring: [84, 21.84, 3.2, 0.8],
    glint: [-70.01, -12.07, 115.68, 1, -1],
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    tilt: -8.73,
    ring: [80.54, 35.59, 4.13, 0.98],
    glint: [-79.83, 4.73, 87.93, 1, 1],
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    tilt: -8.06,
    ring: [80.88, 37.09, 4.93, 1],
    glint: [-80.43, -3.92, 107.74, 1, -1],
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    tilt: -25.07,
    ring: [84, 24.9, 3.02, 0.89],
    glint: [-8.15, -24.78, 104.27, 1, -1],
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    tilt: -13.87,
    ring: [84, 25.18, 3, 0.9],
    glint: [31.88, 23.29, 113.55, 1, 1],
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    tilt: -22.91,
    ring: [82.18, 18.38, 2.65, 0.66],
    glint: [-79.19, 4.91, 102.11, 1.09, 1],
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    tilt: -23.81,
    ring: [82.01, 18.07, 2.6, 0.65],
    glint: [-79.39, 4.53, 123.49, 0.63, 1],
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    tilt: -14.18,
    ring: [84.35, 23.46, 3.43, 0.85],
    glint: [-83.81, -2.65, 93.38, 1, -1],
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    tilt: -14.01,
    ring: [84, 23.51, 3.2, 0.85],
    glint: [-61.27, -16.08, 113.69, 1, -1],
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    tilt: 49.91,
    ring: [85.82, 48.33, 3.56, 0.98],
    glint: [-66.25, -30.72, 29.29, 1, -1],
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    tilt: 322.46,
    ring: [85.99, 44.28, 3.6, 1],
    glint: [54.92, -34.07, -222.78, 1, -1],
  },
};

describe('the ring moves exactly like the prototype', () => {
  for (const s of ORB_STATES) {
    for (const n of [30, 62]) {
      it(`${s} after ${n} frames`, () => {
        const ref = PROTOTYPE[`${s}${n}`];
        if (!ref) throw new Error('no reference');
        let sim = run(newRing('idle'), 'idle', 1.5);
        // The prototype's jump() renders once more than it steps: the glint one more idle step.
        sim = { ...sim, g: sim.g + (1 / 60) * (TAU / 6) };
        for (let i = 0; i < n; i++) sim = stepRing(sim, 0.016, s);
        const p = ringPose(sim, protoVoice(sim.t));
        expect(p.orb).toBeCloseTo(ref.orb, 4);
        expect(p.halo).toBeCloseTo(ref.halo, 2);
        expect(p.tilt).toBeCloseTo(ref.tilt, 1);
        expect(p.rx).toBeCloseTo(ref.ring[0] ?? NaN, 1);
        expect(p.ry).toBeCloseTo(ref.ring[1] ?? NaN, 1);
        expect(p.sw).toBeCloseTo(ref.ring[2] ?? NaN, 1);
        expect(p.bright).toBeCloseTo(ref.ring[3] ?? NaN, 1);
        const g = p.glints;
        expect(g[0]).toBeCloseTo(ref.glint[0] ?? NaN, 1);
        expect(g[1]).toBeCloseTo(ref.glint[1] ?? NaN, 1);
        expect(g[3]).toBeCloseTo(ref.glint[2] ?? NaN, 1);
        expect(g[4]).toBeCloseTo(ref.glint[3] ?? NaN, 1);
        expect((g[2] ?? 0) >= 0 ? 1 : -1).toBe(ref.glint[4]);
      });
    }
  }
});

describe('ring states', () => {
  it('turns a whole round while happy and then lies as before, without spinning back', () => {
    let sim = run(newRing('idle'), 'idle', 1);
    const before = ringPose(sim, 0.5).tilt;
    sim = stepRing(sim, 1 / 60, 'happy');
    const tilts: number[] = [];
    for (let i = 0; i < 60 * 4; i++) {
      sim = stepRing(sim, 1 / 60, 'happy');
      tilts.push(ringPose(sim, 0.5).tilt);
    }
    // Up to a full turn; frame to frame (a band turned by 360° lies as before) it never turns
    // back by more than the idle tilt's own blend.
    expect(Math.max(...tilts)).toBeGreaterThan(before + 300);
    const turn = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
    for (let i = 1; i < tilts.length; i++)
      expect(turn((tilts[i] ?? 0) - (tilts[i - 1] ?? 0))).toBeGreaterThan(-2);
    // Settled back to idle, lying as before.
    expect(ringPose(sim, 0.5).tilt).toBeCloseTo(before, 0);
    expect(sim.w[0]).toBeGreaterThan(0.95);
    expect(RING_SETTLE).toBeLessThan(2);
  });

  it('opens towards her and widens with her voice while listening', () => {
    const sim = stillRing('listen');
    const quiet = ringPose(sim, 0);
    const loud = ringPose(sim, 1);
    expect(quiet.ry / quiet.rx).toBeGreaterThan(0.4);
    expect(loud.sw).toBeGreaterThan(quiet.sw + 2);
  });

  it('sends waves of light only while speaking, and a second glint only while thinking', () => {
    const speak = ringPose(stillRing('speak'), 0);
    const idle = ringPose(stillRing('idle'), 0);
    expect(Math.max(speak.echoes[3] ?? 0, speak.echoes[7] ?? 0)).toBeGreaterThan(0.1);
    expect(Math.max(idle.echoes[3] ?? 0, idle.echoes[7] ?? 0)).toBe(0);
    expect(ringPose(stillRing('think'), 0).glints[11]).toBeCloseTo(1, 5);
    expect(idle.glints[11]).toBe(0);
  });

  it('changes sides only outside the glass, so the swap never shows', () => {
    for (const s of ORB_STATES) {
      const p = ringPose(stillRing(s), 0.5);
      // Where the near and far halves meet (the band's axis ends), the band is off the glass.
      expect(p.rx - p.sw * 1.3 - 6.6).toBeGreaterThan(ORB_R);
    }
  });

  it('a still pose is the same every time', () => {
    for (const s of ORB_STATES)
      expect(ringPose(stillRing(s), 0.3)).toEqual(ringPose(stillRing(s), 0.3));
  });

  it('draws no ring on the tiniest orb, fewer sparkles on avatars', () => {
    expect(ringDetail(18).ring).toBe(false);
    expect(ringDetail(26).sparkles).toBeLessThan(ringDetail(200).sparkles);
    expect(ringDetail(200)).toEqual({ ring: true, sparkles: 16, shadow: true, halo: true });
    expect(RING.order(ringDetail(200)).front).toEqual([]);
  });
});
