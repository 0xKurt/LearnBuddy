// What reaches the model must not be written for one of the five languages (issues #200, #201,
// #213).
//
// The prompt is ONE static block for all five — it is the prefix the implicit cache depends on
// (docs/decisions/prefix-cache-2026-10-01.md), so it cannot be switched per language. That makes
// every example word in it a word in a language four out of five learners do not speak, and the
// model copies examples: an English learner was told her test was "am Freitag" in 2 of 3 live
// runs (#200), and the removal rule named the undo button "Rückgängig" while her own card says
// "Undo" (#201). So the examples are gone, and this test is the guard that keeps them gone.
//
// It reads the exported prompts, not the source file: comments in prompts.ts and decision.ts
// carry the German sentences that caused the bugs on purpose, as provenance, and they never
// reach the model.
//
// The SECOND surface is the response schema (#213). It is not the system prompt, but it travels
// in the same request, ahead of the conversation — the same path #200 took — and it is the
// larger of the two static blocks (measured at buddy.49: 32 384 serialised characters for the
// turn schema against 25 383 for the turn prompt). Until #213 this test looked only at the
// prompt strings, so four
// German examples sat in the zod `.describe()` calls of decision.ts and one in registry.ts while
// every test stayed green. Scanning the serialised schema closes that by construction: whatever
// the model receives is scanned with the same predicates, so the next example cannot come back
// through a schema either.
//
// A list of words is not language understanding here (hard rule 3): nothing the product decides
// depends on it. It is an assertion over constant strings, like DAY_WORDS in evals/buddy.

import { NotPracticableForm } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { toJsonSchema } from '../../../llm/json-schema.js';
import { SchoolYear } from '../decision.js';
import { lookupsField } from '../lookups.js';
import { CHECK_SYSTEM, TURN_SYSTEM } from '../prompts.js';
import { CheckDecision, TurnDecisionForModel } from '../registry.js';
import { CHECK_STEP_SCHEMA } from '../check.js';
import { TURN_STEP_SCHEMA } from '../turn.js';

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

/** A German letter is a German letter wherever it stands — prompt or schema. */
const GERMAN_LETTERS = /[äöüßÄÖÜ]/;

/**
 * The first banned word standing in `text`, with its surroundings — '' when there is none.
 * `deliberate` are the passages that must name a language and are asserted present elsewhere;
 * they are cut out first, so a word is only reported where it was not meant to be.
 */
function literalIn(text: string, deliberate: readonly string[] = [SCHOOL_SYSTEMS]): string {
  let scanned = text;
  for (const passage of deliberate) scanned = scanned.split(passage).join(' ');
  for (const word of NOT_IN_THE_PROMPT) {
    // A Unicode letter lookaround, not `\b`: `\b` is ASCII, so `\bvenerdì\b` matches nothing
    // at all and the check would silently pass everything (same trap as in evals/buddy).
    const hit = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').exec(scanned);
    if (hit) {
      const at = hit.index;
      return `${hit[0]} — …${scanned.slice(Math.max(0, at - 60), at + hit[0].length + 60)}…`;
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
    expect(TURN_SYSTEM).not.toMatch(GERMAN_LETTERS);
    expect(CHECK_SYSTEM).not.toMatch(GERMAN_LETTERS);
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

/**
 * The second surface of the same request (#213). Every schema the model answers with, as the
 * bytes it gets: `JSON.stringify` of what `toJsonSchema` produced, which is what `vertex.ts`
 * puts into `responseJsonSchema`.
 *
 * Four schemas go out with the two prompts above. `TURN_STEP_SCHEMA` is imported from the
 * module that sends it, so a change there is scanned without this test being touched; the other
 * three are built here from the same exported zod pieces the senders use, because `turn.ts`
 * keeps its final-round schema and `check.ts` both of its schemas private. The pieces, not the
 * compositions, are what carries description text: a check step schema is `CheckDecision` plus
 * the `lookups` field, and both are scanned, so a German example cannot hide in the one
 * composition no test holds.
 */
const SCHEMAS: ReadonlyArray<readonly [string, string]> = [
  ['turn, lookup round (turn.ts TURN_STEP_SCHEMA)', JSON.stringify(TURN_STEP_SCHEMA)],
  ['turn, final round (TurnDecisionForModel)', JSON.stringify(toJsonSchema(TurnDecisionForModel))],
  ['background check (CheckDecision)', JSON.stringify(toJsonSchema(CheckDecision))],
  // The composition check.ts actually sends, not only its two pieces (issue #213).
  [
    'background check, lookup round (check.ts CHECK_STEP_SCHEMA)',
    JSON.stringify(CHECK_STEP_SCHEMA),
  ],
  ['the lookups field each step schema adds', JSON.stringify(toJsonSchema(lookupsField))],
];

/** A passage as it stands inside the serialised schema: its quotes are escaped there. */
const inJson = (text: string): string => JSON.stringify(text).slice(1, -1);

/**
 * The one structure that has to name school systems in their own words — six options, each
 * saying how that system's own label becomes the fields of this object (audit M-39). It is the
 * schema twin of SCHOOL_SYSTEMS in the prompt: all six together, so none of them is "the
 * foreign one". Cut out whole, by serialising the same exported schema, and asserted present —
 * so an example added to any OTHER field is still a failure.
 */
const SCHOOL_YEAR_OPTIONS = JSON.stringify(toJsonSchema(SchoolYear));

/**
 * The deliberate day words: the numbering of `weekday`, `end_of_week` and `quiet_days`.
 *
 * These are not examples of anything the model should write — they are the unit of an integer
 * field, like "HH:MM" two fields further on. The model writes the NUMBER and the server resolves
 * the day in her zone (rule 2), and it cannot tell a number counted from Monday from one counted
 * from Sunday: dropping the anchor would not remove a risk, it would add the wrong day. So they
 * stay, by exact string, and every day word beyond these three passages still fails.
 */
const ISO_WEEKDAY_NUMBERING: readonly string[] = [
  'kind weekday: 1 = Monday … 7 = Sunday',
  'kind end_of_week: 0 = until Sunday of this week',
  'Full new list of weekdays without messages (1 = Monday)',
];

const DELIBERATE_IN_A_SCHEMA: readonly string[] = [
  SCHOOL_YEAR_OPTIONS,
  ...ISO_WEEKDAY_NUMBERING.map(inJson),
];

describe('the response schema is written for no one language either', () => {
  for (const [what, serialised] of SCHEMAS) {
    it(`shows ${what} no word of a single language as an example`, () => {
      expect(literalIn(serialised, DELIBERATE_IN_A_SCHEMA)).toBe('');
    });

    it(`has no umlaut or sharp s in ${what}`, () => {
      expect(serialised).not.toMatch(GERMAN_LETTERS);
    });
  }

  it('keeps the six school systems side by side where one of them has to be named', () => {
    const turn = JSON.stringify(TURN_STEP_SCHEMA);
    expect(turn).toContain(SCHOOL_YEAR_OPTIONS);
    for (const system of ['7. Klasse', 'je suis en 4e', 'terza media', 'Year 8', '8th grade']) {
      expect(SCHOOL_YEAR_OPTIONS).toContain(inJson(system));
    }
  });

  it('keeps the weekday numbering the server cannot guess', () => {
    const turn = JSON.stringify(TURN_STEP_SCHEMA);
    for (const anchor of ISO_WEEKDAY_NUMBERING) expect(turn).toContain(inJson(anchor));
  });
});

/**
 * Issue #215: Buddy could say which exercise form is out of his reach only per sheet, from
 * STATE. Asked without a sheet he had no reason to think he could not, offered a practice, and
 * the tap found nothing to run. The static block names the forms — rendered from the contract's
 * enum, so the prompt cannot hold a form the app does not know, nor miss one it does.
 */
describe('the prompt names the exercise forms Buddy has no exercise for', () => {
  it('names every form of the contract and takes its wording from nowhere else', () => {
    for (const form of NotPracticableForm.options) expect(TURN_SYSTEM).toContain(`- ${form}:`);
  });

  it('says what he may offer instead, so he does not simply refuse', () => {
    expect(TURN_SYSTEM).toContain('explain it in the chat, go through the approach or the steps');
    expect(TURN_SYSTEM).toContain('never decline something you can do');
  });
});
