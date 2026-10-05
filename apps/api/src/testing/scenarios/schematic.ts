// Scripted model answers for labelled pictures (issue #252): a plant cell to label (code writes
// one question per number), the plant cell's nucleus and a bicycle's frame to tap. Shared by the
// integration test (`__tests__/schematic-figures.int.test.ts`) and the browser walkthrough
// (tests/web/tap-figures.spec.ts). Every name is a part of its drawing and passes the server's own
// check (`modules/practice/schematicCheck.ts`). Test tooling only; answers are keyed by the
// learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  source_excerpt: null,
  kind: 'short',
  topic: 'Zelle',
};

const cell = (n: string[], ask = 0) => ({ type: 'schematic', d: 'plant_cell', n, ask });

/** The drafts the model writes, in order; the first becomes three questions. */
export const SCHEMATIC_ITEMS = [
  {
    ...base,
    prompt: 'Beschrifte die Pflanzenzelle.',
    // What the model writes as a key here is no key: code writes one per number.
    answer: 'Zellkern',
    figure: cell(['Zellkern', 'Vakuole', 'Chloroplast']),
  },
  {
    ...base,
    prompt: 'Tippe auf den Zellkern.',
    answer: 'Zellkern',
    tap: true,
    figure: cell([]),
  },
  {
    ...base,
    prompt: 'Tippe auf den Rahmen.',
    answer: 'Rahmen',
    topic: 'Fahrrad',
    tap: true,
    figure: { type: 'schematic', d: 'bicycle', n: [], ask: 0 },
  },
];

/** The questions as stored and shown, in order: the label task as code writes it, then the taps. */
export const SCHEMATIC_PROMPTS = [
  'Pflanzenzelle: Wie heißt Teil 1?',
  'Pflanzenzelle: Wie heißt Teil 2?',
  'Pflanzenzelle: Wie heißt Teil 3?',
  'Tippe auf den Zellkern.',
  'Tippe auf den Rahmen.',
];

/** Picture questions that cannot be asked as written: none of them may reach the database. */
export const BROKEN_SCHEMATIC_ITEMS = [
  // A part the drawing does not have: a plant cell has no lens.
  { ...SCHEMATIC_ITEMS[0]!, prompt: 'Beschrifte die Zelle.', figure: cell(['Zellkern', 'Linse']) },
  // A tap that asks a number.
  { ...SCHEMATIC_ITEMS[1]!, prompt: 'Tippe auf Teil 1.', figure: cell(['Zellkern'], 1) },
  // A part too small for a finger on a phone: the bell is named, never tapped.
  {
    ...SCHEMATIC_ITEMS[2]!,
    prompt: 'Tippe auf die Klingel.',
    answer: 'Klingel',
    figure: { type: 'schematic', d: 'bicycle', n: [], ask: 0 },
  },
  // The typed key is not the part asked for.
  { ...base, prompt: 'Wie heißt Teil 1?', answer: 'Vakuole', figure: cell(['Zellkern'], 1) },
  // One number and nothing asked: no question at all.
  { ...base, prompt: 'Was siehst du?', answer: 'Zellkern', figure: cell(['Zellkern']) },
  // A fact the library does not hold.
  {
    ...base,
    prompt: 'Was macht Teil 1?',
    answer: 'Er steuert die Zelle.',
    figure: cell(['Zellkern'], 1),
  },
  // A picture question that is no short answer.
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welches Teil ist 1?',
    choices: ['Zellkern', 'Vakuole'],
    correct_choice: 0,
    answer: 'Zellkern',
    figure: cell(['Zellkern'], 1),
  },
];

export function scriptSchematic(): void {
  scriptGenerations({
    when: /Bilder beschriften/i,
    answer: () => ({
      usable: true,
      title: 'Bilder beschriften',
      subject: { name: 'Biologie', kind: 'biology' },
      items: SCHEMATIC_ITEMS,
    }),
  });
  scriptTurns({
    when: /lass uns bilder beschriften/i,
    answer: says('Gern – heute beschriftest du Bilder und tippst Teile an.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Bilder beschriften' } },
    ]),
  });
}
