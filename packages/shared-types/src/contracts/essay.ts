// Lange Texte — Aufsatz, Erörterung, Interpretation (issue #258): eine Rückmeldung je Kernpunkt
// der Textsorte und drei Stellen zum Verbessern, keine Note.
//
// ─────────────── Was hier steht und was nicht ───────────────
//
// Ein Aufsatz ist eine Frage der Art `essay` (`ItemKind`). Er wird geprüft wie eine Schreibaufgabe
// mit Rubrik (#211) und mit derselben Maschine wie „Erklär mal" (#236): Die Kernpunkte stehen als
// `StoredRubric` in `items.rubric`, und Code baut sie aus der TEXTSORTE (`EssayType`), nie das
// Modell (`apps/api/src/modules/practice/essay.ts`). Ein Kernpunkt gilt nur mit einem Zitat aus
// ihrem Text, das der Server dort findet, und an der Stelle, an die er gehört: die Einleitung im
// ersten Absatz, der Schluss im letzten (`EssayPointCheck` in `rubric.ts`). Die Zeitform prüft
// `tense` wie bei #211; ein Zitat mit Zeilenangabe muss eine Zeile nennen, die es im Text gibt.
//
// Kein Punktwert, keine Note, kein richtig/falsch (CLAUDE.md Regel 5 und 6): `EssayFeedback` hat
// kein Feld, in dem eine Zahl über ihren Text stehen könnte. Ihr Turn trägt das Urteil
// `not_an_attempt` — nichts wurde benotet, die App zeigt kein Richtig/Falsch-Zeichen — und die
// Rückmeldung in `PracticeTurnView.essay`. Jede Fassung zählt trotzdem als Versuch
// (`SessionItemView.attempts`), damit die letzte Fassung die Frage schließen kann.

import { z } from 'zod';

import { RUBRIC_QUOTE_MAX } from './rubric.js';

/**
 * Wie lang ein Aufsatz sein darf: etwa 1800 Wörter. Nur eine Frage der Art `essay` nimmt so viel
 * an; jede andere Antwort bleibt bei `ANSWER_TEXT_MAX` (der Server lehnt mehr mit 422 ab).
 */
export const ESSAY_TEXT_MAX = 12_000;

/** Wie lang jede andere geschriebene Antwort sein darf (das Antwortfeld seit jeher). */
export const ANSWER_TEXT_MAX = 2000;

/** Wie viele Stellen zum Verbessern eine Rückmeldung nennt — genau so viele fragt der Server ab. */
export const ESSAY_PLACES = 3;

/** Wie viele Fassungen eines Aufsatzes Rückmeldung bekommen; die letzte schließt die Frage. */
export const ESSAY_VERSIONS_MAX = 3;

/**
 * Die Textsorte. Sie entscheidet, welche Kernpunkte geprüft werden — die Liste dazu steht im
 * Server-Code, nicht im Prompt (`ESSAY_POINTS` in `apps/api/src/modules/practice/essay.ts`).
 *
 *   · `argue_linear`     — Stellungnahme, lineare Erörterung, Kommentar, comment
 *   · `argue_dialectic`  — dialektische (Pro-Kontra-)Erörterung, auch materialgestützt
 *   · `analyse`          — Textanalyse und Interpretation (Kurzgeschichte, Gedicht, Drama,
 *                          Sachtext, Rede), analysis
 */
export const EssayType = z.enum(['argue_linear', 'argue_dialectic', 'analyse']);
export type EssayType = z.infer<typeof EssayType>;

/** Ein Kernpunkt, wie sie ihn nach ihrer Fassung sieht. */
export const EssayPointView = z.object({
  /** Der Name des Kernpunkts in ihrer Sprache („Einleitung"). */
  name: z.string(),
  /**
   * met: der Server hat den Beleg in ihrem Text gefunden · open: noch nicht zu sehen (nie
   * „falsch") · unknown: dazu liegt kein Urteil vor — die App zeigt so einen Punkt nicht.
   */
  state: z.enum(['met', 'open', 'unknown']),
  /** Bei `met`: ihre eigenen Worte, die ihn tragen, so wie der Server sie gefunden hat. */
  quote: z.string().nullable(),
  /** Bei `open`: was sie dafür tun kann, ein vorbereiteter Satz der App. */
  missing: z.string().nullable(),
});
export type EssayPointView = z.infer<typeof EssayPointView>;

/** Eine Stelle zum Verbessern: ihre eigenen Worte und ein Vorschlag, was sie dort tun kann. */
export const EssayPlace = z.object({
  /** Wörtlich aus ihrem Text; der Server hat es dort gefunden. */
  quote: z.string().min(1).max(RUBRIC_QUOTE_MAX),
  /** Ein Satz an sie, was sie an dieser Stelle besser machen kann. */
  better: z.string().min(1).max(240),
});
export type EssayPlace = z.infer<typeof EssayPlace>;

/**
 * Die Rückmeldung zu einer Fassung (`PracticeTurnView.essay`): jeder Kernpunkt mit seinem Stand
 * und bis zu drei Stellen zum Verbessern. Weniger als drei, wenn der Server ein Zitat des Modells
 * nicht in ihrem Text gefunden hat — dann fällt die Stelle weg, statt erfunden dazustehen.
 */
export const EssayFeedback = z.object({
  /** Die Textsorte in ihrer Sprache („Erörterung"). */
  form: z.string(),
  points: z.array(EssayPointView),
  places: z.array(EssayPlace).max(ESSAY_PLACES),
  /** Die letzte Fassung, die Rückmeldung bekommt: danach ist die Frage abgeschlossen. */
  last: z.boolean(),
});
export type EssayFeedback = z.infer<typeof EssayFeedback>;
