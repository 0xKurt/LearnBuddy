// A question on a labelled picture (issue #252), checked before it is stored. Rule 0: the model
// only picks a drawing of the library and names parts; code resolves every name against the
// library (@learnbuddy/shared-math `schematics.ts`), and the key is the library's part — the
// drawing, the names in five languages and the key's spelling are code, never the model's.
//
// Three ways a picture is asked about, each with a part as the key:
//   · "Beschrifte die Pflanzenzelle" — numbers on parts and no number asked: code writes one
//     question per number, "Wie heißt Teil 1?" …, each with the library's name as its key
//     (`labelQuestions`) — the labelling task of a worksheet, no word of it from the model;
//   · "Wie heißt Teil 3?" — typed (kind short): the number asked is on a part, that part the key;
//   · "Tippe auf den Zellkern" — answered by tapping (`ItemDraft.tap`, no number on it); the tap
//     check (`tapCheck.ts`, the one mechanism of every tappable figure) holds the key to a part,
//     and here: a part big enough for a finger on a phone.
// Anything else about a picture — what a part does, how many there are — is no fact of the
// library, and a question about it is dropped rather than trusted. Rejected, never repaired.
// What is stored names each numbered part by its id.

import {
  isSchematic,
  regionTappable,
  schematic,
  SCHEMATIC_IDS,
  SCHEMATIC_SHAPES,
  schematicCanonical,
  schematicNumbered,
  schematicPart,
  schematicPartName,
  schematicProblem,
  schematicRegions,
  TAP_TARGET,
  type SchematicId,
} from '@learnbuddy/shared-math';
import type { Figure } from '@learnbuddy/shared-types/contracts';

import type { ItemDraft } from './items.js';

type Pictured = { kind: string; answer: string; figure: Figure | null; tap?: boolean | null };

/** Whether a whole finger (44 pt) can hit part `i` of drawing `d` on the narrowest phone. */
function fingerFits(d: SchematicId, i: number): boolean {
  return regionTappable(
    schematicRegions(SCHEMATIC_SHAPES, d),
    i,
    schematic(d).height,
    TAP_TARGET.picture,
  );
}

/** Why this question about a picture cannot be asked, or null when it can (or has no picture). */
function schematicItemProblem(it: Pictured): string | null {
  const f = it.figure;
  if (!f || !isSchematic(f)) return null;
  const problem = schematicProblem(f);
  if (problem) return problem;
  const key = schematicPart(f.d, it.answer);
  if (it.tap === true) {
    if (f.ask !== 0) return 'a tap question asks no number';
    // Numbers stand beside the drawing (the app's schematicLayout.ts) and shrink it: a finger needs
    // all of it, and a number would name nothing she is asked for.
    if (f.n.length > 0) return 'a tap question numbers no part';
    // On a part of the picture: the tap check. Here only what it cannot know: a whole finger.
    return key === null || fingerFits(f.d, key)
      ? null
      : `"${it.answer}" is too small to tap in the drawing ${f.d}`;
  }
  if (it.kind !== 'short') return `a ${it.kind} question about a picture`;
  if (f.ask === 0) return 'name a part: ask for its number';
  if (key === null) return `no part "${it.answer}" in the drawing ${f.d}`;
  return key === schematicNumbered(f)[f.ask - 1] ? null : 'the key is not the part asked for';
}

/** The question with its numbered parts written as ids, or null when it cannot be asked. */
export function checkedSchematic<T extends Pictured>(it: T): T | null {
  if (schematicItemProblem(it) !== null) return null;
  const f = it.figure;
  return f && isSchematic(f) ? { ...it, figure: schematicCanonical(f) } : it;
}

/** "Wie heißt Teil 3?" in the five languages; German where the question's language is another. */
const PART_QUESTION: Readonly<Record<string, (n: number) => string>> = {
  de: (n) => `Wie heißt Teil ${n}?`,
  en: (n) => `What is part ${n} called?`,
  fr: (n) => `Comment s’appelle la partie ${n} ?`,
  es: (n) => `¿Cómo se llama la parte ${n}?`,
  it: (n) => `Come si chiama la parte ${n}?`,
};

/**
 * A worksheet's labelling task — numbers on two or more parts, none asked, nothing to tap — as
 * one question per number, written by code: "Pflanzenzelle: Wie heißt Teil 2?", the library's
 * name of that part as the key. Every other draft stays as it is. The questions are then checked
 * like any other (`checkedSchematic`).
 */
export function labelQuestions(it: ItemDraft, locale: string | null): ItemDraft[] {
  const f = it.figure;
  if (!f || !isSchematic(f) || f.ask !== 0 || it.tap === true || f.n.length < 2) return [it];
  if (schematicProblem(f) !== null) return [it]; // dropped by the check, as written
  const lang = it.prompt_lang ?? locale ?? 'de';
  const ask = PART_QUESTION[lang] ?? PART_QUESTION.de!;
  const drawing = schematic(f.d).names;
  const title = lang in drawing ? drawing[lang as keyof typeof drawing] : drawing.de;
  return schematicNumbered(f).map((part, i) => ({
    ...it,
    kind: 'short',
    prompt: `${title}: ${ask(i + 1)}`,
    answer: schematicPartName(f.d, part, lang),
    accepted_answers: [],
    choices: null,
    correct_choice: null,
    figure: { ...f, ask: i + 1 },
  }));
}

/**
 * The library as the model is told it: each drawing with the German names of its parts, a part
 * too small for a finger marked "*" — it can be named, never tapped.
 */
export const SCHEMATIC_PARTS = SCHEMATIC_IDS.map(
  (d) =>
    `${d}: ${schematic(d)
      .parts.map((p, i) => (fingerFits(d, i) ? p.de : `${p.de}*`))
      .join(', ')}`,
).join('; ');
