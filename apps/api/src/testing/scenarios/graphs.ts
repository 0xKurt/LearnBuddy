// Scripted model answers for the walkthrough of diagrams and trees (tests/web/graphs.spec.ts,
// issues #247 and #256). The model supplies ONLY the graphs — boxes, arrows, branches, people,
// states — with its own short ids; every question, figure, board and key the walkthrough then
// reads on screen is the server's (`modules/practice/graph.ts`).
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptGraphs(): void {
  scriptGenerations({
    when: /Schemata und Bäume/i,
    answer: () => ({
      usable: true,
      title: 'Schemata und Bäume',
      subject: { name: 'Biologie', kind: 'biology' },
      items: [],
      bars: [],
      staffs: [],
      graphs: [
        // The acceptance case of #247: the water cycle with two gaps.
        {
          g: 'diagram',
          title: 'Wasserkreislauf',
          shape: 'cycle',
          ask: 'gap',
          nodes: [
            { id: 'n1', text: 'Meer' },
            { id: 'n2', text: 'Wasserdampf' },
            { id: 'n3', text: 'Wolken' },
            { id: 'n4', text: 'Regen' },
            { id: 'n5', text: 'Fluss' },
          ],
          edges: [
            { from: 'n1', to: 'n2', label: 'Verdunstung' },
            { from: 'n2', to: 'n3', label: 'Kondensation' },
            { from: 'n3', to: 'n4', label: 'Niederschlag' },
            { from: 'n4', to: 'n5', label: '' },
            { from: 'n5', to: 'n1', label: '' },
          ],
          gaps: ['n2', 'n4'],
        },
        // A food chain to put in order (#228 on a drawn chain).
        {
          g: 'diagram',
          title: 'Nahrungskette',
          shape: 'chain',
          ask: 'order',
          nodes: [
            { id: 'n1', text: 'Gras' },
            { id: 'n2', text: 'Heuschrecke' },
            { id: 'n3', text: 'Frosch' },
            { id: 'n4', text: 'Storch' },
          ],
          edges: [
            { from: 'n1', to: 'n2', label: '' },
            { from: 'n2', to: 'n3', label: '' },
            { from: 'n3', to: 'n4', label: '' },
          ],
          gaps: [],
        },
        // A probability tree: two throws of a coin.
        {
          g: 'prob',
          title: 'Zweimal Münze werfen',
          ask: 'path',
          targets: ['b1'],
          nodes: [
            { id: 'a1', text: 'Kopf', parent: null, p: '1/2' },
            { id: 'a2', text: 'Zahl', parent: null, p: '1/2' },
            { id: 'b1', text: 'Kopf', parent: 'a1', p: '1/2' },
            { id: 'b2', text: 'Zahl', parent: 'a1', p: '1/2' },
            { id: 'b3', text: 'Kopf', parent: 'a2', p: '1/2' },
            { id: 'b4', text: 'Zahl', parent: 'a2', p: '1/2' },
          ],
        },
        // A pedigree whose only fitting mode is autosomal recessive.
        {
          g: 'pedigree',
          mode: 'ar',
          ask: 'mode',
          targets: [],
          people: [
            { id: 'p1', sex: 'm', ill: false, parents: [] },
            { id: 'p2', sex: 'f', ill: false, parents: [] },
            { id: 'p3', sex: 'm', ill: false, parents: ['p1', 'p2'] },
            { id: 'p4', sex: 'f', ill: true, parents: ['p1', 'p2'] },
            { id: 'p5', sex: 'f', ill: false, parents: [] },
            { id: 'p6', sex: 'm', ill: false, parents: ['p3', 'p5'] },
            { id: 'p7', sex: 'f', ill: false, parents: ['p3', 'p5'] },
          ],
        },
      ],
    }),
  });
  // The informatics half (#256): an automaton and a word. A second run, so a set never holds
  // more than four drawings.
  scriptGenerations({
    when: /Automaten/i,
    answer: () => ({
      usable: true,
      title: 'Automaten',
      subject: { name: 'Informatik', kind: 'computer_science' },
      items: [],
      bars: [],
      staffs: [],
      graphs: [
        {
          g: 'dfa',
          states: [
            { id: 'q1', accept: false },
            { id: 'q2', accept: false },
            { id: 'q3', accept: true },
          ],
          moves: [
            { from: 'q1', to: 'q2', sym: 'a' },
            { from: 'q1', to: 'q1', sym: 'b' },
            { from: 'q2', to: 'q3', sym: 'b' },
            { from: 'q2', to: 'q2', sym: 'a' },
            { from: 'q3', to: 'q1', sym: 'a' },
            { from: 'q3', to: 'q3', sym: 'b' },
          ],
          word: 'abb',
          accepts: true,
        },
        {
          g: 'diagram',
          title: 'Kohlenstoffkreislauf',
          shape: 'cycle',
          ask: 'label',
          nodes: [
            { id: 'n1', text: 'Kohlendioxid in der Luft' },
            { id: 'n2', text: 'Pflanzen' },
            { id: 'n3', text: 'Tiere' },
            { id: 'n4', text: 'Tote Lebewesen' },
          ],
          edges: [
            { from: 'n1', to: 'n2', label: 'Fotosynthese' },
            { from: 'n2', to: 'n3', label: 'Fressen' },
            { from: 'n3', to: 'n4', label: 'Absterben' },
            { from: 'n4', to: 'n1', label: 'Zersetzung' },
          ],
          gaps: [],
        },
      ],
    }),
  });
  scriptTurns(
    {
      when: /schemata/i,
      answer: says('Gern – Schemata und Bäume zum Lesen und Ausfüllen.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Schemata und Bäume' } },
      ]),
    },
    {
      when: /automaten/i,
      answer: says('Klar – ein Automat und ein Kreislauf zum Beschriften.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Automaten' } },
      ]),
    },
  );
}
