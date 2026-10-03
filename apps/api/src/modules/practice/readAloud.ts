// Whether a question may be read aloud by its "Vorlesen" button (issue #238).
//
// Reading aloud is for the child who reads slowly — first and second grade, LRS, German as a
// second language, a word problem where the reading blocks the arithmetic. It must never be
// the way the answer arrives. Code decides that, once, from what the item IS (rule 0); the
// model has no say, and the app only shows the button the server allows.
//
// Not read aloud:
// - a question that practises spelling, capitalisation or punctuation (`spelling: 'strict'`):
//   a voice says the word right, and how a word sounds is exactly what such a task asks her
//   to turn into letters;
// - a vocabulary question whose prompt already contains its solution (or an accepted form of
//   it) as words — "le taxi" → "Taxi": a child who cannot read the word yet would hear the
//   answer. Read on the page it is the same word; read aloud, it is the answer handed over.
//
// Everything else is read: the words are what she sees, said in the prompt's language, with
// math in words (the app's `questionReadText`), never reworded by a model.

import { normalizeShortAnswer } from '@learnbuddy/shared-math';

import type { ItemKind } from '@learnbuddy/shared-types/contracts';

export type ReadAloudItem = {
  kind: ItemKind;
  prompt: string;
  answer: string;
  accepted_answers: readonly string[];
  spelling: 'strict' | 'gentle' | null;
};

/** `needle` stands in `hay` as whole words (both already normalised). */
function containsWords(hay: string, needle: string): boolean {
  if (needle.length < 2) return false;
  return ` ${hay} `.includes(` ${needle} `);
}

export function readAloudAllowed(item: ReadAloudItem): boolean {
  if (item.spelling === 'strict') return false;
  if (item.kind === 'vocab') {
    const prompt = normalizeShortAnswer(item.prompt);
    const keys = [item.answer, ...item.accepted_answers].map(normalizeShortAnswer);
    if (keys.some((key) => containsWords(prompt, key))) return false;
  }
  return true;
}
