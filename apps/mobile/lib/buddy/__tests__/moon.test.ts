import { describe, expect, it } from 'vitest';

import {
  HAPPY_SETTLE,
  MOON_STATES,
  ORB_R,
  effectiveState,
  moonDetail,
  moonForReply,
  moonForTalk,
  moonPose,
  newMoon,
  orbitPt,
  sparklePose,
  sparkles,
  speech,
  stepMoon,
  stillMoon,
  talkMode,
  type MoonSim,
  type MoonState,
} from '../moon.js';

const run = (sim: MoonSim, state: MoonState, secs: number): MoonSim => {
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
    const think = moonPose(stillMoon('think', 2.6), 0, 8);
    const listen = moonPose(stillMoon('listen', 2.6), 0, 8);
    expect(think.ghosts).toHaveLength(8 * 5);
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
    for (const s of MOON_STATES) {
      expect(moonPose(stillMoon(s, 2.6), 0.3, 4)).toEqual(moonPose(stillMoon(s, 2.6), 0.3, 4));
    }
  });

  it('stays within reach of the orb in every state', () => {
    for (const s of MOON_STATES) {
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
});

describe('app states → moon states', () => {
  it('talk mode', () => {
    expect(moonForTalk('idle')).toBe('idle');
    expect(moonForTalk('listening')).toBe('listen');
    expect(moonForTalk('thinking')).toBe('think');
    expect(moonForTalk('waiting')).toBe('wait');
    expect(moonForTalk('speaking')).toBe('speak');
  });

  const base = {
    phase: 'paused' as const,
    hearing: false,
    transcribing: false,
    voiceLoading: false,
    trouble: false,
  };
  it('talk phases', () => {
    expect(talkMode({ ...base, phase: 'thinking' })).toBe('thinking');
    expect(talkMode({ ...base, phase: 'listening', transcribing: true })).toBe('thinking');
    // Buddy's voice for the sentence is still on its way: he is still thinking.
    expect(talkMode({ ...base, phase: 'speaking', voiceLoading: true })).toBe('thinking');
    expect(talkMode({ ...base, phase: 'speaking' })).toBe('speaking');
    expect(talkMode({ ...base, phase: 'listening', hearing: true })).toBe('listening');
    // Her turn: Buddy waits for her.
    expect(talkMode(base)).toBe('waiting');
    // Something went wrong: Buddy just rests (no "your turn" ping over an error).
    expect(talkMode({ ...base, trouble: true })).toBe('idle');
    expect(talkMode({ ...base, phase: 'listening' })).toBe('idle');
  });

  it('a reply celebrates only a right answer that arrives now', () => {
    expect(moonForReply({ fresh: true, afterCorrect: true })).toBe('happy');
    expect(moonForReply({ fresh: false, afterCorrect: true })).toBe('idle');
    expect(moonForReply({ fresh: true, afterCorrect: false })).toBe('idle');
  });
});
