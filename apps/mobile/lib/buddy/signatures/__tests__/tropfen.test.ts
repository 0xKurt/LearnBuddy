import { describe, expect, it } from 'vitest';

import { ORB_R, ORB_STATES, burstPose, sparkles } from '../core.js';
import {
  TROPFEN_BURST,
  TROPFEN_POINTS,
  TROPFEN_SETTLE,
  TROPFEN_SPARKLES,
  TROPFEN_SPLASH,
  newTropfen,
  stepTropfen,
  stillTropfen,
  tropfenDetail,
  tropfenPath,
  tropfenPose,
  type TropfenSim,
} from '../tropfen.js';
import { protoVoice } from './proto.js';

// The prototype (round 2, variant C "Tropfen", orb-varianten-2.html) is the reference. Read
// from its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms (the drop has no
// state of its own, so jump's extra render changes nothing): the body's transform (its lift
// `translate(0 dy + (1 − sy)·R)`, the squash sx, sy — which the prototype writes with two
// decimals — and the breathing scale), the halo's opacity, eight points of the outline
// (j = 0, 13, 24, 40, 48, 61, 72, 90 of 96), the shadow's x-scale, the little drop (cy, rx,
// ry, opacity), its highlight (cx, cy, r), splash droplets 0 and 5 (cx, cy, r, opacity) and
// the shower (opacity; the first sparkle's translate, rotation and scale).
const PROTOTYPE: Record<
  string,
  {
    body: number[];
    halo: number;
    pts: number[];
    shadow: number;
    drop: number[];
    hi: number[];
    s0: number[];
    s5: number[];
    burst: number[];
  }
> = {
  happy10: {
    body: [4.94, 1.05, 0.95, 1.02314],
    halo: 0.79,
    pts: [
      54.56, 0, 36.15, 41.22, 0, 53.04, -46.96, 27.11, -54.21, 0, -36.01, -41.06, 0, -53.94, 49.53,
      -20.51,
    ],
    shadow: 1,
    drop: [61.73, 5.51, 6.86, 0],
    hi: [-2.1, 59.33, 1.32],
    s0: [-62.96, 62.53, 2.6, 0],
    s5: [21.05, 35.33, 4.6, 0],
    burst: [0],
  },
  happy30: {
    body: [-23.39, 0.97, 1.04, 0.98595],
    halo: 0.92,
    pts: [
      54.08, 0, 35.72, 40.73, 0, 53.83, -46.75, 26.99, -53.99, 0, -35.71, -40.72, 0, -54, 49.76,
      -20.61,
    ],
    shadow: 0.65,
    drop: [62.01, 5.7, 7.13, 0],
    hi: [-2.17, 59.53, 1.36],
    s0: [-62.96, 47.36, 2.6, 0],
    s5: [21.05, 20.16, 4.6, 0],
    burst: [0],
  },
  happy50: {
    body: [0, 1, 1, 1.00703],
    halo: 0.94,
    pts: [
      57.73, 0, 35.31, 40.26, 0, 50.27, -48.36, 27.92, -57.71, 0, -35.3, -40.25, 0, -50.3, 52.28,
      -21.65,
    ],
    shadow: 1,
    drop: [64.25, 5.7, 6.82, 0],
    hi: [-2.17, 61.77, 1.36],
    s0: [-62.96, 42.3, 2.6, 0.98],
    s5: [21.05, 15.1, 4.6, 0.98],
    burst: [0.98, 59.8, -25.53, 13.33, 2.44],
  },
  happy62: {
    body: [5.86, 1.06, 0.94, 0.99776],
    halo: 0.95,
    pts: [
      52.11, 0, 35.78, 40.79, 0, 55.89, -45.94, 26.52, -52.1, 0, -35.77, -40.79, 0, -55.91, 48.64,
      -20.15,
    ],
    shadow: 1,
    drop: [65.94, 5.7, 6.82, 0],
    hi: [-2.17, 63.46, 1.36],
    s0: [-90.3, 39.91, 2.6, 0.99],
    s5: [30.2, 0.9, 4.6, 0.99],
    burst: [0.99, 74.36, -23.93, 38.93, 4.93],
  },
  happy90: {
    body: [0, 1, 1, 1.00151],
    halo: 0.95,
    pts: [
      53.5, 0, 35.65, 40.65, 0, 54.49, -46.55, 26.88, -53.5, 0, -35.65, -40.65, 0, -54.5, 49.56,
      -20.53,
    ],
    shadow: 1,
    drop: [77.97, 5.7, 6.82, 0],
    hi: [-2.17, 75.49, 1.36],
    s0: [-114.95, 54.52, 2.6, 0.62],
    s5: [38.44, 4.86, 4.6, 0.62],
    burst: [1, 90.65, -19.53, 98.67, 2.89],
  },
  idle30: {
    body: [0.14, 1, 1, 1.00286],
    halo: 0.6,
    pts: [
      53.97, 0, 37.42, 42.66, 0, 52.04, -46.66, 26.94, -54.83, 0, -36.22, -41.3, 0, -54.02, 48.09,
      -19.92,
    ],
    shadow: 1,
    drop: [62.01, 5.7, 7.13, 0],
    hi: [-2.17, 59.53, 1.36],
    s0: [-116.23, 495640.63, 2.6, 0],
    s5: [38.87, 495590.42, 4.6, 0],
    burst: [0],
  },
  idle62: {
    body: [-0.45, 0.99, 1.01, 0.99115],
    halo: 0.6,
    pts: [
      53.6, 0, 37.29, 42.52, 0, 53.53, -45.85, 26.47, -55.32, 0, -35.87, -40.9, 0, -54.84, 47.89,
      -19.84,
    ],
    shadow: 1,
    drop: [65.94, 5.7, 6.82, 0],
    hi: [-2.17, 63.46, 1.36],
    s0: [-116.23, 500719.47, 2.6, 0],
    s5: [38.87, 500669.26, 4.6, 0],
    burst: [0],
  },
  listen30: {
    body: [0.01, 1, 1, 1.01432],
    halo: 0.76,
    pts: [
      55.73, 0, 36.03, 41.08, 0, 52.18, -44.74, 25.83, -52.93, 0, -36.18, -41.25, 0, -55.06, 51.07,
      -21.15,
    ],
    shadow: 1,
    drop: [62.01, 5.7, 7.13, 0],
    hi: [-2.17, 59.53, 1.36],
    s0: [-116.23, 495640.63, 2.6, 0],
    s5: [38.87, 495590.42, 4.6, 0],
    burst: [0],
  },
  listen62: {
    body: [0, 1, 1, 1.02677],
    halo: 0.86,
    pts: [
      56.1, 0, 36.22, 41.3, 0, 51.9, -43.8, 25.29, -52.14, 0, -36.46, -41.57, 0, -55.87, 51.95,
      -21.52,
    ],
    shadow: 1,
    drop: [65.94, 5.7, 6.82, 0],
    hi: [-2.17, 63.46, 1.36],
    s0: [-116.23, 500719.47, 2.6, 0],
    s5: [38.87, 500669.26, 4.6, 0],
    burst: [0],
  },
  speak30: {
    body: [-0.39, 1, 1.01, 1.00432],
    halo: 0.68,
    pts: [
      54.22, 0, 36.38, 41.48, 0, 52.75, -46.75, 26.99, -53.66, 0, -36.3, -41.39, 0, -53.79, 49.03,
      -20.31,
    ],
    shadow: 1,
    drop: [62.01, 5.7, 7.13, 0],
    hi: [-2.17, 59.53, 1.36],
    s0: [-116.23, 495640.63, 2.6, 0],
    s5: [38.87, 495590.42, 4.6, 0],
    burst: [0],
  },
  speak62: {
    body: [0, 1, 1, 0.99994],
    halo: 0.65,
    pts: [
      54.57, 0, 36, 41.05, 0, 53.76, -46.45, 26.82, -54.24, 0, -35.81, -40.83, 0, -54.8, 48.98,
      -20.29,
    ],
    shadow: 1,
    drop: [65.94, 5.7, 6.82, 0],
    hi: [-2.17, 63.46, 1.36],
    s0: [-116.23, 500719.47, 2.6, 0],
    s5: [38.87, 500669.26, 4.6, 0],
    burst: [0],
  },
  think30: {
    body: [0.01, 1, 1, 0.99402],
    halo: 0.51,
    pts: [
      55.38, 0, 34.69, 39.55, 0, 56.43, -43.66, 25.21, -53.42, 0, -37.87, -43.18, 0, -50.66, 52.27,
      -21.65,
    ],
    shadow: 1,
    drop: [62.01, 5.7, 7.13, 0],
    hi: [-2.17, 59.53, 1.36],
    s0: [-116.23, 495640.63, 2.6, 0],
    s5: [38.87, 495590.42, 4.6, 0],
    burst: [0],
  },
  think62: {
    body: [0, 1, 1, 0.99658],
    halo: 0.5,
    pts: [
      57.03, 0, 35.16, 40.1, 0, 52.62, -47.12, 27.2, -51.13, 0, -37.44, -42.7, 0, -55.22, 49.17,
      -20.37,
    ],
    shadow: 1,
    drop: [65.94, 5.7, 6.82, 0],
    hi: [-2.17, 63.46, 1.36],
    s0: [-116.23, 500719.47, 2.6, 0],
    s5: [38.87, 500669.26, 4.6, 0],
    burst: [0],
  },
  wait10: {
    body: [0.22, 1, 1, 1.00362],
    halo: 0.54,
    pts: [
      54.75, 0, 36.98, 42.16, 0, 54.15, -47.38, 27.36, -54.41, 0, -35.54, -40.53, 0, -52.44, 49,
      -20.3,
    ],
    shadow: 1,
    drop: [61.73, 5.51, 6.86, 0.55],
    hi: [-2.1, 59.33, 1.32],
    s0: [-116.23, 492479.51, 2.6, 0],
    s5: [38.87, 492429.29, 4.6, 0],
    burst: [0],
  },
  wait30: {
    body: [0.01, 1, 1, 0.99285],
    halo: 0.51,
    pts: [
      54.3, 0, 36.99, 42.18, 0, 55.48, -47.25, 27.28, -54.21, 0, -35.12, -40.04, 0, -51.9, 48.88,
      -20.25,
    ],
    shadow: 1,
    drop: [62.01, 5.7, 7.13, 0.91],
    hi: [-2.17, 59.53, 1.36],
    s0: [-116.23, 495640.63, 2.6, 0],
    s5: [38.87, 495590.42, 4.6, 0],
    burst: [0],
  },
  wait50: {
    body: [0, 1, 1, 0.98836],
    halo: 0.5,
    pts: [
      54.14, 0, 36.95, 42.13, 0, 55.72, -47.15, 27.22, -54.12, 0, -35.09, -40.02, 0, -52.03, 48.87,
      -20.24,
    ],
    shadow: 1,
    drop: [64.25, 5.7, 6.82, 0.92],
    hi: [-2.17, 61.77, 1.36],
    s0: [-116.23, 498811.87, 2.6, 0],
    s5: [38.87, 498761.66, 4.6, 0],
    burst: [0],
  },
  wait62: {
    body: [0, 1, 1, 0.98822],
    halo: 0.5,
    pts: [
      54.05, 0, 36.96, 42.15, 0, 55.83, -47.12, 27.2, -54.05, 0, -35.09, -40.01, 0, -52.07, 48.82,
      -20.22,
    ],
    shadow: 1,
    drop: [65.94, 5.7, 6.82, 0.73],
    hi: [-2.17, 63.46, 1.36],
    s0: [-116.23, 500719.47, 2.6, 0],
    s5: [38.87, 500669.26, 4.6, 0],
    burst: [0],
  },
  wait90: {
    body: [0, 1, 1, 0.99413],
    halo: 0.5,
    pts: [
      53.88, 0, 37.11, 42.31, 0, 56.29, -47.17, 27.23, -53.88, 0, -34.96, -39.86, 0, -51.96, 48.63,
      -20.14,
    ],
    shadow: 1,
    drop: [77.97, 5.7, 6.82, 0.27],
    hi: [-2.17, 75.49, 1.36],
    s0: [-116.23, 505184.69, 2.6, 0],
    s5: [38.87, 505134.48, 4.6, 0],
    burst: [0],
  },
};

const PICK = [0, 13, 24, 40, 48, 61, 72, 90];

const run = (sim: TropfenSim, secs: number, state: 'idle'): TropfenSim => {
  let s = sim;
  for (let i = 0; i < Math.round(secs * 60); i++) s = stepTropfen(s, 1 / 60, state);
  return s;
};

/** Within `tol` (the prototype writes two decimals). */
const near = (v: number, ref: number | undefined, tol: number, what: string): void => {
  expect(Math.abs(v - (ref ?? NaN)), `${what}: ${v} vs ${ref}`).toBeLessThanOrEqual(tol);
};

describe('the drop moves exactly like the prototype', () => {
  for (const [name, ref] of Object.entries(PROTOTYPE)) {
    it(name, () => {
      const m = /^([a-z]+)(\d+)$/.exec(name);
      const s = ORB_STATES.find((x) => x === m?.[1]);
      if (!s || !m) throw new Error('bad case');
      let sim = run(newTropfen('idle'), 1.5, 'idle');
      for (let i = 0; i < Number(m[2]); i++) sim = stepTropfen(sim, 0.016, s);
      const p = tropfenPose(sim, protoVoice(sim.t), TROPFEN_SPLASH);
      near(p.dy + (1 - p.sy) * ORB_R, ref.body[0], 0.006, 'lift');
      near(p.sx, ref.body[1], 0.0051, 'sx');
      near(p.sy, ref.body[2], 0.0051, 'sy');
      near(p.orb, ref.body[3], 0.00051, 'scale');
      near(p.halo, ref.halo, 0.0051, 'halo');
      PICK.forEach((j, i) => {
        const th = (j / TROPFEN_POINTS) * Math.PI * 2;
        const r = ORB_R * (p.k[j] ?? NaN);
        near(Math.cos(th) * r, ref.pts[i * 2], 0.006, `x${j}`);
        near(Math.sin(th) * r, ref.pts[i * 2 + 1], 0.006, `y${j}`);
      });
      near(p.shadowX, ref.shadow, 0.0051, 'shadow');
      near(p.dropY, ref.drop[0], 0.006, 'drop cy');
      near(p.dropRx, ref.drop[1], 0.006, 'drop rx');
      near(p.dropRy, ref.drop[2], 0.006, 'drop ry');
      near(p.dropOp, ref.drop[3], 0.0051, 'drop op');
      near(p.hiX, ref.hi[0], 0.006, 'hi cx');
      near(p.hiY, ref.hi[1], 0.006, 'hi cy');
      near(p.hiR, ref.hi[2], 0.006, 'hi r');
      for (const [i, drop] of [
        [0, ref.s0],
        [5, ref.s5],
      ] as const) {
        const o = i * 4;
        near(p.splash[o] ?? NaN, drop[0], 0.006, `splash ${i} x`);
        // Out of sight the prototype's droplets fall on without end (cy ≈ 5·10⁵): skip that.
        if ((drop[3] ?? 0) > 0) near(p.splash[o + 1] ?? NaN, drop[1], 0.006, `splash ${i} y`);
        near(p.splash[o + 2] ?? NaN, drop[2], 0.006, `splash ${i} r`);
        near(p.splash[o + 3] ?? NaN, drop[3], 0.0051, `splash ${i} op`);
      }
      const on = p.burstU > 0 && p.burstU < 1 && p.burstGate > 0.02;
      near(on ? p.burstGate : 0, ref.burst[0], 0.0051, 'shower');
      if (on) {
        const q = sparkles(TROPFEN_SPARKLES, 31)[0];
        if (!q) throw new Error('no sparkle');
        const b = burstPose(q, p.burstU, TROPFEN_BURST);
        near(b.x, ref.burst[1], 0.006, 'sparkle x');
        near(b.y, ref.burst[2], 0.006, 'sparkle y');
        near(b.rot, ref.burst[3], 0.006, 'sparkle rot');
        near(b.scale, ref.burst[4], 0.006, 'sparkle scale');
      }
    });
  }
});

describe('drop states', () => {
  it('hops, lands and wobbles out when happy, then rests as idle', () => {
    let sim = run(newTropfen('idle'), 1, 'idle');
    let top = 0;
    for (let i = 0; i < 60 * 3; i++) {
      sim = stepTropfen(sim, 1 / 60, 'happy');
      top = Math.min(top, tropfenPose(sim, 0, TROPFEN_SPLASH).dy);
    }
    expect(top).toBeLessThan(-18);
    expect(sim.w[0]).toBeGreaterThan(0.9);
    expect(TROPFEN_SETTLE).toBeGreaterThan(2.2);
  });

  it('leans towards her with her voice while listening', () => {
    const sim = stillTropfen('listen');
    const quiet = tropfenPose(sim, 0, 0).k;
    const loud = tropfenPose(sim, 1, 0).k;
    // The upper right (−45°) comes out, the lower left (135°) draws in; the ripples are
    // symmetric, so only the lean shows in the difference.
    const e = TROPFEN_POINTS / 8;
    const tilt = (k: number[]): number => (k[e * 7] ?? 0) - (k[e * 3] ?? 0);
    expect(tilt(loud) - tilt(quiet)).toBeCloseTo(0.08, 5);
    expect(tilt(quiet)).toBeGreaterThan(0.06);
  });

  it('shows the little drop only while waiting, hanging in the still', () => {
    expect(tropfenPose(stillTropfen('wait'), 0, 0).dropOp).toBeGreaterThan(0.9);
    for (const s of ORB_STATES)
      if (s !== 'wait') expect(tropfenPose(stillTropfen(s), 0, 0).dropOp).toBe(0);
  });

  it('a still pose is the same every time', () => {
    for (const s of ORB_STATES)
      expect(tropfenPose(stillTropfen(s), 0.3, 9)).toEqual(tropfenPose(stillTropfen(s), 0.3, 9));
  });

  it('writes the outline as a closed path of all its points', () => {
    const d = tropfenPath(tropfenPose(stillTropfen('think'), 0, 0).k);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.split('L')).toHaveLength(TROPFEN_POINTS);
  });

  it('keeps a speck round, gives avatars fewer droplets and sparkles', () => {
    expect(tropfenDetail(18).jelly).toBe(false);
    expect(tropfenDetail(40).jelly).toBe(true);
    expect(tropfenDetail(40).splash).toBeLessThan(tropfenDetail(200).splash);
    expect(tropfenDetail(40).sparkles).toBeLessThan(tropfenDetail(200).sparkles);
    expect(tropfenDetail(40).shadow).toBe(false);
  });
});
