import { describe, expect, it } from 'vitest';

import { ORB_R, ORB_STATES, orbitPt, sparkles, speech, type OrbState } from '../core.js';
import {
  HAPPY_SETTLE,
  PROTO_GHOSTS,
  PROTO_SPARKLES,
  effectiveState,
  moonDetail,
  moonPose,
  newMoon,
  newOrder,
  placeOrder,
  sparklePose,
  stepMoon,
  stillMoon,
  type MoonSim,
} from '../mond.js';

const run = (sim: MoonSim, state: OrbState, secs: number): MoonSim => {
  let s = sim;
  for (let i = 0; i < Math.round(secs * 60); i++) s = stepMoon(s, 1 / 60, state);
  return s;
};

describe('moon states', () => {
  it('blends into a new state with a 0.2 s time constant, never jumps', () => {
    const one = stepMoon(newMoon('idle'), 1 / 60, 'think');
    // One frame later only a little of "think" shows.
    expect(one.w[2]).toBeGreaterThan(0);
    expect(one.w[2]).toBeLessThan(0.1);
    const later = run(newMoon('idle'), 'think', 0.2);
    expect(later.w[2]).toBeCloseTo(1 - Math.exp(-1), 1);
    const settled = run(newMoon('idle'), 'think', 2);
    expect(settled.w[2]).toBeGreaterThan(0.99);
    expect(settled.w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('circles while idle and races while thinking', () => {
    const idle = run(newMoon('idle'), 'idle', 1);
    const think = run(newMoon('think'), 'think', 1);
    const idleTurn = idle.a - 0.9;
    const thinkTurn = think.a - 0.9;
    expect(idleTurn).toBeCloseTo((Math.PI * 2) / 9, 2);
    expect(thinkTurn).toBeGreaterThan(idleTurn * 5);
  });

  it('parks at the upper right, in front, while listening, waiting and speaking', () => {
    for (const state of ['listen', 'wait', 'speak'] as const) {
      const pose = moonPose(stillMoon(state, 2.6), 0.5, 0);
      expect(pose.x, state).toBeGreaterThan(40);
      expect(pose.y, state).toBeLessThan(-10);
      expect(pose.z, state).toBeGreaterThanOrEqual(0);
    }
  });

  it('glows brighter with her voice while listening', () => {
    const sim = stillMoon('listen', 2.6);
    const quiet = moonPose(sim, 0, 0);
    const loud = moonPose(sim, 1, 0);
    expect(loud.glow).toBeGreaterThan(quiet.glow + 0.5);
    expect(loud.scale).toBeGreaterThan(quiet.scale);
    expect(loud.orb).toBeGreaterThan(quiet.orb);
  });

  it('pings only while waiting', () => {
    const t = 0.1;
    const wait = moonPose({ ...stillMoon('wait', 2.6), t }, 0, 0);
    const idle = moonPose({ ...stillMoon('idle', 2.6), t }, 0, 0);
    expect(wait.pingOp).toBeGreaterThan(0.5);
    expect(idle.pingOp).toBe(0);
  });

  it('draws a trail while moving and none while parked', () => {
    const think = moonPose(stillMoon('think', 2.6), 0, 12);
    const listen = moonPose(stillMoon('listen', 2.6), 0, 12);
    expect(think.ghosts).toHaveLength(12 * 5);
    const ops = (g: number[]) => g.filter((_, i) => i % 5 === 4);
    expect(Math.max(...ops(think.ghosts))).toBeGreaterThan(0.3);
    expect(Math.max(...ops(listen.ghosts))).toBeLessThan(0.01);
  });

  it('passes behind the orb on the far side of its orbit and in front on the near side', () => {
    const near = orbitPt(Math.PI / 2, 80, 0.3);
    const far = orbitPt(-Math.PI / 2, 80, 0.3);
    expect(near.z).toBeGreaterThan(0);
    expect(far.z).toBeLessThan(0);
    // Where it changes sides it is outside the orb's outline, so the swap never shows.
    const side = orbitPt(0, 80, 0.3);
    expect(Math.hypot(side.x, side.y)).toBeGreaterThan(ORB_R + 8.6);
  });

  it('happy spirals up above the orb, bursts, and settles back to idle by itself', () => {
    let sim = run(newMoon('idle'), 'idle', 1);
    sim = stepMoon(sim, 1 / 60, 'happy');
    expect(sim.hT).toBeLessThan(0.05);
    sim = run(sim, 'happy', 1);
    const top = moonPose(sim, 0, 0);
    expect(top.y).toBeLessThan(-70);
    expect(Math.abs(top.x)).toBeLessThan(10);
    expect(top.z).toBe(1);
    expect(top.burstU).toBeGreaterThan(0);
    expect(top.burstU).toBeLessThan(1);
    sim = run(sim, 'happy', HAPPY_SETTLE);
    expect(effectiveState(sim)).toBe(0);
    sim = run(sim, 'happy', 2);
    expect(sim.w[0]).toBeGreaterThan(0.95);
  });

  it('a still pose is the same every time (reduce motion, icons)', () => {
    for (const s of ORB_STATES) {
      expect(moonPose(stillMoon(s, 2.6), 0.3, 4)).toEqual(moonPose(stillMoon(s, 2.6), 0.3, 4));
    }
  });

  it('stays within reach of the orb in every state', () => {
    for (const s of ORB_STATES) {
      let sim = newMoon('idle');
      for (let i = 0; i < 240; i++) {
        sim = stepMoon(sim, 1 / 60, s);
        const p = moonPose(sim, 1, 8);
        expect(Math.abs(p.x)).toBeLessThan(95);
        expect(p.y).toBeGreaterThan(-110);
        expect(p.y).toBeLessThan(60);
      }
    }
  });

  it('speaks in phrases with rests', () => {
    const values = Array.from({ length: 260 }, (_, i) => speech(i / 100));
    expect(Math.max(...values)).toBeGreaterThan(0.6);
    // The rest at the end of each 2.6 s phrase.
    expect(speech(2.3)).toBeLessThan(0.05);
  });

  it('sparkles spread all round and fade out', () => {
    const parts = sparkles(12);
    expect(parts).toHaveLength(12);
    const first = parts[0];
    if (!first) throw new Error('no sparkle');
    expect(sparklePose(first, 0).op).toBe(0);
    expect(sparklePose(first, 0.3).op).toBeGreaterThan(0.9);
    expect(sparklePose(first, 1).op).toBe(0);
  });
});

describe('moon detail by size', () => {
  it('has no moon on the tiniest orb, a simple one on avatars, the full one on large orbs', () => {
    expect(moonDetail(18).moon).toBe(false);
    const avatar = moonDetail(26);
    expect(avatar.moon).toBe(true);
    expect(avatar.reflection).toBe(false);
    expect(avatar.ghosts).toBeLessThan(moonDetail(200).ghosts);
    expect(moonDetail(72).reflection).toBe(true);
  });

  it('a large orb draws the prototype: its 12 trail dots, 14 sparkles, shadow and halo', () => {
    const full = moonDetail(200);
    expect(full.ghosts).toBe(PROTO_GHOSTS);
    expect(PROTO_GHOSTS).toBe(12);
    expect(full.sparkles).toBe(PROTO_SPARKLES);
    expect(PROTO_SPARKLES).toBe(14);
    expect(full.shadow && full.halo && full.reflection && full.ping).toBe(true);
    // Avatars keep the halo and shadow off (they sit in the chat, not on a stage).
    expect(moonDetail(26).halo).toBe(false);
  });
});

// The approved prototype (variant 1 "Mond", orb-varianten.html) is the reference
// (docs/DESIGN-BRIEF.md §Buddy's moon). These numbers were read from its SVG after
// jump('idle', 1.5), setState(state) and n steps of 16 ms: the orb's scale, the halo's
// opacity, the moon's translate and scale, and the first trail dot (cx, cy, r, opacity).
// The prototype writes two decimals (the orb's scale five).
const PROTOTYPE: Record<string, { orb: number; halo: number; moon: number[]; g0: number[] }> = {
  idle30: { orb: 1.00286, halo: 0.6, moon: [-44.79, 33.47, 1.09], g0: [-42.95, 33.36, 4.59, 0.16] },
  idle62: { orb: 0.99115, halo: 0.6, moon: [-63.63, 32.56, 1.06], g0: [-62.36, 32.79, 4.45, 0.16] },
  listen30: {
    orb: 1.01432,
    halo: 0.76,
    moon: [-59.56, -16.41, 1.15],
    g0: [-59.57, -16.4, 3.87, 0],
  },
  listen62: { orb: 1.02677, halo: 0.86, moon: [68.39, -49.93, 1.33], g0: [68.39, -49.93, 4.08, 0] },
  think30: {
    orb: 0.99402,
    halo: 0.51,
    moon: [-69.87, 10.08, 0.86],
    g0: [-73.71, 16.33, 4.06, 0.7],
  },
  think62: {
    orb: 0.99658,
    halo: 0.5,
    moon: [71.87, -27.89, 0.88],
    g0: [66.09, -31.64, 4.02, 0.74],
  },
  wait30: { orb: 0.99285, halo: 0.51, moon: [-59.56, -13.36, 0.96], g0: [-59.57, -10.94, 3.87, 0] },
  wait62: { orb: 0.98822, halo: 0.5, moon: [68.39, -46.94, 1.02], g0: [68.39, -43.97, 4.08, 0] },
  speak30: { orb: 1.00432, halo: 0.68, moon: [-57.88, -14.59, 1], g0: [-59.57, -14.58, 3.87, 0] },
  speak62: { orb: 0.99994, halo: 0.65, moon: [70.92, -47.94, 1.02], g0: [68.39, -47.94, 4.08, 0] },
  happy30: {
    orb: 0.98595,
    halo: 0.92,
    moon: [-21.89, -38.34, 1.3],
    g0: [-62.89, 33.68, 4.46, 0.05],
  },
  happy62: { orb: 0.99776, halo: 0.95, moon: [-0.5, -83.34, 1.54], g0: [-73.74, 12.91, 3.98, 0] },
};

/** The prototype's stand-in for her voice while listening. */
function protoVoice(t: number): number {
  const a = Math.max(0, Math.sin(t * 3.1)) * (0.6 + 0.4 * Math.sin(t * 7.3 + 0.5));
  return Math.min(1, Math.max(0, 0.18 + 0.62 * a + 0.12 * Math.sin(t * 13.1) * Math.sin(t * 2.2)));
}

describe('the moon moves exactly like the prototype', () => {
  for (const s of ORB_STATES) {
    for (const n of [30, 62]) {
      it(`${s} after ${n} frames`, () => {
        const ref = PROTOTYPE[`${s}${n}`];
        if (!ref) throw new Error('no reference');
        let sim = stillMoon('idle', 1.5);
        // The prototype's jump() renders once more than it steps: one more idle turn.
        sim = { ...sim, a: sim.a + (1 / 60) * ((Math.PI * 2) / 9) };
        for (let i = 0; i < n; i++) sim = stepMoon(sim, 0.016, s);
        const p = moonPose(sim, protoVoice(sim.t), 12);
        expect(p.orb).toBeCloseTo(ref.orb, 4);
        expect(p.halo).toBeCloseTo(ref.halo, 2);
        expect(p.x).toBeCloseTo(ref.moon[0] ?? NaN, 1);
        expect(p.y).toBeCloseTo(ref.moon[1] ?? NaN, 1);
        expect(p.scale).toBeCloseTo(ref.moon[2] ?? NaN, 1);
        const g = p.ghosts;
        expect(g[0]).toBeCloseTo(ref.g0[0] ?? NaN, 1);
        expect(g[1]).toBeCloseTo(ref.g0[1] ?? NaN, 1);
        expect(g[3]).toBeCloseTo(ref.g0[2] ?? NaN, 1);
        expect(g[4]).toBeCloseTo(ref.g0[3] ?? NaN, 1);
      });
    }
  }
});

// Which part lies on top: the prototype's SVG node order in its two groups (0 the moon,
// 1 the ping, 2… the trail), read after jump('idle', 1.5), setState and n steps of 16 ms.
const PROTOTYPE_ORDER: Record<string, { front: number[]; back: number[] }> = {
  think19: { front: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], back: [] },
  think70: { front: [0, 1, 2, 3], back: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  think140: { front: [], back: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  happy19: { front: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], back: [] },
  happy70: { front: [1, 0, 11, 12, 13], back: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  happy140: { front: [], back: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 1] },
  wait19: { front: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], back: [] },
  wait70: { front: [], back: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  wait140: { front: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], back: [] },
};

describe("the moon's parts overlap as in the prototype", () => {
  for (const [key, ref] of Object.entries(PROTOTYPE_ORDER)) {
    it(key, () => {
      const state = key.replace(/\d+$/, '') as OrbState;
      const n = Number(key.slice(state.length));
      let sim = stillMoon('idle', 1.5);
      // jump() places twice (its last two renders), the second one step further on.
      let order = placeOrder(newOrder(12), moonPose(sim, 0.5, 12));
      sim = { ...sim, a: sim.a + (1 / 60) * ((Math.PI * 2) / 9) };
      order = placeOrder(order, moonPose(sim, 0.5, 12));
      for (let i = 0; i < n; i++) {
        sim = stepMoon(sim, 0.016, state);
        order = placeOrder(order, moonPose(sim, protoVoice(sim.t), 12));
      }
      const side = (front: boolean) =>
        order.seq
          .map((q, k) => ({ q, k }))
          .filter(({ k }) => order.front[k] === front)
          .sort((a, b) => a.q - b.q)
          .map(({ k }) => k);
      expect(side(true)).toEqual(ref.front);
      expect(side(false)).toEqual(ref.back);
    });
  }
});
