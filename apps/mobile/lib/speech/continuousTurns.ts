// Continuous ADTS capture: file reads may split a header or frame, never a spoken turn.
import { BargeGate } from './bargeIn.js';
import { PauseEnd } from './pauseEnd.js';

type Frame = { at: number; bytes: Uint8Array };
const FRAME_MS = 1024 / 16;
const PRE_ROLL_MS = 800;

export class AdtsFrames {
  private pending = new Uint8Array(0);
  private frames: Frame[] = [];
  endMs = 0;

  push(bytes: Uint8Array): void {
    const data = new Uint8Array(this.pending.length + bytes.length);
    data.set(this.pending);
    data.set(bytes, this.pending.length);
    let offset = 0;
    while (data.length - offset >= 7) {
      if (data[offset] !== 0xff || (data[offset + 1]! & 0xf6) !== 0xf0)
        throw new Error('invalid_adts_header');
      // Capture is configured as 16 kHz mono AAC, one 1024-sample block per ADTS frame.
      if (((data[offset + 2]! >> 2) & 15) !== 8 || (data[offset + 6]! & 3) !== 0)
        throw new Error('unsupported_adts_clock');
      const length =
        ((data[offset + 3]! & 3) << 11) | (data[offset + 4]! << 3) | (data[offset + 5]! >> 5);
      if (length < 7) throw new Error('invalid_adts_length');
      if (offset + length > data.length) break;
      this.frames.push({ at: this.endMs, bytes: data.slice(offset, offset + length) });
      this.endMs += FRAME_MS;
      offset += length;
    }
    this.pending = data.slice(offset);
  }

  discardBefore(at: number): void {
    while (this.frames.length && this.frames[0]!.at + FRAME_MS <= at) this.frames.shift();
  }

  take(from: number): Uint8Array {
    this.discardBefore(from);
    const bytes = new Uint8Array(this.frames.reduce((n, f) => n + f.bytes.length, 0));
    let offset = 0;
    for (const f of this.frames) {
      bytes.set(f.bytes, offset);
      offset += f.bytes.length;
    }
    this.frames = [];
    return bytes;
  }
}

export class ContinuousTurns {
  private audio = new AdtsFrames();
  private pause = new PauseEnd();
  private barge = new BargeGate();
  private active = false;
  private wasPlaying = false;
  private from = 0;
  private consumed = 0;
  private requestedEnd: number | null = null;
  constructor(private readonly on: { start(): void; turn(bytes: Uint8Array): void }) {}

  get ready(): boolean {
    return this.pause.ready;
  }
  push(bytes: Uint8Array): void {
    this.audio.push(bytes);
  }

  observe(db: number, at: number, playing: boolean): void {
    if (playing && !this.wasPlaying) this.barge = new BargeGate();
    this.wasPlaying = playing;
    if (playing && !this.active) {
      if (this.barge.observe(db, at, true)) {
        this.pause.nextTurn(true);
        this.start(at);
      }
    } else {
      const ended = this.pause.observeDb(db, at);
      if (!this.active && this.pause.speaking) this.start(at);
      if (ended && this.active) this.finish();
    }
    if (this.requestedEnd !== null && this.audio.endMs >= this.requestedEnd) this.finish();
    // Bound memory during an arbitrarily long silence; retain the entire onset of a candidate.
    if (!this.active) this.audio.discardBefore(this.audio.endMs - PRE_ROLL_MS);
    else if (this.audio.endMs - this.from >= 15_000) this.finish();
  }

  private start(at: number): void {
    this.active = true;
    this.from = Math.max(this.consumed, at - PRE_ROLL_MS);
    this.on.start();
  }

  /** Let the encoder publish the last frames after a manual finish tap, without closing the mic. */
  requestFinish(): void {
    this.requestedEnd = this.audio.endMs + 320;
  }

  finish(): void {
    this.requestedEnd = null;
    if (!this.active) return;
    const bytes = this.audio.take(this.from);
    this.consumed = this.audio.endMs;
    this.active = false;
    this.pause.nextTurn();
    if (bytes.length) this.on.turn(bytes);
  }
}
