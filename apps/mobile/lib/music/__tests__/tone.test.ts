// Was `tone.ts` behauptet, hier nachgerechnet und nachgemessen.
//
// Für ein Tonsignal gibt es keine Abnahme durch Hinsehen: „klingt richtig" ist auf einem
// Entwicklerrechner kein Beleg und auf einem Telefon auch keiner. Deshalb wird hier nichts
// verglichen, was aus demselben Code kommt — die Datei wird aufgebrochen wie von einem Player:
// ein **eigener** Base64-Dekoder (unten, mit `indexOf` statt mit der Kodiertabelle von `tone.ts`),
// die Kopffelder Byte für Byte, und die Tonhöhe als **Messung** am Signal (Goertzel auf einem Bin
// plus Nulldurchgänge). Ein Test, der `frequencyOf` gegen `frequencyOf` hält, wäre eine
// Tautologie und würde einen falschen Oszillator nicht merken (CLAUDE.md Regel 5).

import type { NoteName, NoteValue, StaffElement } from '@learnbuddy/shared-types/contracts';
import {
  TEMPO_DEFAULT,
  TEMPO_MAX,
  TEMPO_MIN,
  frequencyOf,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { SAMPLE_RATE, samplesOf, tickSeconds, wavOfLine, wavOfPitch } from '../tone.js';

// ─────────────── ein Player, nachgebaut ───────────────

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 zurück zu Bytes — bewusst anders gerechnet als `tone.ts` kodiert. */
function bytesOf(text: string): Uint8Array {
  const body = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((body.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let at = 0;
  for (const ch of body) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw new Error(`kein Base64-Zeichen: ${ch}`);
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[at + i] as number);
  return out;
}

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at] as number) | ((bytes[at + 1] as number) << 8);
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] as number) |
      ((bytes[at + 1] as number) << 8) |
      ((bytes[at + 2] as number) << 16) |
      ((bytes[at + 3] as number) << 24)) >>>
    0
  );
}

/** Die Abtastwerte hinter dem 44-Byte-Kopf, als vorzeichenbehaftete Zahlen. */
function pcmOf(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let at = 44; at + 1 < bytes.length; at += 2) {
    const raw = u16(bytes, at);
    out.push(raw >= 0x8000 ? raw - 0x10000 : raw);
  }
  return out;
}

function samplesOfWav(base64: string): number[] {
  return pcmOf(bytesOf(base64));
}

/**
 * Die Leistung bei genau einer Frequenz (Goertzel). Ein Bin, keine ganze FFT — gefragt ist
 * „steckt DIESE Frequenz im Signal", nicht das ganze Spektrum.
 */
function powerAt(samples: readonly number[], from: number, count: number, hz: number): number {
  const coeff = 2 * Math.cos((2 * Math.PI * hz) / SAMPLE_RATE);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < count; i++) {
    const s0 = (samples[from + i] as number) + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/** Vorzeichenwechsel im Fenster; exakte Nullen zählen nicht als Wechsel. */
function crossings(samples: readonly number[], from: number, count: number): number {
  let found = 0;
  let sign = 0;
  for (let i = from; i < from + count; i++) {
    const value = samples[i] as number;
    if (value === 0) continue;
    const next = value > 0 ? 1 : -1;
    if (sign !== 0 && next !== sign) found++;
    sign = next;
  }
  return found;
}

const note = (name: NoteName, octave: number, value: NoteValue, dotted = false): StaffElement => ({
  el: 'note',
  pitch: { name, octave },
  value,
  dotted,
});
const rest = (value: NoteValue, dotted = false): StaffElement => ({ el: 'rest', value, dotted });

// ─────────────── der Kopf ───────────────

describe('der RIFF/WAVE-Kopf', () => {
  it('sagt über jedes Feld genau das, was ein Player erwartet', () => {
    const bytes = bytesOf(wavOfLine([[note('A', 4, 'quarter')]], 80));

    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(ascii(bytes, 8, 4)).toBe('WAVE');
    expect(ascii(bytes, 12, 4)).toBe('fmt ');
    expect(u32(bytes, 16)).toBe(16); // fmt-Block für unkomprimiertes PCM
    expect(u16(bytes, 20)).toBe(1); // audioFormat 1 = PCM
    expect(u16(bytes, 22)).toBe(1); // mono
    expect(u32(bytes, 24)).toBe(SAMPLE_RATE);
    expect(u16(bytes, 34)).toBe(16); // bitsPerSample
    expect(ascii(bytes, 36, 4)).toBe('data');
  });

  it('hält byteRate und blockAlign mit Rate, Kanälen und Bits in Einklang', () => {
    const bytes = bytesOf(wavOfPitch({ name: 'C', octave: 4 }));
    const channels = u16(bytes, 22);
    const bits = u16(bytes, 34);
    const blockAlign = u16(bytes, 32);
    const byteRate = u32(bytes, 28);

    expect(blockAlign).toBe((channels * bits) / 8);
    expect(byteRate).toBe(u32(bytes, 24) * blockAlign);
  });

  it('gibt die beiden Größen so an, wie sie wirklich sind', () => {
    const bytes = bytesOf(wavOfLine([[note('G', 4, 'eighth'), rest('eighth')]], 92));

    // Der data-Block ist genau so lang wie das, was dahinter steht …
    expect(u32(bytes, 40)).toBe(bytes.length - 44);
    // … und die RIFF-Größe ist die Gesamtlänge minus die acht Byte, die vor ihr zählen.
    expect(u32(bytes, 4)).toBe(bytes.length - 8);
    // Eine ungerade Zahl von Bytes gäbe es bei 16 Bit mono nicht.
    expect((bytes.length - 44) % 2).toBe(0);
  });

  it('macht aus einer leeren Zeile eine gültige leere Datei und keinen Wurf', () => {
    const bytes = bytesOf(wavOfLine([], 80));

    expect(bytes.length).toBe(44);
    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(u32(bytes, 40)).toBe(0);
    expect(u32(bytes, 4)).toBe(36);
  });
});

// ─────────────── die Länge ───────────────

describe('wie lang die Zeile dauert', () => {
  const fourQuarters = [
    [
      note('C', 4, 'quarter'),
      note('D', 4, 'quarter'),
      note('E', 4, 'quarter'),
      note('F', 4, 'quarter'),
    ],
  ];

  it('spielt vier Viertel bei Tempo 60 in vier Sekunden', () => {
    const count = samplesOfWav(wavOfLine(fourQuarters, 60)).length;

    expect(count).toBe(4 * SAMPLE_RATE); // 88200
    expect(Math.abs(count / SAMPLE_RATE - 4)).toBeLessThan(1 / SAMPLE_RATE);
  });

  it('braucht bei doppeltem Tempo genau die Hälfte', () => {
    const slow = samplesOfWav(wavOfLine(fourQuarters, 60)).length;
    const fast = samplesOfWav(wavOfLine(fourQuarters, 120)).length;

    expect(fast).toBe(slow / 2);
    expect(fast).toBe(2 * SAMPLE_RATE);
  });

  it('macht aus einer punktierten Viertel genau das Eineinhalbfache', () => {
    const plain = samplesOf(note('C', 4, 'quarter'), 60);
    const dotted = samplesOf(note('C', 4, 'quarter', true), 60);

    expect(plain).toBe(SAMPLE_RATE);
    expect(dotted).toBe(1.5 * plain);
    expect(samplesOfWav(wavOfLine([[note('C', 4, 'quarter', true)]], 60)).length).toBe(dotted);
  });

  it('zählt einen Taktstrich nicht als Dauer: zwei Takte klingen wie ihre Noten', () => {
    const oneBar = samplesOfWav(
      wavOfLine([[note('C', 4, 'half'), note('D', 4, 'half')]], 60),
    ).length;
    const twoBars = samplesOfWav(
      wavOfLine([[note('C', 4, 'half')], [note('D', 4, 'half')]], 60),
    ).length;

    expect(twoBars).toBe(oneBar);
  });

  it('zieht ein unmögliches Tempo in die Grenzen, statt eine endlose Datei zu schreiben', () => {
    expect(tickSeconds(0)).toBe(tickSeconds(TEMPO_MIN));
    expect(tickSeconds(10_000)).toBe(tickSeconds(TEMPO_MAX));
    expect(tickSeconds(Number.NaN)).toBe(tickSeconds(TEMPO_DEFAULT));
    expect(Number.isFinite(samplesOfWav(wavOfLine([[note('C', 4, 'whole')]], 0)).length)).toBe(
      true,
    );
  });
});

// ─────────────── Pause, Ton, und die Lücke dazwischen ───────────────

describe('was still ist und was klingt', () => {
  it('lässt eine Pause wirklich still und die Note danach nicht', () => {
    const slot = samplesOf(rest('quarter'), 60);
    const samples = samplesOfWav(wavOfLine([[rest('quarter'), note('A', 4, 'quarter')]], 60));

    expect(samples.length).toBe(2 * slot);
    expect(samples.slice(0, slot).every((value) => value === 0)).toBe(true);
    expect(samples.slice(slot).some((value) => value !== 0)).toBe(true);
  });

  it('trennt zwei gleiche Töne durch Stille, sonst wären sie ein langer Ton', () => {
    const slot = samplesOf(note('C', 4, 'quarter'), 60);
    const samples = samplesOfWav(
      wavOfLine([[note('C', 4, 'quarter'), note('C', 4, 'quarter')]], 60),
    );
    const quiet = Math.round(0.02 * SAMPLE_RATE); // 20 ms

    for (const start of [0, slot]) {
      // Mitten im Zeitfenster klingt es …
      const middle = samples.slice(start + Math.round(slot * 0.4), start + Math.round(slot * 0.6));
      expect(middle.some((value) => value !== 0)).toBe(true);
      // … und die letzten 20 ms davor sind null.
      expect(samples.slice(start + slot - quiet, start + slot).every((value) => value === 0)).toBe(
        true,
      );
    }
  });

  it('fängt weich an: der erste Abtastwert ist null, und es wird erst leise laut', () => {
    const samples = samplesOfWav(wavOfPitch({ name: 'C', octave: 4 }));
    const attack = Math.round(0.008 * SAMPLE_RATE);

    expect(samples[0]).toBe(0);
    const early = Math.max(...samples.slice(0, attack).map(Math.abs));
    const later = Math.max(...samples.slice(attack, 4 * attack).map(Math.abs));
    expect(early).toBeLessThan(later);
  });
});

// ─────────────── die Tonhöhe, gemessen ───────────────

describe('welcher Ton da wirklich klingt', () => {
  // Eine ganze Note bei Tempo 60 sind vier Sekunden; das Messfenster liegt mit Abstand
  // innerhalb des gehaltenen Teils, also hinter dem Anstieg und vor dem Abfall.
  const FROM = 5_000;
  const COUNT = 16_384;

  for (const pitch of [
    { name: 'A', octave: 4 } as const,
    { name: 'C', octave: 5 } as const,
    { name: 'G', octave: 3 } as const,
  ]) {
    it(`trifft ${pitch.name}${pitch.octave} und nicht den Halbton daneben`, () => {
      const hz = frequencyOf(pitch);
      const samples = samplesOfWav(wavOfLine([[note(pitch.name, pitch.octave, 'whole')]], 60));

      const onPitch = powerAt(samples, FROM, COUNT, hz);
      const upHalf = powerAt(samples, FROM, COUNT, hz * Math.pow(2, 1 / 12));
      const downHalf = powerAt(samples, FROM, COUNT, hz * Math.pow(2, -1 / 12));

      expect(onPitch).toBeGreaterThan(100 * upHalf);
      expect(onPitch).toBeGreaterThan(100 * downHalf);
    });

    it(`hat bei ${pitch.name}${pitch.octave} genau zwei Nulldurchgänge pro Periode`, () => {
      const hz = frequencyOf(pitch);
      const samples = samplesOfWav(wavOfLine([[note(pitch.name, pitch.octave, 'whole')]], 60));

      // Ein Dreieck geht pro Periode einmal hinauf und einmal hinunter durch null.
      const expected = (2 * hz * COUNT) / SAMPLE_RATE;
      expect(Math.abs(crossings(samples, FROM, COUNT) - expected)).toBeLessThanOrEqual(2);
    });
  }

  it('hört A4 als 440 Hz — nicht als 220 und nicht als 880', () => {
    const samples = samplesOfWav(wavOfLine([[note('A', 4, 'whole')]], 60));

    const fundamental = powerAt(samples, FROM, COUNT, 440);
    expect(fundamental).toBeGreaterThan(100 * powerAt(samples, FROM, COUNT, 220));
    expect(fundamental).toBeGreaterThan(100 * powerAt(samples, FROM, COUNT, 880));
  });
});

// ─────────────── der Pegel ───────────────

describe('wie laut es höchstens wird', () => {
  it('bleibt mit echtem Abstand unter dem Vollpegel — kein Begrenzen, kein Überlauf', () => {
    const samples = samplesOfWav(
      wavOfLine(
        [
          [note('C', 4, 'quarter'), note('A', 5, 'eighth'), rest('eighth')],
          [note('G', 3, 'half', true)],
        ],
        72,
      ),
    );
    const peak = Math.max(...samples.map(Math.abs));

    // Innerhalb von 16 Bit, in beide Richtungen.
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(-32_768);
    expect(Math.max(...samples)).toBeLessThanOrEqual(32_767);
    // Und mit dem versprochenen Kopfraum: rund 0,35 vom Vollpegel, nie darüber.
    expect(peak).toBeLessThanOrEqual(0.4 * 32_767);
    // Trotzdem ein richtiges Signal und kein Flüstern.
    expect(peak).toBeGreaterThan(0.3 * 32_767);
  });
});

// ─────────────── der einzelne Ton zum Antippen ───────────────

describe('wavOfPitch', () => {
  it('ist eine gültige, nicht leere Datei in der Länge einer Viertel im Standardtempo', () => {
    const base64 = wavOfPitch({ name: 'F', octave: 4 });
    const bytes = bytesOf(base64);

    expect(base64.length).toBeGreaterThan(0);
    expect(base64.length % 4).toBe(0); // Base64 ist immer auf vier aufgefüllt
    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(ascii(bytes, 8, 4)).toBe('WAVE');
    expect(u32(bytes, 40)).toBe(bytes.length - 44);
    expect(pcmOf(bytes).length).toBe(samplesOf(note('F', 4, 'quarter'), TEMPO_DEFAULT));
    expect(pcmOf(bytes).some((value) => value !== 0)).toBe(true);
  });
});
