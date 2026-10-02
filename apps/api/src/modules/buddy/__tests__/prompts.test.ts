// What reaches the model must not be written for one of the five languages (issues #200, #201).
//
// The prompt is ONE static block for all five — it is the prefix the implicit cache depends on
// (docs/decisions/prefix-cache-2026-10-01.md), so it cannot be switched per language. That makes
// every example word in it a word in a language four out of five learners do not speak, and the
// model copies examples: an English learner was told her test was "am Freitag" in 2 of 3 live
// runs (#200), and the removal rule named the undo button "Rückgängig" while her own card says
// "Undo" (#201). So the examples are gone, and this test is the guard that keeps them gone.
//
// It reads the two exported prompts, not the source file: comments in prompts.ts carry the
// German sentences that caused the bugs on purpose, as provenance, and they never reach the
// model. The response schemas are a second surface in the same request and are NOT covered here
// — the zod descriptions in decision.ts still carry German examples (reported with #201).
//
// A list of words is not language understanding here (hard rule 3): nothing the product decides
// depends on it. It is an assertion over one constant string, like DAY_WORDS in evals/buddy.

import { describe, expect, it } from 'vitest';

import { CHECK_SYSTEM, TURN_SYSTEM } from '../prompts.js';

/**
 * The one German phrase that is deliberate: the five school systems side by side, so the prompt
 * does NOT drift towards German when it has to say what a school year is called (issue #201,
 * "was ausdrücklich bleiben soll"). Cut out before the scan, and asserted present below —
 * removing it would be the opposite of this fix.
 */
const SCHOOL_SYSTEMS = '7. Klasse, 4e, 2º ESO, terza media, Year 8';

/**
 * Words that give away a sentence written for a German learner: German function words, the
 * literals of #200 and #201 with the stems they would come back as, and the day names of all
 * five languages — a rule that has to name a day says the principle, and the word itself is
 * rendered by code from her locale (`dayLabel`).
 */
const NOT_IN_THE_PROMPT: readonly string[] = [
  // German function words: one of these means a line was never translated out of German.
  'ich',
  'mir',
  'mich',
  'dir',
  'dein',
  'deine',
  'nicht',
  'und',
  'ist',
  'sind',
  'eine',
  'einer',
  'einen',
  'kein',
  'keine',
  'hab',
  'habe',
  'hast',
  'kannst',
  'machen',
  'gleich',
  'schon',
  'noch',
  'auch',
  'aber',
  'oder',
  'wenn',
  'dann',
  'sehr',
  'für',
  'über',
  // The six literals of issue #201, by the stem each would return as.
  'Rückgängig',
  'Klasse',
  'Probetest',
  'Hilfe',
  'Handball',
  'Römer',
  'Stunde',
  'Minuten',
  // German school platforms, named to every learner in the material rules until #201.
  'Schul',
  'IServ',
  // A day word, in any of the five languages: none belongs in a static block (#200).
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
  'Heute',
  'Morgen',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
  'domenica',
];

/** The first banned word standing in `prompt`, with its surroundings — '' when there is none. */
function literalIn(prompt: string): string {
  const text = prompt.split(SCHOOL_SYSTEMS).join(' ');
  for (const word of NOT_IN_THE_PROMPT) {
    // A Unicode letter lookaround, not `\b`: `\b` is ASCII, so `\bvenerdì\b` matches nothing
    // at all and the check would silently pass everything (same trap as in evals/buddy).
    const hit = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').exec(text);
    if (hit) {
      const at = hit.index;
      return `${hit[0]} — …${text.slice(Math.max(0, at - 60), at + hit[0].length + 60)}…`;
    }
  }
  return '';
}

describe('the system prompt is written for no one language', () => {
  it('shows the turn prompt no word of a single language as an example', () => {
    expect(literalIn(TURN_SYSTEM)).toBe('');
  });

  it('shows the background-check prompt none either', () => {
    expect(literalIn(CHECK_SYSTEM)).toBe('');
  });

  it('has no umlaut or sharp s left in either', () => {
    expect(TURN_SYSTEM).not.toMatch(/[äöüßÄÖÜ]/);
    expect(CHECK_SYSTEM).not.toMatch(/[äöüßÄÖÜ]/);
  });

  it('keeps the five school systems side by side', () => {
    expect(TURN_SYSTEM).toContain(SCHOOL_SYSTEMS);
  });

  it('names no button, so none can be named in a language that does not have it', () => {
    // The proven bug of #201: "Rückgängig" stood here while an English learner's card says
    // "Undo" (apps/mobile/locales/<lang>/buddy.json → done.undo, rendered from her locale).
    // The label never crosses into the API, in any language — the prompt states the capability.
    for (const label of ['Rückgängig', 'Undo', 'Annuler', 'Deshacer', 'Annulla']) {
      expect(TURN_SYSTEM).not.toContain(label);
    }
    expect(TURN_SYSTEM).toContain('offers to take it straight back');
  });
});
