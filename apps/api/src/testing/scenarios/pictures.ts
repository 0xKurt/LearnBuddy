// Scripted model answers for the browser walkthrough of the pictures whose key is read off them
// (tests/web/pictures.spec.ts, issues #254 and #255): a clock to read and one to set, money to
// count and to lay, the twenty field, base-ten blocks — and a solid to count, a cylinder to
// measure, a cube net and a point in space. The model chooses tasks only; the server writes the
// questions, draws the pictures and computes the keys (`practice/visual.ts`).
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptPictures(): void {
  scriptGenerations(
    {
      when: /LEARNER'S TEXT:\n[^\n]*Uhr und Geld/i,
      answer: () => ({
        usable: true,
        title: 'Uhr und Geld',
        subject: { name: 'Mathe', kind: 'math' },
        items: [],
        visuals: [
          { task: 'clock', hour: 7, minute: 45, set: true },
          { task: 'clock', hour: 7, minute: 30, set: false },
          { task: 'money', pieces: [200, 50, 20, 10], total: 2.8, set: true },
          { task: 'money', pieces: [500, 200, 100, 50, 20, 5, 2], total: 8.77, set: false },
          { task: 'quantity', look: 'twenty_field', number: 13 },
          { task: 'quantity', look: 'blocks', number: 247 },
        ],
      }),
    },
    {
      when: /LEARNER'S TEXT:\n[^\n]*Körper und Raum/i,
      answer: () => ({
        usable: true,
        title: 'Körper und Raum',
        subject: { name: 'Mathe', kind: 'math' },
        items: [],
        visuals: [
          { task: 'solid', solid: 'prism_6', ask: 'edges', dims: [], unit: 'cm', claim: 18 },
          {
            task: 'solid',
            solid: 'cylinder',
            ask: 'volume',
            dims: [
              { name: 'r', value: 3 },
              { name: 'h', value: 5 },
            ],
            unit: 'cm',
            claim: 141.4,
          },
          {
            task: 'cube_net',
            cells: [
              { col: 0, row: 0 },
              { col: 1, row: 0 },
              { col: 1, row: 1 },
              { col: 2, row: 1 },
              { col: 2, row: 2 },
              { col: 3, row: 2 },
            ],
            is_net: true,
          },
          { task: 'point3d', p: { x: 2, y: 3, z: 2 } },
        ],
      }),
    },
  );
  scriptTurns(
    {
      when: /uhr und geld/i,
      answer: says('Gern – erst die Uhr, dann das Geld, dann zählen wir Plättchen.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Uhr und Geld üben' } },
      ]),
    },
    {
      when: /körper und raum/i,
      answer: says('Klar – Körper, ein Würfelnetz und ein Punkt im Raum.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Körper und Raum üben' } },
      ]),
    },
  );
}
