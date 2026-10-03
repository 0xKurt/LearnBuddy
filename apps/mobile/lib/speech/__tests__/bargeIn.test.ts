// Barge-in (issue #35): her voice stops Buddy, his own echo never does. The gate only ever
// sees levels; these are the shapes a level takes on the way.

import { describe, expect, it } from 'vitest';

import { BargeGate, CALIBRATE_MS, MAX_GAP_MS, MIN_DB, MIN_SPEECH_MS, rmsDb } from '../bargeIn.js';

const FRAME = 50;

/** Feeds `ms` of frames from `level(t)`; returns the time (ms) the gate fired, or null. */
function run(
  gate: BargeGate,
  from: number,
  ms: number,
  level: (t: number) => number,
  playing = true,
): number | null {
  let fired: number | null = null;
  for (let t = from; t < from + ms; t += FRAME) {
    if (gate.observe(level(t), t, playing) && fired === null) fired = t;
  }
  return fired;
}

/** Buddy's residue after echo cancellation: syllables between −60 and −48 dBFS. */
const residue = (t: number) => (Math.floor(t / 150) % 2 === 0 ? -48 : -60);
/** Her voice close to the phone: syllables around −25 dBFS with short dips. */
const her = (t: number) => (t % 300 < 250 ? -25 : -50);

describe('BargeGate', () => {
  it('never fires while calibrating, however loud', () => {
    const gate = new BargeGate();
    expect(run(gate, 0, CALIBRATE_MS - FRAME, () => -10)).toBeNull();
  });

  it('never fires on his own residue, however long he speaks', () => {
    const gate = new BargeGate();
    expect(run(gate, 0, 60_000, residue)).toBeNull();
  });

  it('fires when she talks over him — after enough loud time, not on the first frame', () => {
    const gate = new BargeGate();
    expect(run(gate, 0, 2000, residue)).toBeNull();
    const at = run(gate, 2000, 2000, her);
    expect(at).not.toBeNull();
    expect(at! - 2000).toBeGreaterThanOrEqual(MIN_SPEECH_MS - FRAME);
    expect(at! - 2000).toBeLessThan(600);
  });

  it('fires once', () => {
    const gate = new BargeGate();
    run(gate, 0, 2000, residue);
    run(gate, 2000, 1000, her);
    expect(run(gate, 3000, 1000, her)).toBeNull();
  });

  it('ignores short bursts: a click, a cough, the fake microphone beep', () => {
    const gate = new BargeGate();
    run(gate, 0, 2000, residue);
    // 100 ms loud every 500 ms: the gaps are longer than MAX_GAP_MS, each burst stands alone.
    const bursts = (t: number) => (t % 500 < 100 ? -15 : residue(t));
    expect(run(gate, 2000, 10_000, bursts)).toBeNull();
  });

  it('carries a candidate over dips between syllables, not over a real pause', () => {
    const dip = new BargeGate();
    run(dip, 0, 2000, residue);
    // 150 ms loud, 150 ms quiet: dips under MAX_GAP_MS keep the candidate.
    expect(MAX_GAP_MS).toBeGreaterThan(150);
    expect(run(dip, 2000, 1500, (t) => (t % 300 < 150 ? -25 : -60))).not.toBeNull();

    const pause = new BargeGate();
    run(pause, 0, 2000, residue);
    // 150 ms loud, 400 ms quiet: every word stands alone.
    expect(run(pause, 2000, 5000, (t) => (t % 550 < 150 ? -25 : -60))).toBeNull();
  });

  it('a loud echo (weak cancellation) raises the bar: she must speak up, he never trips it', () => {
    const gate = new BargeGate();
    const loudEcho = (t: number) => (Math.floor(t / 150) % 2 === 0 ? -22 : -34);
    expect(run(gate, 0, 30_000, loudEcho)).toBeNull();
    expect(gate.threshold()).toBeGreaterThanOrEqual(-22 + 10);
    // Speaking at her normal level does not stop him here — the tap still does.
    expect(run(gate, 30_000, 2000, her)).toBeNull();
    // Speaking clearly louder than him does.
    expect(run(gate, 32_000, 2000, (t) => (t % 300 < 250 ? -6 : -40))).not.toBeNull();
  });

  it('a quiet room does not make the bar trivially low', () => {
    const gate = new BargeGate();
    run(gate, 0, 2000, () => -90);
    expect(gate.threshold()).toBe(MIN_DB);
    // Someone talking across the room (−50 dBFS) is not her talking to Buddy.
    expect(run(gate, 2000, 3000, () => -50)).toBeNull();
  });

  it('only counts while his voice really sounds: silence between sentences is not calibration', () => {
    const gate = new BargeGate();
    // The next sentence is still on its way: nothing learned, nothing counted.
    expect(run(gate, 0, 5000, () => -20, false)).toBeNull();
    expect(gate.threshold()).toBeNull();
    // A candidate does not span a gap in his voice.
    run(gate, 5000, 2000, residue);
    run(gate, 7000, MIN_SPEECH_MS - 2 * FRAME, () => -20);
    run(gate, 7300, 1000, residue, false);
    expect(run(gate, 8300, FRAME, () => -20)).toBeNull();
  });

  it('her loud frames are never learned as residue (the bar does not climb while she talks)', () => {
    const gate = new BargeGate();
    run(gate, 0, 2000, residue);
    const before = gate.threshold();
    // Short bursts (no fire) at her level, repeatedly.
    run(gate, 2000, 6000, (t) => (t % 600 < 100 ? -20 : residue(t)));
    expect(gate.threshold()).toBe(before);
  });

  it('a stalled app (a long gap between frames) is no continuous loud stretch', () => {
    const gate = new BargeGate();
    run(gate, 0, 2000, residue);
    expect(gate.observe(-20, 2000, true)).toBe(false);
    expect(gate.observe(-20, 4000, true)).toBe(false);
  });
});

describe('rmsDb', () => {
  it('reads silence as −160 and full scale as 0', () => {
    expect(rmsDb([])).toBe(-160);
    expect(rmsDb([0, 0, 0])).toBe(-160);
    expect(rmsDb([1, -1, 1, -1])).toBeCloseTo(0);
  });

  it('halving the amplitude is −6 dB', () => {
    expect(rmsDb([0.5, -0.5])).toBeCloseTo(-6.02, 1);
  });
});
