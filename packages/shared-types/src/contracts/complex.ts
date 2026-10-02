// Eine zusammengesetzte Aufgabe wie in Klasse 8–10 (issue #297): gemeinsames MATERIAL — ein Text,
// eine Figur, eine Tabelle, Messwerte — und 2–5 TEILAUFGABEN a) b) c), die aufeinander aufbauen.
//
// Was hier bewusst NICHT neu ist: die Antwortformen und ihre Prüfer. Jede Teilaufgabe ist eine
// gewöhnliche Frage (`items`) einer vorhandenen Art — Zahl, Term, Kurzantwort, Auswahl, freier Text
// mit Kernpunkten (#211/#258) — und wird von genau dem Prüfer beurteilt, der diese Art immer
// beurteilt (`evaluate.ts`, `steps.ts`, `chemistry.ts`, `rubric.ts`). Keine zweite Prüflogik (#296).
// Neu ist nur, was die Teilaufgaben VERBINDET:
//
//   1. Das Material steht an JEDER Teilaufgabe (`items.complex_task`, Migration 0107), aus dem
//      Grund, aus dem `items.read_passage` an jeder Lesefrage steht: die Wiederholung bringt eine
//      Teilaufgabe in drei Wochen vielleicht allein zurück, und dann muss sie ihr Material
//      mitbringen.
//   2. Die Gruppe ist eine Kennung, die der SERVER vergibt (`group`); das Modell schreibt keine
//      (CLAUDE.md Regel 2). Abhängigkeiten nennt es mit den Buchstaben der Teilaufgaben ("b nutzt
//      a"), die der Server als Positionen speichert.
//   3. Eine rechenbare Teilaufgabe trägt ihre RECHNUNG (`calc`): einen Term über die Größen des
//      Materials (`givens`) und die Ergebnisse früherer Teilaufgaben. Code rechnet sie vor dem
//      Speichern nach und verwirft den ganzen Entwurf, wenn der Schlüssel nicht herauskommt
//      (Regel 0 aus #224). Und beim Antworten rechnet Code sie mit IHREM Ergebnis aus a) noch
//      einmal: wer in a) falsch lag und damit in b) richtig weiterrechnet, hat b) richtig
//      (Folgefehler, wie in deutschen Schulen üblich) — `apps/api/src/modules/practice/complex.ts`.

import { z } from 'zod';

import { Uuid } from './common.js';
import { Figure } from './figure.js';
import { PASSAGE_LINE_MAX, PASSAGE_LINES_MAX } from './reading.js';

/** Eine Aufgabe hat mindestens zwei Teile — sonst ist sie eine gewöhnliche Frage — und höchstens fünf. */
export const COMPLEX_PARTS_MIN = 2;
export const COMPLEX_PARTS_MAX = 5;
/** Die Buchstaben der Teilaufgaben, wie auf dem Blatt. Die Position ist der Buchstabe. */
export const COMPLEX_LABELS = ['a', 'b', 'c', 'd', 'e'] as const;
/** Größen, mit denen gerechnet wird: ein Datensatz eines Arbeitsblatts, keine Tabelle voller Werte. */
export const COMPLEX_GIVENS_MAX = 8;

/** Der Buchstabe der Teilaufgabe an Position `part` (0 → 'a'). */
export function complexLabel(part: number): string {
  return COMPLEX_LABELS[part] ?? '?';
}

/**
 * Eine Größe aus dem Material, mit der eine Teilaufgabe rechnet ("m = 2,5 kg"). Code prüft vor dem
 * Speichern, dass ihr Wert im Material STEHT — eine Größe, die nur das Modell kennt, ist keine aus
 * dem Material.
 */
export const ComplexGiven = z.object({
  /** Der Name, mit dem `calc` sie nennt: ein Buchstabe, gern mit Ziffern oder Index (m, v0, t_1). */
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,7}$/),
  value: z.number().finite(),
  unit: z.string().trim().max(16).nullable(),
});
export type ComplexGiven = z.infer<typeof ComplexGiven>;

/** Das gemeinsame Material, wie es an jeder Teilaufgabe gespeichert ist. */
export const ComplexMaterial = z.object({
  /** Die Überschrift wie gedruckt oder wie Buddy sie gab; null, wenn es keine gibt. */
  title: z.string().trim().min(1).max(80).nullable(),
  /**
   * Der Text Zeile für Zeile, wie gedruckt (Einleitung, Quelle, Messwerte) — gezählt wie ein
   * Lesetext (#233), damit "Z. 4" eine Zeile meint, die es gibt. Leer, wenn die Figur alles trägt.
   */
  lines: z.array(z.string().max(PASSAGE_LINE_MAX)).max(PASSAGE_LINES_MAX),
  /** Eine Figur, die die App zeichnet (Graph, Tabelle, Diagramm); null, wenn der Text alles trägt. */
  figure: Figure.nullable(),
  /** Die Größen, mit denen gerechnet wird. Leer bei einer Aufgabe ohne Rechnung (Geschichte, Deutsch). */
  givens: z.array(ComplexGiven).max(COMPLEX_GIVENS_MAX),
});
export type ComplexMaterial = z.infer<typeof ComplexMaterial>;

/** Was an einer Teilaufgabe gespeichert ist (`items.complex_task`). Geschrieben nur von `practice/complex.ts`. */
export const ComplexTask = z.object({
  /** Vom Server vergeben, gleich für alle Teile einer Aufgabe. */
  group: Uuid,
  /** Die Position dieser Teilaufgabe, 0 = a). */
  part: z
    .number()
    .int()
    .min(0)
    .max(COMPLEX_PARTS_MAX - 1),
  /** Wie viele Teile die Aufgabe hat. */
  parts: z.number().int().min(COMPLEX_PARTS_MIN).max(COMPLEX_PARTS_MAX),
  material: ComplexMaterial,
  /** Die früheren Teilaufgaben, auf denen diese aufbaut (Positionen, jede kleiner als `part`). */
  uses: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(COMPLEX_PARTS_MAX - 2),
    )
    .max(COMPLEX_PARTS_MAX - 1),
  /**
   * Die Rechnung einer Zahl-Teilaufgabe: ein Term über die Namen der `givens` und `[a]`, `[b]` …
   * für das Ergebnis einer früheren Teilaufgabe. Nachgerechnet beim Speichern (der Schlüssel muss
   * herauskommen) und beim Antworten mit ihren eigenen Ergebnissen (Folgefehler). Null für jede
   * andere Teilaufgabe.
   */
  calc: z.string().max(200).nullable(),
});
export type ComplexTask = z.infer<typeof ComplexTask>;

/**
 * Was die App über einer Teilaufgabe zeigt (`ItemView.complex`): das Material und wo sie in der
 * Aufgabe steht. Nie ein Schlüssel und nie eine Rechnung.
 */
export const ComplexView = z.object({
  /** Gleich für alle Teile einer Aufgabe in einer Ansicht ('k1', 'k2' …), vom Server vergeben. */
  ref: z.string().regex(/^k[1-9][0-9]*$/),
  /** Diese Teilaufgabe ('b'). */
  label: z.enum(COMPLEX_LABELS),
  /** Alle Teilaufgaben der Aufgabe, in ihrer Reihenfolge (['a', 'b', 'c']). */
  labels: z.array(z.enum(COMPLEX_LABELS)).min(COMPLEX_PARTS_MIN).max(COMPLEX_PARTS_MAX),
  title: z.string().nullable(),
  lines: z.array(z.string()).max(PASSAGE_LINES_MAX),
  figure: Figure.nullable(),
});
export type ComplexView = z.infer<typeof ComplexView>;
