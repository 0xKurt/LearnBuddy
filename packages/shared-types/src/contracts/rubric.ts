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

/**
 * Die Grenzen einer Wortzahl: unter 20 Wörtern ist kein Text gefordert, über 1800 passt er nicht
 * ins Antwortfeld eines Aufsatzes (`ESSAY_CHARS_MAX`, 15 000 Zeichen — issue #258).
 */
export const RUBRIC_WORDS_MIN = 20;
export const RUBRIC_WORDS_MAX = 1800;

/**
 * Wie viele Kernpunkte eine Erklärfrage hat (issue #236). Drei, weil zwei Punkte eine Frage mit
 * zwei Teilen sind und keine Erklärung; sechs, weil die Rückmeldung eine Liste bleibt, die sie auf
 * einen Blick liest, und weil ein Kind in einer mündlichen Abfrage nicht mehr als sechs Dinge zu
 * einer Frage sagt.
 */
export const KEY_POINTS_MIN = 3;
export const KEY_POINTS_MAX = 6;

/** Wie viele Zahlen oder Formeln ein Kernpunkt exakt verlangen darf, je mit bis zu vier Schreibweisen. */
export const KEY_POINT_EXACT_MAX = 3;

/** Wie viele Stellen zum Verbessern ein Aufsatz zurückbekommt — drei, wie im Issue (#258). */
export const RUBRIC_SPOTS_MAX = 3;

/** Wie lang ein Verbesserungsvorschlag zu einer Stelle sein darf: ein Satz. */
export const RUBRIC_TIP_MAX = 200;

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
    .object({
      by: z.literal('paragraphs'),
      min: z.number().int().min(2).max(12),
    })
    .describe(
      'The text has to be divided into at least this many paragraphs (an essay: introduction, main part, conclusion). Counted by the server: blocks separated by an empty line or a line break.',
    ),
  z
    .object({
      by: z.literal('line_refs'),
      min: z.number().int().min(1).max(10),
    })
    .describe(
      'Only for a task about a printed text with numbered lines: quotes carry their line ("Z. 12", "l. 4"). The server counts the line references in her text and checks that every cited line exists in the material.',
    ),
  z
    .object({
      by: z.literal('judged'),
      exact: z
        .array(z.array(RubricTerm).min(1).max(4))
        .max(KEY_POINT_EXACT_MAX)
        .default([])
        .describe(
          'Only when the element contains a number or a formula (a year, a value, "CO₂", "E = mc²"): each entry is ONE such value, given as 1–4 accepted ways to write or say it (e.g. ["CO2", "Kohlenstoffdioxid"]). The server checks exactly that one of them stands in her words; the rest of the element is judged. Empty otherwise.',
        ),
    })
    .describe(
      'Only where nothing can be counted: an own judgement, a reasoning, the thread of the text, a key point of an explanation. The model must point at a verbatim quote from her text for it, and the server checks the quote is really there.',
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
  point: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .nullable()
    .default(null)
    .describe(
      'Only for kind "explain": what the key point SAYS, in full ("findet im Chloroplasten statt") — given to the judge, never shown to her. Then "name" is only the ASPECT she sees in her list ("Ort", "Woher die Energie kommt"): it must not give the point away, because the list stands right under the follow-up question asking for it. null for kind "text".',
    ),
  ask: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .nullable()
    .default(null)
    .describe(
      'Only for kind "explain": the ONE follow-up question a teacher asks when this key point is missing from her explanation, in the learner\'s language, ending with "?" — it asks for the point, it never states it (e.g. "Und wo in der Zelle passiert das?"). null for kind "text".',
    ),
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
    kind: z
      .enum(['text', 'explain'])
      .default('text')
      .describe(
        'text: a written text of a named form, ticked off element by element. explain: an OPEN question she answers by explaining in her own words (aloud or typed) — "Erklär, wie …", "Beschreibe, warum …"; the elements are its 3–6 KEY POINTS, every one "judged", each with its follow-up question in "ask".',
      ),
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
    'Only for kind "long". kind "text": only when the task really asks for a text of a named form whose required elements the task or the text form states; the elements are what a teacher ticks off — prefer a check the server can count (a length, paragraphs, a piece of information that must be named, line references, the tense) and use "judged" only where nothing can be counted. kind "explain": an open question to be explained; the elements are the 3–6 key points a complete explanation at her level contains, each a short noun phrase (never the question itself), each "judged" with its follow-up question. Never write a rubric whose elements you are guessing at — without one the question behaves as it does today.',
  );
export type Rubric = z.infer<typeof Rubric>;

// ─────────────── Die Rückmeldung als Struktur (issues #236, #258) ───────────────
//
// Bis #211 verließ die Rückmeldung pro Element den Server als SATZ („Einleitung: steht ·
// Präsens: noch nicht"). Das hat getragen, solange es zwei, drei Elemente einer Schreibaufgabe
// waren. Mit der Erklärfrage (#236) und dem Aufsatz (#258) kommt mehr: bis zu sechs Kernpunkte und
// drei Stellen aus ihrem Text — als eine Zeile mit Mittelpunkten wird das ein Absatz, den sie
// entziffern muss. Also steht die Liste jetzt neben dem Satz, wie `PronunciationNote` neben der
// Sprechrückmeldung: der Satz sagt den EINEN nächsten Schritt (er wird vorgelesen), die Liste
// zeigt, was schon trägt.
//
// Was die Struktur bewusst NICHT trägt: keine Zahl, keinen Anteil, keine Note (Regel 6 und die
// Abnahme von #258). Ein Punkt ist `met` oder nicht — und ein Element, über das niemand etwas
// gemessen hat (`unknown` in `practice/rubric.ts`), steht gar nicht drin.

/** Ein Punkt der Rückmeldung: sein Name und ob er in ihrem Text steht. */
export const RubricPointView = z.object({
  name: z.string(),
  met: z.boolean(),
});
export type RubricPointView = z.infer<typeof RubricPointView>;

/**
 * Eine Stelle aus IHREM Text, an der sie verbessern kann (nur beim Aufsatz, #258): das Zitat ist
 * wörtlich ihres — der Server hat es in ihrem Text gefunden, sonst stünde es hier nicht.
 */
export const RubricSpotView = z.object({
  quote: z.string(),
  tip: z.string(),
});
export type RubricSpotView = z.infer<typeof RubricSpotView>;

export const RubricFeedback = z.object({
  kind: z.enum(['text', 'explain']),
  points: z.array(RubricPointView).max(RUBRIC_MAX),
  spots: z.array(RubricSpotView).max(RUBRIC_SPOTS_MAX).default([]),
});
export type RubricFeedback = z.infer<typeof RubricFeedback>;
