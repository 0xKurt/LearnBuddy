import { describe, expect, it } from 'vitest';

import {
  MAX_SPEECH_CHARS,
  NaturalGate,
  chunkSpoken,
  deviceRate,
  playbackProgress,
  readingParts,
  restAfter,
  sentenceSpans,
  sentencesOf,
  shortOpening,
} from '../readAloud.js';

describe('reading a text sentence by sentence', () => {
  const text = 'Super gemacht! Was ist $\\frac{3}{4}$ von 8?\nZ. B. so: 3.5 cm.';

  it('splits into the sentences that are read and highlighted, and finds them in the text', () => {
    expect(sentencesOf(text)).toEqual([
      'Super gemacht!',
      'Was ist $\\frac{3}{4}$ von 8?',
      'Z. B. so: 3.5 cm.',
    ]);
    expect(sentenceSpans(text).map(([a, b]) => text.slice(a, b))).toEqual(sentencesOf(text));
  });

  it('sends each sentence as it is said, skips what says nothing, keeps the sentence index', () => {
    const parts = readingParts('**Richtig!** Gut.\n$$\nWeiter so.', (s) =>
      s.replace(/\*\*/g, '').replace(/\$\$/g, ''),
    );
    expect(parts).toEqual([
      { at: 0, spoken: ['Richtig! Gut.'] },
      { at: 2, spoken: ['Weiter so.'] },
    ]);
    expect(readingParts('$$', () => '')).toEqual([]);
  });

  it('cuts an overlong sentence at spaces into pieces the server accepts', () => {
    const long = Array.from({ length: 200 }, (_, i) => `wort${i}`).join(' ');
    const pieces = chunkSpoken(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    expect(pieces.join(' ')).toBe(long);
    expect(chunkSpoken('x'.repeat(1300))).toHaveLength(3);
  });
});

describe('when the phone reads instead (NaturalGate)', () => {
  const failure = (over: Partial<Parameters<typeof restAfter>[0]>) => ({
    status: 503,
    code: 'unavailable',
    reason: null,
    retryAfterS: null,
    ...over,
  });

  it('rests as long as the reason says', () => {
    expect(restAfter(failure({ reason: 'speech_off' }))).toEqual({ scope: 'all', ms: 1_800_000 });
    expect(restAfter(failure({ reason: 'language' })).scope).toBe('language');
    expect(restAfter(failure({ status: 429, code: 'rate_limited', retryAfterS: 90 }))).toEqual({
      scope: 'all',
      ms: 90_000,
    });
    expect(restAfter(failure({ status: 0, code: 'network' })).ms).toBe(30_000);
    expect(restAfter(failure({ reason: 'timeout' })).ms).toBe(60_000);
  });

  it('a language it lacks stays with the phone; others keep the natural voice', () => {
    let t = 0;
    const gate = new NaturalGate(() => t);
    gate.failed('ja-JP', failure({ reason: 'language' }));
    expect(gate.allows('ja-JP')).toBe(false);
    expect(gate.allows('de-DE')).toBe(true);
    gate.failed('de-DE', failure({ status: 0, code: 'network' }));
    expect(gate.allows('de-DE')).toBe(false);
    t += 30_000;
    expect(gate.allows('de-DE')).toBe(true);
    expect(gate.allows('ja-JP')).toBe(false);
  });
});

describe('speed and progress', () => {
  it('the phone voice follows her speed step too', () => {
    expect(deviceRate(1, 0)).toBe(1);
    expect(deviceRate(1, -1)).toBe(0.88);
    expect(deviceRate(0.75, 2)).toBe(0.94);
    expect(deviceRate(1, -7)).toBe(0.75);
  });

  it('progress only from a known length', () => {
    expect(playbackProgress(1, 4)).toBe(0.25);
    expect(playbackProgress(5, 4)).toBe(1);
    expect(playbackProgress(1, 0)).toBeNull();
    expect(playbackProgress(1, Number.NaN)).toBeNull();
  });
});

describe('shortOpening', () => {
  const long =
    'Der Urknall ist der Moment, in dem unser ganzes Universum angefangen hat, und das war vor etwa 13,8 Milliarden Jahren.';

  it('cuts a long opening at its last clause boundary before the limit', () => {
    expect(shortOpening(long)).toEqual([
      'Der Urknall ist der Moment, in dem unser ganzes Universum angefangen hat,',
      'und das war vor etwa 13,8 Milliarden Jahren.',
    ]);
  });

  it('leaves a short sentence alone', () => {
    expect(shortOpening('Klar, machen wir!')).toEqual(['Klar, machen wir!']);
  });

  it('rather waits than cuts mid-clause', () => {
    const noBoundary = `Der Urknall ist der Moment in dem unser ganzes Universum ${'sehr '.repeat(20)}angefangen hat`;
    expect(shortOpening(noBoundary)).toEqual([noBoundary]);
  });

  it('never cuts off a tiny first piece', () => {
    // The comma after "Ja" is too early to be worth a separate request.
    const s = `Ja, ${'das stimmt genau und '.repeat(8)}so ist es.`;
    expect(shortOpening(s)[0]).not.toBe('Ja,');
  });
});

describe('readingParts with a long opening', () => {
  it('speaks the opening in two pieces, both in the first sentence', () => {
    const text =
      'Der Urknall ist der Moment, in dem unser ganzes Universum angefangen hat, und das war vor etwa 13,8 Milliarden Jahren. Danach wurde es kühler.';
    const parts = readingParts(text, (s) => s);
    expect(parts[0]?.at).toBe(0);
    expect(parts[0]?.spoken).toHaveLength(2);
    expect(parts[1]?.at).toBe(1);
  });
});
