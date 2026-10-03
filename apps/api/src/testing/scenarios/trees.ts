// Scripted model answers for the browser walkthrough of tree figures (tests/web/trees.spec.ts,
// issue #256): a probability tree, a plain tree, a pedigree and an automaton. Every figure here
// passes the server's own checks (`modules/practice/treeCheck.ts`) — the walkthrough sees what a
// learner would. The integration test (`trees.int.test.ts`) uses the same figures.
// Test tooling only; answers are keyed by the learner's text, never guessed.
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
};

const node = (p: number, l: string, e: string) => ({ p, l, e });

/** An urn with 3 red and 2 blue balls, two draws without putting back. */
export const urn = (ask: 'none' | 'path' | 'sum' | 'edge' = 'none', at: number[] = []) => ({
  type: 'tree',
  pr: true,
  n: [
    node(-1, '', ''),
    node(0, 'rot', '3/5'),
    node(0, 'blau', '2/5'),
    node(1, 'rot', '2/4'),
    node(1, 'blau', '2/4'),
    node(2, 'rot', '3/4'),
    node(2, 'blau', ask === 'edge' ? '?' : '1/4'),
  ],
  ask,
  at,
});

/** A binary search tree (Informatik): no key to compute, drawn top down. */
const searchTree = {
  type: 'tree',
  pr: false,
  n: [
    node(-1, '8', ''),
    node(0, '3', ''),
    node(0, '10', ''),
    node(1, '1', ''),
    node(1, '6', ''),
    node(2, '14', ''),
  ],
  ask: 'none',
  at: [],
};

const person = (s: 'm' | 'f', a: boolean, fa = -1, mo = -1) => ({ s, a, fa, mo });

/**
 * Three generations; two healthy parents (3, 4) have an affected daughter (6): only autosomal
 * recessive explains it. Persons 1 and 2 are 3's parents, 5 is 6's brother.
 */
export const recessivePedigree = (ask: 'none' | 'mode' | 'gt', at = 0) => ({
  type: 'pedigree',
  p: [
    person('m', false),
    person('f', true),
    person('m', false, 0, 1),
    person('f', false),
    person('m', false, 2, 3),
    person('f', true, 2, 3),
    person('m', false, 2, 3),
  ],
  md: 'ar',
  ask,
  at,
});

/** Accepts the words over {0, 1} with an even number of 1s. */
export const evenOnes = (w: string) => ({
  type: 'automaton',
  s: [
    { l: 'q0', f: true },
    { l: 'q1', f: false },
  ],
  t: [
    { a: 0, b: 0, c: '0' },
    { a: 0, b: 1, c: '1' },
    { a: 1, b: 1, c: '0' },
    { a: 1, b: 0, c: '1' },
  ],
  w,
});

/** The five questions, in the order the walkthrough answers them. */
export const TREE_ITEMS = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist die Wahrscheinlichkeit, zweimal Rot zu ziehen?',
    answer: '3/10',
    topic: 'Baumdiagramme',
    figure: urn('path', [3]),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Welche Wahrscheinlichkeit gehört an den Ast mit dem Fragezeichen?',
    answer: '1/4',
    topic: 'Baumdiagramme',
    figure: urn('edge'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welcher Erbgang liegt bei diesem Stammbaum vor?',
    answer: 'autosomal-rezessiv',
    choices: ['autosomal-dominant', 'autosomal-rezessiv', 'X-dominant', 'X-rezessiv'],
    correct_choice: 1,
    topic: 'Stammbaumanalyse',
    figure: recessivePedigree('mode'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welchen Genotyp hat Person 4?',
    answer: '$Aa$',
    choices: ['$AA$', '$Aa$', '$aa$'],
    correct_choice: 1,
    topic: 'Stammbaumanalyse',
    figure: recessivePedigree('gt', 3),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Wird das Wort 1010 von diesem Automaten akzeptiert?',
    answer: 'Ja',
    choices: ['Ja', 'Nein'],
    correct_choice: 0,
    topic: 'Automaten',
    figure: evenOnes('1010'),
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Welche Zahl steht in der Wurzel dieses Suchbaums?',
    answer: '8',
    topic: 'Suchbäume',
    figure: searchTree,
  },
];

export function scriptTrees(): void {
  scriptGenerations({
    when: /Baumdiagramme, Stammbäume und Automaten/i,
    answer: () => ({
      usable: true,
      title: 'Bäume',
      subject: { name: 'Mathe', kind: 'math' },
      items: TREE_ITEMS,
    }),
  });
  scriptTurns({
    when: /bäume üben/i,
    answer: says('Gern – Baumdiagramme, Stammbäume und Automaten.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Baumdiagramme, Stammbäume und Automaten' },
      },
    ]),
  });
}
