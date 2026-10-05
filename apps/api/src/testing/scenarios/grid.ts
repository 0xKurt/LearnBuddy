// Scripted model answers for the browser shots of drawing on a grid (issue #249,
// tests/web/grid.spec.ts). Its own learner sentences, so no other spec shifts these answers (#313).
// Test tooling only; answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)
//
// The model chooses the mode and its data; code fits the paper, names the points and computes the
// key (Regel 0). Each case is the LARGEST its mode may be (contracts/grid.ts, GRID_*), so the shots
// measure the worst case on 360×740 (rule 16): four points on a paper of 8 × 6 units, the line
// y = 2x − 1 of the issue's acceptance, a figure and its image filling 8 × 5 squares, six bars with
// six-letter names on six rows.

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

type Case = { when: RegExp; reply: string; ask: string; title: string; task: object };

const NONE = { points: null, fn: null, count: null, axis: null, axis_at: null, bars: null };

const CASES: Case[] = [
  {
    when: /punkte eintragen/i,
    reply: 'Gern – trag die Punkte ins Koordinatensystem ein.',
    ask: 'Punkte eintragen',
    title: 'Punkte im Koordinatensystem',
    task: {
      ...NONE,
      prompt: 'Trage die Punkte ins Koordinatensystem ein.',
      task: 'points',
      points: [
        { x: 3, y: 2 },
        { x: -2, y: 1 },
        { x: -3, y: -2 },
        { x: 1, y: -2 },
      ],
    },
  },
  {
    when: /gerade zeichnen/i,
    reply: 'Klar – setz zwei Punkte, die auf der Geraden liegen.',
    ask: 'Gerade zeichnen',
    title: 'Lineare Funktionen',
    task: { ...NONE, prompt: 'Zeichne den Graphen.', task: 'graph', fn: '2*x - 1', count: 2 },
  },
  {
    when: /figur spiegeln/i,
    reply: 'Los geht’s – spiegle das Viereck an der Achse.',
    ask: 'Figur spiegeln',
    title: 'Achsensymmetrie',
    task: {
      ...NONE,
      prompt: 'Spiegle das Viereck an der Achse.',
      task: 'mirror',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 1, y: 3 },
      ],
      axis: 'vertical',
      axis_at: 3,
    },
  },
  {
    when: /säulen zeichnen/i,
    reply: 'Gut – zieh die Säulen so hoch, wie die Zahlen sagen.',
    ask: 'Säulen zeichnen',
    title: 'Säulendiagramm',
    task: {
      ...NONE,
      prompt: 'Zeichne das Säulendiagramm zum Lieblingsobst.',
      task: 'bars',
      bars: [
        { label: 'Apfel', value: 4 },
        { label: 'Birne', value: 3 },
        { label: 'Kiwi', value: 5 },
        { label: 'Banane', value: 2 },
        { label: 'Mango', value: 1 },
        { label: 'Traube', value: 3 },
      ],
    },
  },
];

export function scriptGrid(): void {
  scriptTurns(
    ...CASES.map((c) => ({
      when: c.when,
      answer: says(c.reply, [{ tool: 'offer_learning', args: { kind: 'practice', text: c.ask } }]),
    })),
  );
  for (const c of CASES) {
    scriptGenerations({
      when: new RegExp(`LEARNER'S TEXT:\\n[^\\n]*${c.ask}`, 'i'),
      answer: () => ({
        usable: true,
        title: c.title,
        subject: { name: 'Mathe', kind: 'math' },
        items: [],
        structured: [
          { type: 'grid_draw', ...c.task, topic: c.title, difficulty: 2, prompt_lang: 'de' },
        ],
      }),
    });
  }
}
