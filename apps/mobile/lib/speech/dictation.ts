// Dictation without a time limit (issue #19). The recorder cannot stream PCM on
// this build, so a long recording rolls over into pieces instead: from a soft
// bound the recording is cut at the next real pause (the recorder stops and
// starts again inside the silence), and each finished piece goes to
// POST /voice/transcribe while she keeps talking. The pieces' texts are
// stitched in order; each upload carries the tail of what was already
// understood, so the model hears a piece that starts mid-sentence as its
// continuation. Pure logic (no React Native), unit-tested; the wiring lives in
// record.ts and components/voice/useVoiceInput.ts.

import { levelFromDb } from './level.js';

/** When and where a long dictation is cut (record.ts). */
export const DICTATION_CHUNK = {
  /**
   * From here the recording is cut at the next pause. Small on purpose (issue
   * #28): whatever is still on the device when she taps stop is the wait she
   * feels — everything cut earlier is already uploaded by then. Not smaller,
   * because every cut spends a recorder restart (a brief gap the pause has to
   * swallow) and one model call per piece.
   */
  softMs: 15_000,
  /**
   * A room that never falls quiet: cut anyway, invisibly. Well below the
   * transport bound per piece (~250 s of 48 kbit/s audio in 2 000 000 base64 chars).
   */
  hardMs: 150_000,
  /** Room tone and below counts as quiet (lib/speech/level.ts: ~0.12). */
  quietLevel: 0.12,
  /** A real pause, not a breath: this long without speech (speech research 28.09.). */
  quietMs: 700,
} as const;

export type ChunkBounds = typeof DICTATION_CHUNK;

/**
 * Decides when a running piece is cut. Fed from the recorder's level poll;
 * quiet time is tracked from the start so a pause straddling the soft bound
 * still counts. `reset()` when the next piece starts.
 */
export class ChunkCutter {
  private quietSince: number | null = null;

  constructor(private readonly bounds: ChunkBounds = DICTATION_CHUNK) {}

  reset(): void {
    this.quietSince = null;
  }

  /** True when the piece should end now: past the soft bound in a pause, or at the hard bound. */
  shouldCut(elapsedInChunkMs: number, level: number, nowMs: number): boolean {
    if (level > this.bounds.quietLevel) this.quietSince = null;
    else this.quietSince ??= nowMs;
    if (elapsedInChunkMs < this.bounds.softMs) return false;
    if (elapsedInChunkMs >= this.bounds.hardMs) return true;
    return this.quietSince !== null && nowMs - this.quietSince >= this.bounds.quietMs;
  }
}

/**
 * Proof that a piece held no speech (issue #28). After a pause-cut the final
 * piece is often just the silence between the cut and her tap on stop —
 * uploading it would cost a model call and make the finished text wait behind
 * it. A piece counts as provably silent only when the metering delivered real
 * values for it, none of them reached above room tone, and an earlier piece of
 * the same take demonstrably heard her — so a microphone whose metering cannot
 * hear her (a browser without metering, a meter stuck at one value) can never
 * throw her words away.
 */
export class SpeechMark {
  private metered = false;
  private heardInPiece = false;
  private heardBefore = false;

  constructor(private readonly quietLevel: number = DICTATION_CHUNK.quietLevel) {}

  /** A new take begins. */
  reset(): void {
    this.metered = false;
    this.heardInPiece = false;
    this.heardBefore = false;
  }

  /** One metering sample of the running piece (dBFS; null/undefined = not measured). */
  observe(meteringDb: number | null | undefined): void {
    if (meteringDb === null || meteringDb === undefined || !Number.isFinite(meteringDb)) return;
    this.metered = true;
    if (levelFromDb(meteringDb) > this.quietLevel) this.heardInPiece = true;
  }

  /**
   * The running piece ends (a cut, or her tap on stop): true when it provably
   * held no speech. The next piece starts fresh within the same take.
   */
  endPiece(): boolean {
    const silent = this.metered && !this.heardInPiece && this.heardBefore;
    this.heardBefore = this.heardBefore || this.heardInPiece;
    this.metered = false;
    this.heardInPiece = false;
    return silent;
  }
}

/** TranscribeRequest.prev_tail allows at most 400 characters. */
export const MAX_PREV_TAIL = 400;

/**
 * What the pieces said so far, in order. A piece still being written down or
 * lost contributes nothing yet; the order of the array is the order spoken.
 */
export function stitchTranscripts(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim())
    .join(' ');
}

/**
 * The tail of the stitched text for the next piece's upload, cut at a word
 * boundary; null when nothing was understood yet (the field is then left out).
 */
export function prevTail(stitched: string, max: number = MAX_PREV_TAIL): string | null {
  const text = stitched.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const tail = text.slice(text.length - max);
  const space = tail.indexOf(' ');
  return space >= 0 && space < tail.length - 1 ? tail.slice(space + 1) : tail;
}
