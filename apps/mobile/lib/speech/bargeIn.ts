// Barge-in (issue #35): she starts talking while Buddy speaks — he stops and listens.
// Pure and unit-tested: this decides whether what the microphone hears is HER, and it must
// never be Buddy's own voice coming back from the speaker.
//
// This gate only sees LEVELS (dBFS). The legacy bargeMonitor retains no audio; Android's
// continuous recorder retains an onset buffer through the same echo-cancelled source and
// only delivers an utterance after this gate identifies her (continuousTurns.ts).
//
// Two layers keep his voice out:
// 1. The platform's echo cancellation removes most of it before we see a level (the browser's
//    `echoCancellation`, Android's VOICE_COMMUNICATION source). What it leaves is the residue.
// 2. This gate. It first LEARNS how loud that residue is while he speaks (`CALIBRATE_MS`),
//    keeps learning from everything that is not a candidate, and only counts a frame as her
//    voice when it is clearly louder than the loud end of the residue (`MARGIN_DB` over its
//    90th percentile) and loud in absolute terms (`MIN_DB`). Then it needs that for long
//    enough (`MIN_SPEECH_MS` of loud frames, dips between syllables up to `MAX_GAP_MS`): a
//    cough, a tap on the table, the fake microphone's 20 ms beep never get there.
// Where echo cancellation is weak, his residue is loud, the threshold rises with it and she
// has to speak up — a missed barge-in, never a false one. The tap on Buddy always works.
//
// Only frames while his voice really sounds count (`playing`): while the next sentence is
// still on its way the level means nothing about echo, and calibrating on silence would set
// the bar so low that his first loud syllable could pass it.

import { NoiseFloor } from './noiseFloor.js';
export { CALIBRATE_MS } from './noiseFloor.js';
/** Her voice must stand this far above the loud end of his residue. */
const MARGIN_DB = 10;
/** …and above this in any case: quieter is the room, not someone talking to the phone. */
export const MIN_DB = -42;
/** Loud time a candidate needs before it is her (syllables, not a click). */
export const MIN_SPEECH_MS = 300;
/** A quieter stretch this long between loud frames still belongs to the same candidate. */
export const MAX_GAP_MS = 200;
/** Frames further apart than this (the app was busy) are not a continuous stretch. */
const MAX_FRAME_MS = 250;

/** The level of a block of samples (−1…1) as dBFS; silence is −160 like expo-audio's metering. */
export function rmsDb(samples: ArrayLike<number>): number {
  if (samples.length === 0) return -160;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(-160, 20 * Math.log10(rms)) : -160;
}

export class BargeGate {
  private readonly noise = new NoiseFloor(MIN_DB, MARGIN_DB);
  private last: number | null = null;
  private loudMs = 0;
  private quietMs = 0;
  private fired = false;

  /** The level a frame must reach to count as her voice right now (null while calibrating). */
  threshold(): number | null {
    return this.noise.threshold();
  }

  /**
   * One level reading. `playing` = Buddy's voice really sounds right now. Returns true exactly
   * once: the moment she is talking over him.
   */
  observe(db: number, at: number, playing: boolean): boolean {
    if (this.fired) return false;
    const step = this.last === null ? 0 : at - this.last;
    this.last = at;
    if (!playing || !Number.isFinite(db)) {
      // Between sentences the level says nothing about his echo: a candidate does not span it.
      this.loudMs = 0;
      this.quietMs = 0;
      return false;
    }
    const dt = step > 0 && step <= MAX_FRAME_MS ? step : 0;
    const bar = this.threshold();
    this.noise.observe(db, at, dt, bar === null || db < bar);
    if (bar === null || db < bar) {
      if (this.loudMs > 0) {
        this.quietMs += dt;
        if (this.quietMs > MAX_GAP_MS) {
          this.loudMs = 0;
          this.quietMs = 0;
        }
      }
      return false;
    }
    // Loud: part of a candidate, and never learned as residue (her voice must not raise the bar).
    this.loudMs += dt;
    this.quietMs = 0;
    if (this.loudMs >= MIN_SPEECH_MS) {
      this.fired = true;
      return true;
    }
    return false;
  }
}
