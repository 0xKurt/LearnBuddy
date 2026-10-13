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
//     and here: a part a whole finger can hit on a phone — by its anchor on an image, by its
//     outline on the one drawing (`schematicTappable`, #599).
// Anything else about a picture — what a part does, how many there are — is no fact of the
// library, and a question about it is dropped rather than trusted. Rejected, never repaired.
// What is stored names each numbered part by its id.
//
// A stored question is held to the same check when it is read (`stalePicture`): the library
// changes — #599 took out the parts the images do not show (a bicycle's bell, a plant's root) —
// and a question that names such a part is no longer chosen for a set (`selection.ts`) nor shown
// with its picture (`storedQuestionFigure`, items.ts). Nothing is renumbered: "Wie heißt Teil 3?"
// with one name dropped would point at another part.

import {
  FIGURE_NAMES,
  isSchematic,
  schematic,
  SCHEMATIC_ANCHORS,
  SCHEMATIC_IDS,
  SCHEMATIC_SHAPES,
  schematicCanonical,
  schematicNumbered,
  schematicPart,
  schematicPartName,
  schematicProblem,
  schematicTappable,
  type SchematicId,
} from '@learnbuddy/shared-math';
import { Figure as FigureSchema, type Figure } from '@learnbuddy/shared-types/contracts';

import type { ItemDraft } from './items.js';

type Pictured = { kind: string; answer: string; figure: Figure | null; tap?: boolean | null };

/** Where the parts stand: the images' anchors and the one drawing's shapes. */
const PLACES = { anchors: SCHEMATIC_ANCHORS, shapes: SCHEMATIC_SHAPES };

/** Whether a whole finger (44 pt) can hit part `i` of picture `d` on the narrowest phone. */
function fingerFits(d: SchematicId, i: number): boolean {
  return schematicTappable(PLACES, d, i);
}

/** Why this question about a picture cannot be asked, or null when it can (or has no picture). */
function schematicItemProblem(it: Pictured): string | null {
  const f = it.figure;
  if (!f || !isSchematic(f)) return null;
  const problem = schematicProblem(FIGURE_NAMES, f);
  if (problem) return problem;
  const key = schematicPart(FIGURE_NAMES, f.d, it.answer);
  if (it.tap === true) {
    if (f.ask !== 0) return 'a tap question asks no number';
    // Numbers stand beside the drawing (the app's schematicLayout.ts) and shrink it: a finger needs
    // all of it, and a number would name nothing she is asked for.
    if (f.n.length > 0) return 'a tap question numbers no part';
    // A part of the picture, as the tap check holds it too — and what that cannot know: a whole
    // finger.
    if (key === null) return `no part "${it.answer}" in the picture ${f.d}`;
    return fingerFits(f.d, key) ? null : `"${it.answer}" is too small to tap in the picture ${f.d}`;
  }
  if (it.kind !== 'short') return `a ${it.kind} question about a picture`;
  if (f.ask === 0) return 'name a part: ask for its number';
  if (key === null) return `no part "${it.answer}" in the picture ${f.d}`;
  return key === schematicNumbered(FIGURE_NAMES, f)?.[f.ask - 1]
    ? null
    : 'the key is not the part asked for';
}

/**
 * Whether a STORED question about a picture no longer holds — it names a part the picture does not
 * have any more, as a number or as its key, or asks to tap one a finger cannot hit now (#599). Read
 * through the check it was written under, like an option's pictures (`storedChoiceFigures`); a
 * question without a picture, or with a figure of another kind, is never stale.
 */
export function stalePicture(row: {
  kind: string;
  answer: string;
  figure: unknown;
  tap?: boolean | null;
}): boolean {
  const figure = FigureSchema.safeParse(row.figure);
  if (!figure.success || !isSchematic(figure.data)) return false;
  return schematicItemProblem({ ...row, figure: figure.data }) !== null;
}

/** Whether a picture as it stands may be shown: every part it numbers is a part it has. */
export function pictureHolds(f: Figure): boolean {
  return !isSchematic(f) || schematicProblem(FIGURE_NAMES, f) === null;
}

/** The question with its numbered parts written as ids, or null when it cannot be asked. */
export function checkedSchematic<T extends Pictured>(it: T): T | null {
  if (schematicItemProblem(it) !== null) return null;
  const f = it.figure;
  return f && isSchematic(f) ? { ...it, figure: schematicCanonical(FIGURE_NAMES, f) } : it;
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
  if (schematicProblem(FIGURE_NAMES, f) !== null) return [it]; // dropped by the check, as written
  const lang = it.prompt_lang ?? locale ?? 'de';
  const ask = PART_QUESTION[lang] ?? PART_QUESTION.de!;
  const drawing = schematic(FIGURE_NAMES, f.d).names;
  const title = lang in drawing ? drawing[lang as keyof typeof drawing] : drawing.de;
  return (schematicNumbered(FIGURE_NAMES, f) ?? []).map((part, i) => ({
    ...it,
    kind: 'short',
    prompt: `${title}: ${ask(i + 1)}`,
    answer: schematicPartName(FIGURE_NAMES, f.d, part, lang),
    accepted_answers: [],
    choices: null,
    correct_choice: null,
    figure: { ...f, ask: i + 1 },
  }));
}

/**
 * The library as the model is told it: each picture with the German names of its parts, a part
 * a finger cannot hit marked "*" — it can be named, never tapped. Written from the library, so a
 * part an image does not show (#599) is no part the model is offered.
 */
export const SCHEMATIC_PARTS = SCHEMATIC_IDS.map(
  (d) =>
    `${d}: ${schematic(FIGURE_NAMES, d)
      .parts.map((p, i) => (fingerFits(d, i) ? p.de : `${p.de}*`))
      .join(', ')}`,
).join('; ');
