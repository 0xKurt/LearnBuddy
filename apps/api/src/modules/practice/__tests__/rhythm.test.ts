// Einen gehörten Rhythmus nachklopfen (issue #445, Abnahme „Rhythmus nachklopfen mit Toleranz"):
// die Messung ihrer Schläge, nachgerechnet. Tempo 80 heißt: eine Viertel 750 ms, eine Achtel
// 375 ms, die Toleranz 40 % einer Achtel = 150 ms. Jede Zahl unten ist von Hand aus diesen drei
// Werten gerechnet.

import { type RhythmBars } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { checkTaps, onsetsOf } from '../rhythm.js';

const q = { el: 'note', value: 'quarter', dotted: false } as const;
const e = { el: 'note', value: 'eighth', dotted: false } as const;
const h = { el: 'note', value: 'half', dotted: false } as const;
const qr = { el: 'rest', value: 'quarter', dotted: false } as const;
const dq = { el: 'note', value: 'quarter', dotted: true } as const;

/** Viertel, Viertel, zwei Achtel, Viertel — ein voller 4/4-Takt. */
const RHYTHM: RhythmBars = [[q, q, e, e, q]];
const ONSETS = onsetsOf(RHYTHM);
/** Genau im Takt bei Tempo 80. */
const EXACT = [0, 750, 1500, 1875, 2250];

const at = (taps: number[]) => checkTaps(ONSETS, 80, taps);

describe('wo die Töne einsetzen', () => {
  it('zählt Noten, nicht Pausen, und rechnet mit Punkten und Takten weiter', () => {
    expect(ONSETS).toEqual([0, 8, 16, 20, 24]);
    // Eine Pause verschiebt den nächsten Ton, setzt aber selbst keinen.
    expect(onsetsOf([[q, qr, q, q]])).toEqual([0, 16, 24]);
    // Die punktierte Viertel ist zwölf Zweiunddreißigstel lang; der zweite Takt zählt weiter.
    expect(
      onsetsOf([
        [dq, e, h],
        [h, h],
      ]),
    ).toEqual([0, 12, 16, 32, 48]);
  });
});

describe('ihre Schläge gegen den gespielten Rhythmus', () => {
  it('nimmt genaue Schläge an und auch solche, die etwas wackeln', () => {
    expect(at(EXACT)).toEqual({ held: 5, total: 5, verdict: 'correct', fault: null });
    // Jeder Schlag bis zu 40 ms daneben, wie ein Kind auf dem Handy klopft.
    expect(at([0, 790, 1460, 1900, 2230]).verdict).toBe('correct');
  });

  it('lässt ihr eigenes Tempo zu, bis ein Viertel schneller oder langsamer', () => {
    const slower = EXACT.map((t) => Math.round(t * 1.2));
    const faster = EXACT.map((t) => Math.round(t * 0.85));
    expect(at(slower).verdict).toBe('correct');
    expect(at(faster).verdict).toBe('correct');
  });

  it('sagt nur „Tempo", wenn die Abstände sitzen und sie viel langsamer oder schneller ist', () => {
    const slow = at(EXACT.map((t) => Math.round(t * 1.4)));
    expect(slow).toEqual({
      held: 5,
      total: 5,
      verdict: 'partly',
      fault: { at: 'tempo', slow: true },
    });
    const fast = at(EXACT.map((t) => Math.round(t * 0.7)));
    expect(fast.fault).toEqual({ at: 'tempo', slow: false });
  });

  it('hält vier Achtel nicht für vier Viertel, nur weil die Abstände gleich sind', () => {
    // Gleichmäßig wie gespielt, aber doppelt so schnell: das ist ein anderer Rhythmus.
    const fourQuarters = onsetsOf([[q, q, q, q]]);
    const check = checkTaps(fourQuarters, 80, [0, 375, 750, 1125]);
    expect(check.verdict).toBe('partly');
    expect(check.fault).toEqual({ at: 'tempo', slow: false });
  });

  it('misst bis 150 ms daneben als richtig und darüber als falsch', () => {
    // Der dritte Schlag 140 ms zu spät: der Abstand davor 140 ms zu lang, der danach zu kurz.
    expect(at([0, 750, 1640, 1875, 2250]).verdict).toBe('correct');
    // 160 ms zu spät: das ist der Schlag, an dem es hängt.
    expect(at([0, 750, 1660, 1875, 2250])).toEqual({
      held: 2,
      total: 5,
      verdict: 'partly',
      fault: { at: 'beat', index: 3, early: false },
    });
  });

  it('erkennt einen Ton, der eine Achtel zu lang geklopft ist, und nennt seinen Schlag', () => {
    // Die erste Achtel als Viertel: der vierte Schlag kommt eine Achtel zu spät.
    expect(at([0, 750, 1500, 2250, 2625])).toEqual({
      held: 3,
      total: 5,
      verdict: 'partly',
      fault: { at: 'beat', index: 4, early: false },
    });
    // Und andersherum zu früh.
    expect(at([0, 750, 1125, 1500, 1875]).fault).toEqual({ at: 'beat', index: 3, early: true });
  });

  it('sagt „falsch", wenn schon der zweite Schlag nicht sitzt', () => {
    // Alles gleichmäßig in Achteln: ihr Tempo kommt aus dem Median, und die Viertel stimmen nicht.
    expect(at([0, 375, 750, 1125, 1500])).toEqual({
      held: 1,
      total: 5,
      verdict: 'wrong',
      fault: { at: 'beat', index: 2, early: true },
    });
  });

  it('zählt zuerst die Schläge — zu wenige, zu viele, nur einer', () => {
    expect(at([0, 750, 1500, 1875])).toEqual({
      held: 4,
      total: 5,
      verdict: 'partly',
      fault: { at: 'taps', given: 4, wanted: 5 },
    });
    expect(at([...EXACT, 2600]).fault).toEqual({ at: 'taps', given: 6, wanted: 5 });
    expect(at([0])).toEqual({
      held: 1,
      total: 5,
      verdict: 'wrong',
      fault: { at: 'taps', given: 1, wanted: 5 },
    });
  });

  it('lässt sich von einem einzigen falschen Abstand nicht das Tempo verschieben', () => {
    // Langsamer gespielt (×1.2) und dazu der letzte Ton eine Achtel zu spät: der Median bleibt
    // bei 1.2, also sitzen die ersten vier, und genannt wird der fünfte.
    const taps = [0, 900, 1800, 2250, 3150];
    expect(at(taps)).toEqual({
      held: 4,
      total: 5,
      verdict: 'partly',
      fault: { at: 'beat', index: 5, early: false },
    });
  });
});
