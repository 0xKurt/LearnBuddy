import { describe, expect, it } from 'vitest';

import { burstPose, sparkles, type OrbState } from '../core.js';
import {
  BEAM_ENTRY,
  BEAM_START,
  FAN_EXIT,
  PRISMA,
  PRISMA_BURST,
  newPrisma,
  prismaDetail,
  stepPrisma,
  wedgePath,
  wedgePoints,
  type PrismaPose,
  type PrismaSim,
} from '../prisma.js';
import { protoVoice } from './proto.js';

type Ref = {
  orb: number;
  halo: number;
  fan0: number[];
  fan1: number[];
  beam: number[];
  caus: number[];
  burst: number[];
};

// The prototype is the reference: round 2 variant E "Prisma" (orb-varianten-2.html). Read
// from its SVG after jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's
// scale, the halo's opacity; fans 0 and 1: opacity, the centre and radius of their fading
// light (cx, cy, r) and the corners of rays 0 and 5; the beam: opacity, its four corners and
// its gradient's ends (x1, y1, x2, y2); the caustic's turn and opacity; the shower's opacity
// and its first sparkle (translate, rotation, scale, opacity). Two decimals.
const REF: Record<string, Ref> = {
  idle30: {
    orb: 1.00286,
    halo: 0.6,
    fan0: [
      0.85, 38.71, 34.72, 72, 33.31, 25.17, 105.52, 61.56, 101.61, 69.77, 28.63, 30.38, 79.78,
      93.86, 72, 98.56,
    ],
    fan1: [
      0, -49.42, 16.17, 68.4, -38.45, 16.26, -103.24, 58.38, -108.13, 51.26, -40.63, 9.61, -117.59,
      21.86, -117.76, 13.23,
    ],
    beam: [
      0.25, -90.73, -62.2, -40.89, -30.59, -43.79, -26.28, -91.89, -60.47, -91.31, -61.33, -42.34,
      -28.44,
    ],
    caus: [153.89, 0.75],
    burst: [0],
  },
  idle62: {
    orb: 0.99115,
    halo: 0.6,
    fan0: [
      0.85, 38.34, 35.13, 72, 33.03, 25.53, 104.85, 62.69, 100.85, 70.85, 28.3, 30.69, 78.77, 94.71,
      70.94, 99.33,
    ],
    fan1: [
      0, -49.59, 15.63, 68.4, -38.62, 15.84, -103.86, 57.27, -108.68, 50.1, -40.73, 9.17, -117.81,
      20.6, -117.9, 11.96,
    ],
    beam: [
      0.25, -90.06, -63.17, -40.56, -31.03, -43.5, -26.75, -91.24, -61.45, -90.65, -62.31, -42.03,
      -28.89,
    ],
    caus: [154.5, 0.75],
    burst: [0],
  },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    fan0: [
      0.53, 40.78, 32.27, 54.3, 34.79, 23.07, 90.1, 54.97, 87.88, 59.28, 30.45, 28.56, 77.5, 72.26,
      73.79, 75.38,
    ],
    fan1: [
      0, -48.33, 19.18, 51.58, -37.37, 18.6, -90.44, 48.98, -92.93, 45.1, -39.96, 12.09, -98.68,
      30.4, -99.48, 25.86,
    ],
    beam: [
      0.68, -94.34, -56.59, -42.54, -28.28, -45.48, -23.26, -95.51, -54.58, -94.92, -55.59, -44.01,
      -25.77,
    ],
    caus: [150.35, 0.64],
    burst: [0],
  },
  listen62: {
    orb: 1.02677,
    halo: 0.86,
    fan0: [
      0.5, 40.96, 32.04, 54.36, 34.92, 22.87, 90.23, 55, 88.08, 59.14, 30.61, 28.39, 78.22, 71.62,
      74.69, 74.67,
    ],
    fan1: [
      0, -48.22, 19.45, 51.64, -37.27, 18.81, -90.52, 49.09, -92.91, 45.35, -39.89, 12.32, -98.49,
      31.31, -99.32, 26.95,
    ],
    beam: [
      1, -94.42, -56.45, -42.13, -29.03, -46.18, -22.02, -96.04, -53.65, -95.23, -55.05, -44.15,
      -25.52,
    ],
    caus: [150.03, 0.63],
    burst: [0],
  },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    fan0: [
      0.85, 8.47, 51.31, 66.54, 10.23, 40.48, 37.36, 111.25, 30.9, 113.95, 3.32, 41.61, 6.68,
      117.83, -0.3, 117.27,
    ],
    fan1: [
      0, -48.67, -18.32, 63.22, -40.17, -11.38, -111.71, -23.03, -110.86, -29.62, -37.7, -17.93,
      -102.54, -51.39, -98.77, -56.86,
    ],
    beam: [
      0.16, -31.84, -105.29, -12.74, -49.45, -17.71, -47.9, -33.83, -104.67, -32.84, -104.98,
      -15.22, -48.67,
    ],
    caus: [192.63, 0.75],
    burst: [0],
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    fan0: [
      0.85, -44.56, 26.8, 66.04, -33.85, 24.44, -89.56, 75.13, -94.31, 70.24, -37.45, 18.44,
      -106.49, 49.75, -108.53, 43.24,
    ],
    fan1: [
      0, -0.92, -51.99, 62.74, -4.24, -41.53, -19.32, -111.98, -13.04, -113.55, 2.76, -41.66, 9.61,
      -113.84, 15.93, -112.43,
    ],
    beam: [
      0.15, 86.12, -68.45, 41.26, -30.09, 37.99, -34.13, 84.81, -70.06, 85.46, -69.25, 39.62,
      -32.11,
    ],
    caus: [260.98, 0.75],
    burst: [0],
  },
  wait30: {
    orb: 0.99285,
    halo: 0.51,
    fan0: [
      0.44, 40.78, 32.27, 47.21, 34.79, 23.07, 81.21, 56.64, 79.88, 58.72, 30.45, 28.56, 75.19,
      64.58, 73.45, 66.33,
    ],
    fan1: [
      0, -48.33, 19.18, 44.85, -37.37, 18.6, -87.59, 40.87, -88.67, 38.79, -39.96, 12.09, -91.26,
      32.14, -91.88, 29.88,
    ],
    beam: [
      0.16, -94.4, -56.48, -42.7, -28.02, -45.32, -23.53, -95.45, -54.69, -94.92, -55.59, -44.01,
      -25.77,
    ],
    caus: [150.35, 0.65],
    burst: [0],
  },
  wait62: {
    orb: 0.98822,
    halo: 0.5,
    fan0: [
      0.41, 40.96, 32.04, 44.93, 34.92, 22.87, 79.09, 55.8, 77.97, 57.51, 30.61, 28.39, 74.3, 62.16,
      72.89, 63.64,
    ],
    fan1: [
      0, -48.22, 19.45, 42.68, -37.27, 18.81, -85.89, 39.54, -86.76, 37.8, -39.89, 12.32, -88.84,
      32.57, -89.39, 30.71,
    ],
    beam: [
      0.15, -94.71, -55.95, -42.85, -27.78, -45.45, -23.27, -95.75, -54.15, -95.23, -55.05, -44.15,
      -25.52,
    ],
    caus: [150.03, 0.64],
    burst: [0],
  },
  speak30: {
    orb: 1.00432,
    halo: 0.68,
    fan0: [
      0.74, 40.78, 32.27, 65.83, 34.79, 23.07, 102.92, 53.98, 99.84, 61.33, 30.45, 28.56, 82.13,
      83.48, 75.64, 88.1,
    ],
    fan1: [
      0, -48.33, 19.18, 62.53, -37.37, 18.6, -95.71, 59.99, -100.3, 53.97, -39.96, 12.09, -110.11,
      28.88, -110.83, 21.35,
    ],
    beam: [
      0.2, -94.4, -56.48, -42.7, -28.02, -45.32, -23.53, -95.45, -54.69, -94.92, -55.59, -44.01,
      -25.77,
    ],
    caus: [150.35, 0.75],
    burst: [0],
  },
  speak62: {
    orb: 0.99994,
    halo: 0.65,
    fan0: [
      0.68, 40.96, 32.04, 62.07, 34.92, 22.87, 99.64, 52.27, 96.78, 59.18, 30.61, 28.39, 80.27,
      80.07, 74.21, 84.45,
    ],
    fan1: [
      0, -48.22, 19.45, 58.97, -37.27, 18.81, -92.74, 58.12, -97.07, 52.48, -39.89, 12.32, -106.42,
      28.98, -107.14, 21.91,
    ],
    beam: [
      0.2, -94.71, -55.95, -42.85, -27.78, -45.45, -23.27, -95.75, -54.15, -95.23, -55.05, -44.15,
      -25.52,
    ],
    caus: [150.03, 0.75],
    burst: [0],
  },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    fan0: [
      0.94, -3.01, 51.91, 75.64, 1.09, 41.73, 21, 123.64, 10.98, 126.25, -5.9, 41.33, -26.2, 123.9,
      -35.81, 120.06,
    ],
    fan1: [
      0.85, -43.45, -28.56, 71.86, -36.69, -19.92, -113.87, -42.88, -111.25, -52.36, -32.84, -25.77,
      -91.67, -81.84, -83.94, -87.92,
    ],
    beam: [
      0.3, -7.95, -109.72, -1.57, -51.04, -6.76, -50.62, -10.02, -109.55, -8.99, -109.63, -4.17,
      -50.83,
    ],
    caus: [205.31, 0.78],
    burst: [0.91, 75.61, -0.02, -28.31, 4.69, 1],
  },
  happy62: {
    orb: 0.99776,
    halo: 0.95,
    fan0: [
      0.95, -51.96, -2.06, 75.97, -41.71, 1.85, -123.48, 23.58, -126.32, 13.5, -41.43, -5.14,
      -124.64, -24.17, -120.91, -33.95,
    ],
    fan1: [
      0.94, 27.76, -43.97, 72.17, 19.25, -37.04, 40.64, -114.99, 50.28, -112.54, 25.17, -33.31,
      80.48, -93.26, 86.75, -85.55,
    ],
    beam: [
      0.3, 109.55, -9.96, 51, -2.51, 50.48, -7.68, 109.35, -12.03, 109.45, -10.99, 50.74, -5.1,
    ],
    caus: [294.27, 0.78],
    burst: [0.99, 94.65, 2.84, -91.32, 2.84, 0.95],
  },
  happy80: {
    orb: 1.00051,
    halo: 0.95,
    fan0: [
      0.95, -30.64, -42.02, 75.99, -27.34, -31.55, -95.15, -82.18, -89.01, -90.67, -21.68, -35.67,
      -58.41, -112.75, -48.42, -115.9,
    ],
    fan1: [
      0.95, 51.71, -5.53, 72.19, 40.99, -7.9, 115.39, -39.52, 119.46, -30.44, 41.74, -0.94, 123.09,
      5.23, 120.94, 14.94,
    ],
    beam: [0.3, 75.8, 79.72, 33.62, 38.43, 37.36, 34.82, 77.3, 78.27, 76.55, 78.99, 35.49, 36.62],
    caus: [345.9, 0.78],
    burst: [1, 97.44, 5.85, -126.77, 1.74, 0.37],
  },
};
const SPARKLES = sparkles(16, 91);
const rad = (d: number) => (d * Math.PI) / 180;
const angle = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** A point of a fan's own frame (wedgePoints) in the orb's frame, as the renderer places it. */
function fanToOrb(ang: number, L: number, x: number, y: number): [number, number] {
  const a = rad(ang);
  const lx = FAN_EXIT + x * L;
  const ly = y * L;
  return [lx * Math.cos(a) - ly * Math.sin(a), lx * Math.sin(a) + ly * Math.cos(a)];
}

function checkFan(p: PrismaPose, k: number, want: number[], name: string): void {
  const [ang = 0, spread = 0, L = 0, op = 0] = p.fans.slice(k * 4, k * 4 + 4);
  expect(op, `${name} opacity`).toBeCloseTo(want[0] ?? NaN, 1);
  const c = fanToOrb(ang, L, 0, 0);
  expect(c[0], `${name} cx`).toBeCloseTo(want[1] ?? NaN, 1);
  expect(c[1], `${name} cy`).toBeCloseTo(want[2] ?? NaN, 1);
  expect(L, `${name} r`).toBeCloseTo(want[3] ?? NaN, 1);
  [0, 5].forEach((i, j) => {
    const w = wedgePoints(i, spread, L);
    for (let q = 0; q < 3; q++) {
      const pt = fanToOrb(ang, L, w[q * 2] ?? 0, w[q * 2 + 1] ?? 0);
      expect(pt[0], `${name} ray ${i} x${q}`).toBeCloseTo(want[4 + j * 6 + q * 2] ?? NaN, 1);
      expect(pt[1], `${name} ray ${i} y${q}`).toBeCloseTo(want[5 + j * 6 + q * 2] ?? NaN, 1);
    }
  });
}

function check(p: PrismaPose, ref: Ref): void {
  expect(p.orb).toBeCloseTo(ref.orb, 4);
  expect(p.halo).toBeCloseTo(ref.halo, 2);
  checkFan(p, 0, ref.fan0, 'fan 0');
  checkFan(p, 1, ref.fan1, 'fan 1');
  // The beam in its frame (beamPath): x from the centre towards where it comes from.
  const b = rad(p.beamAng);
  const at = (x: number, y: number) => [
    x * Math.cos(b) - y * Math.sin(b),
    x * Math.sin(b) + y * Math.cos(b),
  ];
  const n = p.beamW;
  const corners = [
    ...at(BEAM_START, n * 0.4),
    ...at(BEAM_ENTRY, n),
    ...at(BEAM_ENTRY, -n),
    ...at(BEAM_START, -n * 0.4),
    ...at(BEAM_START, 0),
    ...at(BEAM_ENTRY, 0),
  ];
  expect(p.beamOp, 'beam opacity').toBeCloseTo(ref.beam[0] ?? NaN, 1);
  corners.forEach((v, i) => expect(v, `beam ${i}`).toBeCloseTo(ref.beam[i + 1] ?? NaN, 1));
  expect(angle(p.causRot - (ref.caus[0] ?? 0)), 'caustic turn').toBeCloseTo(0, 1);
  expect(p.causOp, 'caustic opacity').toBeCloseTo(ref.caus[1] ?? NaN, 1);
  const on = p.burstU > 0 && p.burstU < 1 && p.burstGate > 0.02;
  expect(on ? p.burstGate : 0, 'shower').toBeCloseTo(ref.burst[0] ?? NaN, 1);
  const q = SPARKLES[0];
  if (on && q) {
    const s = burstPose(q, p.burstU, PRISMA_BURST);
    [s.x, s.y].forEach((v, i) => expect(v, `sparkle ${i}`).toBeCloseTo(ref.burst[i + 1] ?? NaN, 1));
    expect(angle(s.rot - (ref.burst[3] ?? 0)), 'sparkle rot').toBeCloseTo(0, 0);
    expect(s.scale, 'sparkle scale').toBeCloseTo(ref.burst[4] ?? NaN, 1);
    expect(s.op, 'sparkle opacity').toBeCloseTo(ref.burst[5] ?? NaN, 1);
  }
}

/** The prototype's jump('idle', 1.5) (idle does not turn, so its extra render moves nothing). */
function afterJump(): PrismaSim {
  let sim = newPrisma('idle');
  for (let i = 0; i < 90; i++) sim = stepPrisma(sim, 1 / 60, 'idle');
  return sim;
}

describe('"prisma" moves exactly like the prototype', () => {
  for (const [key, ref] of Object.entries(REF)) {
    it(key, () => {
      const state = key.replace(/\d+$/, '') as OrbState;
      const n = Number(key.slice(state.length));
      let sim = afterJump();
      for (let i = 0; i < n; i++) sim = stepPrisma(sim, 0.016, state);
      check(PRISMA.pose(sim, protoVoice(sim.t), prismaDetail(200)), ref);
    });
  }
});

describe('prism', () => {
  it('turns like a lighthouse while thinking and sends three fans when happy', () => {
    let sim = PRISMA.start('idle');
    const before = PRISMA.pose(sim, 0.5, prismaDetail(200)).fans[0] ?? 0;
    for (let i = 0; i < 60; i++) sim = stepPrisma(sim, 1 / 60, 'think');
    const after = PRISMA.pose(sim, 0.5, prismaDetail(200)).fans[0] ?? 0;
    expect(after - before).toBeGreaterThan(60);
    sim = PRISMA.start('idle');
    for (let i = 0; i < 60; i++) sim = stepPrisma(sim, 1 / 60, 'happy');
    const happy = PRISMA.pose(sim, 0.5, prismaDetail(200));
    expect(happy.fans[7]).toBeGreaterThan(0.5);
    expect(happy.fans[11]).toBeGreaterThan(0.5);
    for (let i = 0; i < 60 * 2; i++) sim = stepPrisma(sim, 1 / 60, 'happy');
    expect(sim.w[0]).toBeGreaterThan(0.9);
  });

  it('draws each ray as a closed triangle whose light ends at the fan length', () => {
    const d = wedgePath(2, 20, 72);
    expect(d).toMatch(/^M[-\d.e]+ [-\d.e]+L[-\d.e]+ [-\d.e]+L[-\d.e]+ [-\d.e]+Z$/);
    const w = wedgePoints(5, 20, 72);
    expect(Math.hypot(w[2] ?? 0, w[3] ?? 0)).toBeCloseTo(1, 5);
  });

  it('a still pose is the same every time', () => {
    for (const s of ['idle', 'listen', 'think', 'wait', 'speak', 'happy'] as const)
      expect(PRISMA.pose(PRISMA.still(s), 0.3, prismaDetail(200))).toEqual(
        PRISMA.pose(PRISMA.still(s), 0.3, prismaDetail(200)),
      );
  });

  it('draws nothing on the tiniest orb and fewer sparkles on avatars', () => {
    expect(prismaDetail(18).prism).toBe(false);
    expect(prismaDetail(26).prism).toBe(true);
    expect(prismaDetail(26).sparkles).toBeLessThan(prismaDetail(200).sparkles);
    expect(prismaDetail(26).shadow).toBe(false);
  });
});
