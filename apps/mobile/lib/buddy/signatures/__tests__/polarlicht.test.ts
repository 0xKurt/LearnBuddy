import { describe, expect, it } from 'vitest';

import { ORB_STATES, TAU, burstPose, sparkles } from '../core.js';
import {
  POLAR_BURST,
  POLAR_RAYS,
  POLAR_SETTLE,
  POLAR_SPARKLES,
  flowPolar,
  newPolar,
  polarColour,
  polarDetail,
  polarPose,
  polarRays,
  stepPolar,
  stillPolar,
  type PolarSim,
} from '../polarlicht.js';
import { protoVoice } from './proto.js';

// The prototype (round 2, variant D "Polarlicht", orb-varianten-2.html) is the reference. Read
// from its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's scale,
// the halo's opacity, and rays 0, 20, 37, 55, 80 and 101 of 110 — the foot of each (x, y),
// its height, its side (1 in front of the glass, −1 behind), its gradient's two colours (the
// whitened foot and the ray, r g b) and its brightness — and the shower (opacity; the first
// sparkle's translate, rotation and scale).
const PROTOTYPE: Record<
  string,
  { orb: number; halo: number; rays: Record<number, number[]>; burst: number[] }
> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    rays: {
      0: [76.07, -7.78, 13.8, 1, 212, 243, 236, 159, 227, 214, 0.75],
      20: [4.78, 26.89, 9.29, 1, 211, 230, 252, 156, 200, 248, 0.75],
      37: [-65.54, 27.62, 35.81, 1, 219, 222, 255, 175, 182, 255, 0.75],
      55: [-76.07, 7.78, 35.46, -1, 232, 216, 253, 203, 169, 250, 0.75],
      80: [17.96, -33.55, 10.06, -1, 254, 220, 237, 252, 178, 216, 0.75],
      101: [82.52, -14.65, 32.55, -1, 221, 239, 235, 179, 220, 210, 0.75],
    },
    burst: [0],
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    rays: {
      0: [71.69, -6.75, 11.2, 1, 212, 242, 237, 159, 226, 215, 0.75],
      20: [-4.11, 30.42, 10.17, 1, 211, 230, 252, 156, 199, 249, 0.75],
      37: [-71.13, 24.43, 35.8, 1, 219, 222, 255, 176, 181, 255, 0.75],
      55: [-71.69, 6.75, 22.53, -1, 232, 216, 252, 205, 169, 249, 0.75],
      80: [27.24, -32.58, 11.11, -1, 252, 221, 237, 249, 179, 216, 0.75],
      101: [82.88, -13.81, 17.53, 1, 219, 240, 234, 176, 222, 209, 0.75],
    },
    burst: [0],
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    rays: {
      0: [77.75, -1.11, 15.63, 1, 212, 243, 236, 159, 228, 213, 0.93],
      20: [6.23, 31.03, 13.18, 1, 211, 230, 252, 156, 200, 248, 0.93],
      37: [-65.11, 27.33, 42.72, 1, 219, 222, 255, 174, 182, 255, 0.93],
      55: [-77.75, 1.11, 34.02, -1, 231, 216, 253, 203, 169, 251, 0.93],
      80: [17.08, -35.57, 9.69, -1, 254, 220, 237, 253, 177, 216, 0.93],
      101: [82.75, -11.45, 32.22, -1, 221, 239, 235, 180, 220, 210, 0.93],
    },
    burst: [0],
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    rays: {
      0: [75.56, -0.05, 14.02, 1, 212, 242, 237, 159, 227, 214, 0.95],
      20: [1.11, 33.97, 15.34, 1, 211, 230, 252, 156, 199, 249, 0.95],
      37: [-68.51, 25.02, 47.59, 1, 219, 222, 255, 175, 182, 255, 0.95],
      55: [-75.56, 0.05, 26.46, -1, 232, 216, 253, 204, 169, 250, 0.95],
      80: [22.49, -34.88, 10.79, -1, 253, 221, 237, 251, 178, 216, 0.95],
      101: [83.33, -10.12, 20.62, -1, 220, 240, 235, 178, 221, 210, 0.95],
    },
    burst: [0],
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    rays: {
      0: [60.08, -0.88, 15.16, 1, 211, 239, 241, 158, 219, 224, 0.89],
      20: [-22.3, 36.88, 14.03, 1, 212, 227, 255, 159, 192, 255, 0.89],
      37: [-80.46, 15.41, 33.01, 1, 223, 219, 255, 184, 176, 255, 0.89],
      55: [-60.08, 0.88, 14.03, -1, 238, 217, 249, 216, 171, 242, 0.89],
      80: [43.35, -38.5, 9.19, -1, 244, 226, 237, 231, 190, 214, 0.89],
      101: [79.4, -14.67, 14.95, 1, 212, 244, 234, 159, 231, 209, 0.89],
    },
    burst: [0],
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    rays: {
      0: [13.34, 28.05, 8.52, 1, 211, 232, 250, 157, 204, 243, 0.9],
      20: [-69.75, 24.68, 33.78, 1, 219, 222, 255, 175, 182, 255, 0.9],
      37: [-73.23, 15.98, 26.6, -1, 231, 216, 253, 201, 169, 252, 0.9],
      55: [-13.34, -28.05, 13.49, -1, 248, 219, 242, 240, 174, 226, 0.9],
      80: [80.46, -16.42, 30.94, -1, 227, 236, 235, 192, 213, 211, 0.9],
      101: [49.84, 7.46, 13.34, 1, 211, 238, 243, 158, 216, 228, 0.9],
    },
    burst: [0],
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    rays: {
      0: [77.5, -8.06, 5.55, 1, 212, 243, 236, 159, 228, 213, 0.52],
      20: [7.9, 24.28, 3.85, 1, 211, 230, 252, 156, 200, 248, 0.52],
      37: [-63.27, 28.4, 14.1, 1, 219, 222, 255, 174, 182, 255, 0.52],
      55: [-77.5, 8.06, 14.17, -1, 231, 216, 253, 203, 169, 251, 0.52],
      80: [15.19, -29.94, 4.05, -1, 254, 220, 237, 253, 177, 216, 0.52],
      101: [81.58, -17.41, 13.57, -1, 221, 239, 235, 180, 220, 210, 0.52],
    },
    burst: [0],
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    rays: {
      0: [76.06, -7.75, 3.24, 1, 212, 242, 237, 159, 227, 214, 0.5],
      20: [4.59, 26.2, 2.67, 1, 211, 230, 252, 156, 199, 249, 0.5],
      37: [-65.62, 27.35, 10.55, 1, 219, 222, 255, 175, 182, 255, 0.5],
      55: [-76.06, 7.75, 8.85, -1, 232, 216, 253, 204, 169, 250, 0.5],
      80: [18.85, -29.52, 3.44, -1, 253, 221, 237, 251, 178, 216, 0.5],
      101: [82, -17.12, 7.06, -1, 220, 240, 235, 178, 221, 210, 0.5],
    },
    burst: [0],
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    rays: {
      0: [75.28, -7.18, 13.01, 1, 212, 242, 237, 159, 227, 214, 0.84],
      20: [2.81, 27.5, 8.51, 1, 211, 230, 252, 156, 199, 249, 0.84],
      37: [-66.86, 26.81, 34.68, 1, 219, 222, 255, 175, 181, 255, 0.84],
      55: [-75.28, 7.18, 31.1, -1, 232, 216, 253, 204, 169, 250, 0.84],
      80: [19.86, -34, 9.6, -1, 253, 221, 237, 250, 179, 216, 0.84],
      101: [82.72, -14.36, 29.53, -1, 220, 240, 235, 177, 221, 210, 0.84],
    },
    burst: [0],
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    rays: {
      0: [69.09, -4.74, 9.63, 1, 212, 241, 238, 158, 224, 217, 0.85],
      20: [-9.42, 31.02, 10.25, 1, 211, 229, 253, 156, 197, 252, 0.85],
      37: [-73.87, 22.66, 30.05, 1, 220, 221, 255, 178, 180, 255, 0.85],
      55: [-69.09, 4.74, 16, -1, 234, 217, 252, 208, 170, 247, 0.85],
      80: [32.16, -32.84, 9.64, -1, 250, 222, 237, 245, 182, 215, 0.85],
      101: [82.61, -13.25, 12.8, 1, 217, 241, 234, 171, 225, 209, 0.85],
    },
    burst: [0],
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    rays: {
      0: [66.68, -1.12, 34.98, 1, 211, 238, 242, 158, 217, 227, 0.98],
      20: [-13.66, 35.3, 23.99, 1, 213, 226, 255, 161, 191, 255, 0.98],
      37: [-76.78, 18.2, 85.17, 1, 224, 219, 255, 186, 174, 255, 0.98],
      55: [-66.68, 1.12, 56.06, -1, 239, 217, 248, 220, 171, 239, 0.98],
      80: [35.35, -39.56, 22.89, -1, 241, 227, 236, 225, 194, 213, 0.98],
      101: [82.25, -11.71, 47.15, 1, 212, 243, 236, 159, 229, 212, 0.98],
    },
    burst: [0.91, 62.39, -1.92, 16, 3.13],
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    rays: {
      0: [37.62, 21.93, 21.35, 1, 211, 229, 253, 156, 198, 250, 1],
      20: [-51.35, 33.34, 59.86, 1, 222, 220, 255, 181, 178, 255, 1],
      37: [-82.29, 12.39, 59.85, -1, 235, 217, 251, 211, 170, 245, 1],
      55: [-37.62, -21.93, 18.3, -1, 252, 219, 239, 249, 175, 220, 1],
      80: [68.33, -25.73, 45.88, -1, 220, 240, 235, 177, 222, 209, 1],
      101: [66.68, -4.77, 19.76, 1, 211, 235, 246, 157, 210, 235, 1],
    },
    burst: [0.99, 90.7, 4.03, 79.02, 3.8],
  },
  happy10: {
    orb: 1.02314,
    halo: 0.79,
    rays: {
      0: [77.35, -6.46, 18.92, 1, 212, 242, 237, 159, 226, 215, 0.89],
      20: [6.9, 25.47, 12.83, 1, 211, 230, 252, 156, 199, 249, 0.89],
      37: [-63.84, 29.19, 38.77, 1, 219, 222, 255, 176, 181, 255, 0.89],
      55: [-77.35, 6.46, 39.95, -1, 232, 216, 252, 205, 169, 249, 0.89],
      80: [15.24, -35.43, 10.75, -1, 252, 221, 237, 249, 179, 216, 0.89],
      101: [82.3, -14.7, 40.36, -1, 219, 240, 234, 176, 222, 209, 0.89],
    },
    burst: [0],
  },
  happy90: {
    orb: 1.00151,
    halo: 0.95,
    rays: {
      0: [2.79, 34.56, 14.36, 1, 217, 223, 255, 170, 185, 255, 1],
      20: [-74.99, 23.08, 43.75, 1, 231, 216, 254, 201, 169, 252, 1],
      37: [-69.59, 7.01, 15.41, -1, 247, 218, 243, 237, 174, 228, 1],
      55: [-2.79, -34.56, 20.37, -1, 240, 228, 236, 221, 196, 213, 1],
      80: [81.98, -16.69, 21.08, -1, 211, 240, 239, 158, 222, 220, 1],
      101: [42.54, 20.41, 13.33, 1, 211, 227, 255, 157, 193, 255, 1],
    },
    burst: [1, 96.62, 9.38, 134.15, 1.79],
  },
};

const run = (sim: PolarSim, secs: number, state: 'idle'): PolarSim => {
  let s = sim;
  for (let i = 0; i < Math.round(secs * 60); i++) s = stepPolar(s, 1 / 60, state);
  return s;
};

const near = (v: number, ref: number | undefined, tol: number, what: string): void => {
  expect(Math.abs(v - (ref ?? NaN)), `${what}: ${v} vs ${ref}`).toBeLessThanOrEqual(tol);
};

describe('the aurora moves exactly like the prototype', () => {
  for (const [name, ref] of Object.entries(PROTOTYPE)) {
    it(name, () => {
      const m = /^([a-z]+)(\d+)$/.exec(name);
      const s = ORB_STATES.find((x) => x === m?.[1]);
      if (!s || !m) throw new Error('bad case');
      // The prototype's jump() renders once more than it steps: one more flow of the curtain.
      let sim = flowPolar(run(newPolar('idle'), 1.5, 'idle'), 1 / 60);
      for (let i = 0; i < Number(m[2]); i++) sim = stepPolar(sim, 0.016, s);
      const vo = protoVoice(sim.t);
      const p = polarPose(sim, vo, POLAR_RAYS);
      near(p.orb, ref.orb, 0.00051, 'scale');
      near(p.halo, ref.halo, 0.0051, 'halo');
      // The prototype's own rays: ray j at j/110·τ + flow, coloured j/110 + col.
      const rays = polarRays(sim, vo, POLAR_RAYS, sim.flow);
      for (const [j, r] of Object.entries(ref.rays)) {
        const o = Number(j) * 4;
        near(rays[o] ?? NaN, r[0], 0.011, `ray ${j} x`);
        near(rays[o + 1] ?? NaN, r[1], 0.006, `ray ${j} y`);
        near(rays[o + 2] ?? NaN, r[2], 0.011, `ray ${j} height`);
        expect((rays[o + 3] ?? NaN) >= 0 ? 1 : -1, `ray ${j} side`).toBe(r[3]);
        const foot = polarColour(Number(j) / POLAR_RAYS + sim.col, 0.55);
        const col = polarColour(Number(j) / POLAR_RAYS + sim.col, 0);
        [...foot, ...col].forEach((c, i) => near(c, r[4 + i], 1, `ray ${j} colour ${i}`));
        near(p.bright, r[10], 0.0051, `ray ${j} brightness`);
      }
      const on = p.burstU > 0 && p.burstU < 1 && p.burstGate > 0.02;
      near(on ? p.burstGate : 0, ref.burst[0], 0.0051, 'shower');
      if (on) {
        const q = sparkles(POLAR_SPARKLES, 71)[0];
        if (!q) throw new Error('no sparkle');
        const b = burstPose(q, p.burstU, POLAR_BURST);
        near(b.x, ref.burst[1], 0.006, 'sparkle x');
        near(b.y, ref.burst[2], 0.006, 'sparkle y');
        near(b.rot, ref.burst[3], 0.006, 'sparkle rot');
        near(b.scale, ref.burst[4], 0.006, 'sparkle scale');
      }
    });
  }
});

describe('aurora states', () => {
  it('each drawn ray stands where the prototype curtain has its colour', () => {
    const sim = stillPolar('think');
    for (const n of [POLAR_RAYS, POLAR_RAYS / 2]) {
      const p = polarPose(sim, 0.4, n);
      for (const m of [0, 7, 33, n - 1]) {
        const th = (m / n) * TAU + sim.flow - sim.col * TAU;
        // The prototype's colour at the angle th: (th − flow)/τ + col of the palette.
        expect(polarColour((th - sim.flow) / TAU + sim.col, 0)).toEqual(polarColour(m / n, 0));
        const one = polarRays(sim, 0.4, 1, th);
        one.forEach((v, i) => expect(p.rays[m * 4 + i]).toBeCloseTo(v, 9));
      }
    }
  });

  it('blazes up when happy, then rests as idle', () => {
    let sim = run(newPolar('idle'), 1, 'idle');
    const calm = Math.max(...polarPose(sim, 0, POLAR_RAYS).rays.filter((_, i) => i % 4 === 2));
    let high = 0;
    for (let i = 0; i < 60 * 3.5; i++) {
      sim = stepPolar(sim, 1 / 60, 'happy');
      const hs = polarPose(sim, 0, POLAR_RAYS).rays.filter((_, i) => i % 4 === 2);
      high = Math.max(high, ...hs);
    }
    expect(high).toBeGreaterThan(calm * 2);
    expect(sim.w[0]).toBeGreaterThan(0.9);
    expect(POLAR_SETTLE).toBeGreaterThan(1.65);
  });

  it('rises in front with her voice while listening', () => {
    const sim = stillPolar('listen');
    // Straight in front of the orb, and straight behind it.
    const front = (vo: number): number => polarRays(sim, vo, 1, Math.PI / 2)[2] ?? 0;
    const back = (vo: number): number => polarRays(sim, vo, 1, -Math.PI / 2)[2] ?? 0;
    expect(front(1)).toBeGreaterThan(front(0) * 1.3);
    expect(back(1)).toBeCloseTo(back(0), 6);
  });

  it('is a low hem while waiting', () => {
    const tallest = (s: 'wait' | 'idle'): number =>
      Math.max(...polarPose(stillPolar(s), 0, POLAR_RAYS).rays.filter((_, i) => i % 4 === 2));
    expect(tallest('wait')).toBeLessThan(tallest('idle') * 0.6);
  });

  it('runs its colours round mint, sky blue, lilac and pink', () => {
    expect(polarColour(0, 0)).toEqual([159, 232, 208]);
    expect(polarColour(0.25, 0)).toEqual([156, 194, 255]);
    expect(polarColour(1.5, 0)).toEqual([196, 168, 255]);
    expect(polarColour(-0.25, 0)).toEqual([255, 176, 216]);
    expect(polarColour(0, 1)).toEqual([255, 255, 255]);
  });

  it('a still pose is the same every time', () => {
    for (const s of ORB_STATES)
      expect(polarPose(stillPolar(s), 0.3, POLAR_RAYS)).toEqual(
        polarPose(stillPolar(s), 0.3, POLAR_RAYS),
      );
  });

  it('draws no aurora on the tiniest orb; avatars half as many, twice as wide rays', () => {
    expect(polarDetail(18).aurora).toBe(false);
    const av = polarDetail(40);
    const full = polarDetail(200);
    expect(av.rays * av.width).toBeCloseTo(full.rays * full.width, 6);
    expect(av.sparkles).toBeLessThan(full.sparkles);
    expect(av.shadow).toBe(false);
  });
});
