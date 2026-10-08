// Einen gehörten Rhythmus nachklopfen (issue #445): wie weit ihre Schläge vom gespielten Rhythmus
// abweichen, gemessen von Code — kein Modell, in keinem Zweig. Die Frage dazu, ihre Worte und die
// Antworten schreibt `staff.ts`; hier steht nur die Messung, rein: keine Uhr, keine Sprache.
//
// ─────────────── Was gemessen wird ───────────────
//
// Ihre Schläge kommen als Abstände vom ersten Schlag (`parseTaps`, ganze Millisekunden, auf dem
// Gerät mit einer monotonen Uhr gemessen). Wann sie angefangen hat, reist nicht mit — kein
// Zeitpunkt, nur wie lang es von einem Schlag zum nächsten dauerte; der Server misst hier keine
// Zeit (CLAUDE.md Regel 7). Verglichen werden die ABSTÄNDE zwischen zwei Schlägen mit denen
// zwischen zwei Tönen, nicht die Zeitpunkte: wer einen Schlag etwas zu spät setzt, hat einen
// Abstand zu lang und den nächsten zu kurz — an Zeitpunkten gemessen liefe der Fehler in jeden
// späteren Schlag mit, und eine kleine Unsicherheit am Anfang machte den ganzen Rest „falsch".
//
// ─────────────── Ihr eigenes Tempo ───────────────
//
// Niemand klopft genau im vorgespielten Tempo nach. Deshalb wird zuerst IHR Tempo bestimmt — der
// Median ihrer Abstände, geteilt durch die gespielten — und jeder Abstand in ihrem Tempo
// verglichen. Der Median und nicht der Mittelwert: ein einziger falscher Abstand verschiebt den
// Mittelwert und ließe dann die richtigen danebenliegen; den Median verschiebt er nicht.
//
// Beliebig ist ihr Tempo aber nicht: ohne Tempo wären vier Achtel dasselbe wie vier Viertel, nur
// schneller. Ein Viertel langsamer oder schneller als gespielt (`PACE_MAX`, `PACE_MIN`: 64 bis
// 100 Viertel pro Minute bei Tempo 80) ist „so, wie sie es gehört hat"; darüber hinaus sagt die
// Antwort, dass das Tempo noch nicht stimmt — und nur das, wenn die Abstände sitzen.
//
// ─────────────── Die Toleranz ───────────────
//
// Jeder Ton eines Rhythmus hier setzt auf einer Achtel ein (`staff.ts`, `onEighths`), also liegen
// zwei verschiedene Rhythmen an jeder Stelle mindestens eine Achtel auseinander — bei Tempo 80 sind
// das 375 ms. Die Hälfte davon ist die Grenze, ab der ein Abstand näher an einem ANDEREN Rhythmus
// liegt als an diesem. Die Toleranz bleibt darunter: 40 % einer Achtel (150 ms bei Tempo 80).
// Großzügig für ein Kind auf einem Handy — Rhythmusspiele werten ±100–150 ms noch als „gut" — und
// streng genug, dass ein Abstand, der eine Achtel zu lang oder zu kurz ist, nie als richtig gilt.

import { TICKS, ticksOf, type RhythmBars } from '@learnbuddy/shared-types/contracts';

/** Wie weit ein Abstand danebenliegen darf: 40 % einer Achtel im gespielten Tempo (siehe oben). */
const BEAT_TOLERANCE = 0.4;
/** Ihr Tempo als Anteil des gespielten, an den Abständen gemessen: bis ein Viertel langsamer … */
const PACE_MAX = 1.25;
/** … und bis ein Viertel schneller (1 / 1,25: dieselbe Abweichung in die andere Richtung). */
const PACE_MIN = 1 / PACE_MAX;

/**
 * Was an ihren Schlägen nicht stimmt — die EINE Stelle, wie bei einer geschriebenen Zeile:
 *   · `taps`: sie hat öfter oder seltener geklopft, als Töne kamen;
 *   · `beat`: der n-te Schlag (1-basiert, wie sie zählt) kommt zu früh oder zu spät;
 *   · `tempo`: die Abstände sitzen, nur ihr Tempo liegt außerhalb dessen, was sie gehört hat.
 */
type BeatFault =
  | { at: 'taps'; given: number; wanted: number }
  | { at: 'beat'; index: number; early: boolean }
  | { at: 'tempo'; slow: boolean };

export type TapsCheck = {
  /** Wie viele Schläge von vorne sitzen, der erste mitgezählt (ein PRÄFIX, wie bei einer Zeile). */
  held: number;
  /** Wie viele Töne gespielt wurden. */
  total: number;
  verdict: 'correct' | 'partly' | 'wrong';
  fault: BeatFault | null;
};

/** Wo die Töne eines Rhythmus einsetzen, in Zweiunddreißigsteln vom Anfang an. */
export function onsetsOf(bars: RhythmBars): number[] {
  const out: number[] = [];
  let at = 0;
  for (const el of bars.flat()) {
    if (el.el === 'note') out.push(at);
    at += ticksOf(el.value, el.dotted);
  }
  return out;
}

/** Die Abstände zwischen aufeinanderfolgenden Zeitpunkten. */
function gaps(points: readonly number[]): number[] {
  return points.slice(1).map((p, i) => p - (points[i] as number));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Ihre Schläge gegen den gespielten Rhythmus: `onsets` in Zweiunddreißigsteln (`onsetsOf`),
 * `tempo` in Vierteln pro Minute, `taps` in Millisekunden vom ersten Schlag an (`parseTaps`).
 *
 * Die Befunde in derselben Reihenfolge wie bei einer geschriebenen Zeile (`checkStaffLine`):
 * zuerst die Zahl, dann die erste Stelle, die nicht sitzt — und erst wenn jede sitzt, das Tempo.
 */
export function checkTaps(
  onsets: readonly number[],
  tempo: number,
  taps: readonly number[],
): TapsCheck {
  const total = onsets.length;
  const tick = 60_000 / tempo / TICKS.quarter;
  const wanted = gaps(onsets).map((g) => g * tick);
  const given = gaps(taps);
  const compared = Math.min(wanted.length, given.length);
  const pace =
    compared > 0 ? median(given.slice(0, compared).map((g, i) => g / (wanted[i] as number))) : 1;
  const tolerance = BEAT_TOLERANCE * TICKS.eighth * tick;
  const off = (i: number) => (given[i] as number) / pace - (wanted[i] as number);
  let sits = 0;
  while (sits < compared && Math.abs(off(sits)) <= tolerance) sits += 1;

  const held = taps.length === 0 ? 0 : 1 + sits;
  const counted = taps.length === total;
  const rhythm = counted && sits === compared;
  const inTempo = pace >= PACE_MIN && pace <= PACE_MAX;
  const verdict = rhythm && inTempo ? 'correct' : rhythm || held >= 2 ? 'partly' : 'wrong';
  const base = { held, total, verdict } as const;
  if (!counted) return { ...base, fault: { at: 'taps', given: taps.length, wanted: total } };
  if (!rhythm) return { ...base, fault: { at: 'beat', index: sits + 2, early: off(sits) < 0 } };
  if (!inTempo) return { ...base, fault: { at: 'tempo', slow: pace > PACE_MAX } };
  return { ...base, fault: null };
}
