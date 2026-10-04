// Eine SCHREIBAUFGABE und ihre Pflichtelemente — die Rubrik (issue #211, Schritt 2 aus #197).
//
// In Deutsch bestehen die Klassenarbeiten fast nur aus Schreibaufgaben, in den Fremdsprachen
// kommen E-Mail, Blog und Sprachmittlung dazu, in Geschichte die Quellen- und Karikaturanalyse,
// in den Naturwissenschaften das Versuchsprotokoll (`docs/lehrplan-und-uebungsformen.md` §12).
// Bewertet wird dort, ob die geforderten ELEMENTE da sind — nicht die Nähe zu einer
// Musterlösung. Schritt 1 (#197) hat aufgehört, eine Musterlösung zu behaupten; hier kommt
// das, was stattdessen gesagt wird.
//
// ─────────────── Warum die Rubrik ein eigenes Objekt ist und nicht ein Prompt-Absatz ───────────────
//
// Weil sie entscheidet, was die Lernende zu hören bekommt, und weil sie der einzige Grund ist,
// aus dem ein Element „fehlt" genannt werden darf. Eine Liste in einem Prompt wäre ein
// Vorschlag; hier ist sie eine geprüfte Struktur, die der Server gegen ihren Text hält
// (CLAUDE.md Regel 1). Gespeichert in `items.rubric` (Migration 0075), genau wie
// `items.bar_task` die geprüfte Bruchbalken-Aufgabe hält.
//
// ─────────────── Die Trennlinie dieser Datei: WER entscheidet ein Element ───────────────
//
// Jedes Element sagt selbst, WIE es entschieden wird, und das ist keine Höflichkeit, sondern die
// Zusage, dass an dieser Stelle niemand raten muss. Drei der vier Prüfungen gehören dem Code:
//
//   · `word_count` — Wörter zählen. Code.
//   · `mentions`   — eine Pflichtangabe (ein Titel, ein Name, eine Jahreszahl, ein Fachbegriff)
//                    steht im Text, oder im ERSTEN Satz. Code, gefaltet verglichen.
//   · `tense`      — die Zeitform. Das Modell nennt die Verben, die es in der falschen Zeitform
//                    sieht; Code prüft, dass jedes genannte Verb wirklich in ihrem Text steht,
//                    und nur ein bestätigtes Verb lässt das Element offen (Regel 0 aus #224).
//   · `judged`     — eine echte Beurteilung (ein eigenes Urteil, eine Begründung, der rote
//                    Faden). Das Modell sagt `erfüllt`/`nicht erfüllt` und muss ein ZITAT aus
//                    ihrem Text mitliefern; Code prüft, dass das Zitat dort steht, sonst gilt
//                    das Element als nicht erfüllt.
//
// Damit gilt überall, wo Code etwas wissen kann: Code weiß es. Ein vorhandenes Element wird
// nie auf das Wort des Modells hin „fehlt" genannt — dort, wo Code prüfen kann, wird die
// Behauptung des Modells gar nicht erst eingeholt (`askedElements` in
// `apps/api/src/modules/practice/rubric.ts` zeigt dem Modell nur `tense` und `judged`).
//
// ─────────────── Was hier bewusst NICHT steht ───────────────
//
// Kein Gewicht, kein Punktwert, keine Note. Ein Element hat kein Gewicht, weil es keinen
// Gesamtwert gibt, in den es einginge: die Rückmeldung ist die Liste der Elemente und EIN
// nächster Schritt (`docs/architecture.md` §Practice). Ein Bruchteil ginge auch nirgends hin —
// FSRS kennt drei Noten und keine Zwischennote (`practice/fsrs.ts`), und eine erfundene wäre die
// Behauptung, sie beherrsche das Thema zu drei Vierteln. Dieselbe Entscheidung wie bei einer
// mehrteiligen Antwort: sie zählt weniger, statt anders zu zählen.

import { z } from 'zod';

/**
 * Wie viele Pflichtelemente eine Aufgabe hat. Zwei, weil ein einzelnes Element keine Rubrik
 * ist, sondern wieder ein Gesamturteil mit einem anderen Namen; sechs, weil die Rückmeldung
 * eine Zeile bleiben muss, die sie liest, und nicht eine Liste zum Abarbeiten wird.
 */
export const RUBRIC_MIN = 2;
export const RUBRIC_MAX = 6;

/** Die Grenzen einer Wortzahl: unter 20 Wörtern ist kein Text gefordert, über 400 passt er nicht ins Antwortfeld (2000 Zeichen). */
export const RUBRIC_WORDS_MIN = 20;
export const RUBRIC_WORDS_MAX = 400;

/** Wie viele Verben das Modell zu einer Zeitform nennen darf, bevor es eine Liste wird. */
export const RUBRIC_VERBS_MAX = 6;

/** Wie lang ein Belegzitat sein darf — ein Satz, nicht ein Absatz. */
export const RUBRIC_QUOTE_MAX = 160;

const RubricTerm = z.string().trim().min(1).max(40);

export const RubricCheck = z.discriminatedUnion('by', [
  z
    .object({
      by: z.literal('word_count'),
      min: z.number().int().min(RUBRIC_WORDS_MIN).max(RUBRIC_WORDS_MAX).nullable(),
      max: z.number().int().min(RUBRIC_WORDS_MIN).max(RUBRIC_WORDS_MAX).nullable(),
    })
    .describe(
      'The length the task itself asks for, in words. Set only a bound the task really states; the other one is null. Never both null.',
    ),
  z
    .object({
      by: z.literal('mentions'),
      terms: z
        .array(RubricTerm)
        .min(1)
        .max(4)
        .describe(
          'Every one of them must stand in the text: a title, an author, a year, a named term the task requires. Only wordings that are not interchangeable — a term the learner may legitimately paraphrase belongs to a judged element instead.',
        ),
      where: z
        .enum(['anywhere', 'opening'])
        .describe('opening: it must stand in the FIRST sentence; anywhere: somewhere in the text.'),
    })
    .describe('A piece of information the text has to name, checked by the server in her text.'),
  z
    .object({
      by: z.literal('tense'),
      tense: z.enum(['present', 'past']),
    })
    .describe(
      'The tense the text form requires throughout. Checked by naming the verbs that break it; the server verifies each of them stands in her text.',
    ),
  z
    .object({ by: z.literal('judged') })
    .describe(
      'Only where nothing can be counted: an own judgement, a reasoning, the thread of the text. The model must point at a verbatim quote from her text for it, and the server checks the quote is really there.',
    ),
]);
export type RubricCheck = z.infer<typeof RubricCheck>;

export const RubricElement = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .describe(
      'What this element is called, in the learner\'s language, 1–4 words — the words a teacher would use when handing the work back. It is shown to her as it stands, so no sentence and no "and".',
    ),
  missing: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .describe(
      "ONE short sentence saying what to look for when this element is not there yet, in the learner's language. It is what she reads as her next step, so write it to her, never about her, and never give away a content she is supposed to produce.",
    ),
  check: RubricCheck,
});
export type RubricElement = z.infer<typeof RubricElement>;

/**
 * Die Pflichtelemente einer Schreibaufgabe, wie das Modell sie beim Einlesen des Blattes
 * schreibt — abgeleitet aus dem Operator der Aufgabe und der Textsorte.
 *
 * Die Reihenfolge ist nicht beliebig: sie ist die Reihenfolge, in der die Elemente geprüft
 * werden, und damit die Reihenfolge, in der der EINE nächste Schritt gewählt wird. Was zuerst
 * steht, wird zuerst genannt — also steht vorne, was die Textsorte zuerst verlangt.
 */
export const Rubric = z
  .object({
    form: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .describe(
        "The text form the task asks for, named as the subject names it, in the learner's language.",
      ),
    elements: z.array(RubricElement).min(RUBRIC_MIN).max(RUBRIC_MAX),
  })
  .describe(
    'Only for kind "long", and only when the task really asks for a text of a named form whose required elements the task or the text form states. The elements are what a teacher ticks off; prefer a check the server can count (a length, a piece of information that must be named, the tense) and use "judged" only where nothing can be counted. Never write a rubric whose elements you are guessing at — without one the question behaves as it does today.',
  );
export type Rubric = z.infer<typeof Rubric>;

// ─────────────── „Erklär mal": die Kernpunkte einer Erklärung (issue #236) ───────────────
//
// Eine offene Frage („Erklär mir, wie die Fotosynthese funktioniert") hat keinen Schlüssel, sondern
// 3–6 KERNPUNKTE, die eine vollständige Erklärung nennt. Sie stehen in derselben Spalte wie die
// Rubrik einer Schreibaufgabe (`items.rubric`), als eine fünfte Prüfart, die nur der Server
// schreibt: `key_point`. Das Modell, das Fragen erzeugt, bekommt diese Prüfart nie zu sehen — sie
// entsteht aus einem eigenen Entwurf (`apps/api/src/modules/practice/teachBack.ts`), den Code erst
// prüft. Eine Rubrik ist entweder ganz aus Kernpunkten oder hat keinen.
//
//   · `point` — was die Erklärung hier sagt, als Aussage. Nur für das Urteil, nie für sie sichtbar:
//               sie sieht den Namen („Ort") und, wenn er fehlt, die Nachfrage (`missing`).
//   · `exact` — eine Zahl, Formel oder ein Fachwort, ohne das der Punkt nicht gesagt ist. Das prüft
//               Code in ihrer Erklärung, gefaltet verglichen; das Modell kann es nicht überstimmen.

/** Wie viele Kernpunkte eine Erklärfrage hat: unter drei ist es eine Kurzantwort, über sechs eine Liste. */
export const KEY_POINTS_MIN = 3;
export const KEY_POINTS_MAX = 6;

/** Wie viele exakte Angaben ein Kernpunkt tragen darf. */
export const KEY_POINT_EXACT_MAX = 3;

export const KeyPointCheck = z.object({
  by: z.literal('key_point'),
  point: z.string().trim().min(1).max(200),
  exact: z.array(RubricTerm).max(KEY_POINT_EXACT_MAX),
});
export type KeyPointCheck = z.infer<typeof KeyPointCheck>;

const StoredCheck = z.discriminatedUnion('by', [...RubricCheck.options, KeyPointCheck]);

/**
 * Was `items.rubric` hält: die Rubrik einer Schreibaufgabe, wie das Modell sie schreibt, oder die
 * Kernpunkte einer Erklärfrage, wie Code sie aus dem geprüften Entwurf baut (#236). Gelesen wird
 * die Spalte immer hierdurch (`rubricOf`), nie als gegeben genommen.
 */
export const StoredRubric = Rubric.extend({
  elements: z
    .array(RubricElement.extend({ check: StoredCheck }))
    .min(RUBRIC_MIN)
    .max(RUBRIC_MAX),
});
export type StoredRubric = z.infer<typeof StoredRubric>;
export type StoredRubricElement = StoredRubric['elements'][number];

// ─────────────── Was hier (noch) NICHT steht: die Rückmeldung als Struktur ───────────────
//
// Die Rückmeldung pro Element verlässt den Server als SATZ, nicht als Struktur: Buddys Antwort
// trägt die Elemente mit ihrem Stand in Worten („steht" / „noch nicht") und darunter EINEN
// nächsten Schritt, zusammengesetzt im Server aus seinen eigenen Texten
// (`apps/api/src/modules/practice/rubric.ts`, `rubricReply`). Deshalb steht hier kein
// Anzeige-Objekt neben `PracticeTurnView.pronunciation`.
//
// Der Grund ist nicht Sparsamkeit, sondern dass ein Satz hier mehr kann: er wird vorgelesen und
// von der Vorleseansage ausgesprochen (`lib/speech/spoken.ts`), er braucht kein Symbol, dessen
// Bedeutung man kennen muss, und er trägt keine Zahl, die sich zu einem Punktestand addieren
// ließe (Regel 6). Eine eigene Fläche mit Häkchen wäre das nächste, was man bauen könnte — sie
// wäre eine Verbesserung der Darstellung, nicht der Aussage, und sie hat ihr eigenes Vorbild
// (`PronunciationNote`), wenn sie gebraucht wird.
