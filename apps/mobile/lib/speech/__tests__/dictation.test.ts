import { describe, expect, it } from 'vitest';

import {
  ChunkCutter,
  DICTATION_CHUNK,
  prevTail,
  SpeechMark,
  stitchTranscripts,
} from '../dictation.js';

const { softMs, hardMs, quietMs, quietLevel } = DICTATION_CHUNK;
const speech = quietLevel + 0.2;
const quiet = quietLevel - 0.05;

describe('ChunkCutter', () => {
  it('never cuts before the soft bound, even in silence', () => {
    const cutter = new ChunkCutter();
    for (let t = 0; t < softMs; t += 500) {
      expect(cutter.shouldCut(t, quiet, t)).toBe(false);
    }
  });

  it('cuts at the first real pause past the soft bound', () => {
    const cutter = new ChunkCutter();
    // She talks past the soft bound …
    expect(cutter.shouldCut(softMs + 1_000, speech, softMs + 1_000)).toBe(false);
    // … falls quiet, but a breath is not a pause …
    expect(cutter.shouldCut(softMs + 2_000, quiet, softMs + 2_000)).toBe(false);
    expect(
      cutter.shouldCut(softMs + 2_000 + quietMs - 100, quiet, softMs + 2_000 + quietMs - 100),
    ).toBe(false);
    // … and the sustained pause cuts.
    expect(cutter.shouldCut(softMs + 2_000 + quietMs, quiet, softMs + 2_000 + quietMs)).toBe(true);
  });

  it('a pause that began before the soft bound counts once the bound is passed', () => {
    const cutter = new ChunkCutter();
    expect(cutter.shouldCut(softMs - 2_000, quiet, softMs - 2_000)).toBe(false);
    expect(cutter.shouldCut(softMs + 10, quiet, softMs + 10)).toBe(true);
  });

  it('speech in between starts the pause over', () => {
    const cutter = new ChunkCutter();
    expect(cutter.shouldCut(softMs + 100, quiet, softMs + 100)).toBe(false);
    expect(cutter.shouldCut(softMs + 500, speech, softMs + 500)).toBe(false);
    expect(cutter.shouldCut(softMs + 600, quiet, softMs + 600)).toBe(false);
    expect(cutter.shouldCut(softMs + 600 + quietMs - 1, quiet, softMs + 600 + quietMs - 1)).toBe(
      false,
    );
    expect(cutter.shouldCut(softMs + 600 + quietMs, quiet, softMs + 600 + quietMs)).toBe(true);
  });

  it('a room that never falls quiet is cut at the hard bound, invisibly', () => {
    const cutter = new ChunkCutter();
    for (let t = 0; t < hardMs; t += 1_000) {
      expect(cutter.shouldCut(t, speech, t)).toBe(false);
    }
    expect(cutter.shouldCut(hardMs, speech, hardMs)).toBe(true);
  });

  it('reset starts the next piece fresh', () => {
    const cutter = new ChunkCutter();
    expect(cutter.shouldCut(softMs, quiet, softMs)).toBe(false);
    expect(cutter.shouldCut(softMs + quietMs, quiet, softMs + quietMs)).toBe(true);
    cutter.reset();
    // Right after the cut the next piece is young: no immediate re-cut.
    expect(cutter.shouldCut(100, quiet, softMs + quietMs + 100)).toBe(false);
  });

  it('the hard bound leaves room under the transport bound per piece', () => {
    // 48 kbit/s AAC ≈ 8 000 base64 chars per second; the contract allows 2 000 000.
    expect((hardMs / 1000) * 8_000).toBeLessThan(2_000_000 * 0.75);
  });
});

describe('SpeechMark', () => {
  // levelFromDb: speech is roughly -50…-5 dBFS; room tone ~0.12 ≈ -44.6 dB.
  const speechDb = -30; // ≈ 0.44, clearly speech
  const quietDb = -47; // ≈ 0.07, below room tone

  it('the pause after a spoken piece is provably silent', () => {
    const mark = new SpeechMark();
    mark.observe(speechDb);
    expect(mark.endPiece()).toBe(false);
    mark.observe(quietDb);
    expect(mark.endPiece()).toBe(true);
  });

  it('speech in the final piece keeps it, even after a long pause', () => {
    const mark = new SpeechMark();
    mark.observe(speechDb);
    mark.endPiece();
    mark.observe(quietDb);
    mark.observe(speechDb); // she went on after all
    mark.observe(quietDb);
    expect(mark.endPiece()).toBe(false);
  });

  it('without metering there is no proof: nothing is ever silent', () => {
    const mark = new SpeechMark();
    mark.observe(undefined);
    expect(mark.endPiece()).toBe(false);
    mark.observe(null);
    mark.observe(Number.NaN);
    expect(mark.endPiece()).toBe(false);
  });

  it('a meter that never heard her in this take cannot drop a piece', () => {
    // A meter stuck at one quiet value (a broken web implementation) looks
    // exactly like this: every piece must be delivered rather than thrown away.
    const mark = new SpeechMark();
    mark.observe(quietDb);
    expect(mark.endPiece()).toBe(false);
    mark.observe(quietDb);
    expect(mark.endPiece()).toBe(false);
  });

  it('the first piece of a take is never silent-skipped', () => {
    const mark = new SpeechMark();
    mark.observe(quietDb);
    expect(mark.endPiece()).toBe(false);
  });

  it('metering must cover the piece itself, not only earlier ones', () => {
    const mark = new SpeechMark();
    mark.observe(speechDb);
    mark.endPiece();
    // The final piece delivered no metering at all (recorder already stopping).
    expect(mark.endPiece()).toBe(false);
  });

  it('reset forgets the take', () => {
    const mark = new SpeechMark();
    mark.observe(speechDb);
    mark.endPiece();
    mark.reset();
    mark.observe(quietDb);
    expect(mark.endPiece()).toBe(false);
  });
});

describe('stitchTranscripts', () => {
  it('joins the pieces in spoken order and skips what is pending, lost or empty', () => {
    expect(stitchTranscripts(['Es war einmal', 'ein Kind.'])).toBe('Es war einmal ein Kind.');
    expect(stitchTranscripts(['Anfang.', null, 'Ende.'])).toBe('Anfang. Ende.');
    expect(stitchTranscripts(['Anfang.', undefined, ' '])).toBe('Anfang.');
    expect(stitchTranscripts([])).toBe('');
  });
});

describe('prevTail', () => {
  it('sends the whole text while it is short, and nothing when there is none', () => {
    expect(prevTail('Es war einmal ein Kind.')).toBe('Es war einmal ein Kind.');
    expect(prevTail('')).toBeNull();
    expect(prevTail('   ')).toBeNull();
  });

  it('cuts a long text to the tail at a word boundary, within the contract bound', () => {
    const words = Array.from({ length: 200 }, (_, i) => `wort${i}`).join(' ');
    const tail = prevTail(words);
    expect(tail).not.toBeNull();
    expect(tail!.length).toBeLessThanOrEqual(400);
    expect(tail!.startsWith('wort')).toBe(true);
    expect(words.endsWith(tail!)).toBe(true);
  });

  it('a single word longer than the bound is cut hard rather than dropped', () => {
    const tail = prevTail('x'.repeat(1000), 10);
    expect(tail).toBe('x'.repeat(10));
  });
});
