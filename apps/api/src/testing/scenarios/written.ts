// Scripted model answers for the browser shots of the Fehlerdetektiv and of written arithmetic
// (issue #260, tests/web/written.spec.ts). Its own learner sentences, so no other spec shifts these
// answers (#313). Test tooling only; answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)
//
// The model writes a CORRECT worked solution, or names an operation and its numbers; code builds
// the error into one line and computes every digit and carry (Regel 0). The cases are the largest
// the contract allows where it matters for rule 16: four long lines to pick from, and the tallest grids
// (five rows: two partial products and their sum; a division of three steps, two of them finished and
// shrunk, issue #413) under Buddy's reply on 360×740.

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

type Case = { when: RegExp; reply: string; ask: string; title: string; task: object };

const MATH = { name: 'Mathe', kind: 'math' } as const;

const CASES: Case[] = [
  {
    when: /fehler in der rechnung/i,
    reply: 'Gern – such die Zeile, in der es schiefgeht.',
    ask: 'Fehler in der Rechnung finden',
    title: 'Fehlerdetektiv',
    task: {
      type: 'find_error',
      prompt: 'Finde die falsche Zeile und schreib sie richtig.',
      lines: ['3(x+2) = 21', '3x + 6 = 21', '3x = 15', 'x = 5'],
    },
  },
  {
    // The most lines a card holds (four), each a long step.
    when: /langen rechenweg/i,
    reply: 'Klar – ein langer Rechenweg, eine Zeile ist falsch.',
    ask: 'Einen langen Rechenweg prüfen',
    title: 'Gleichungen',
    task: {
      type: 'find_error',
      prompt: 'Finde die falsche Zeile und schreib sie richtig.',
      lines: ['2(x + 3) - 4 = 3x - 5', '2x + 6 - 4 = 3x - 5', '2x + 2 = 3x - 5', 'x = 7'],
    },
  },
  {
    when: /schriftlich addieren/i,
    reply: 'Los geht’s – schreib Ziffer für Ziffer, mit Übertrag.',
    ask: 'Schriftlich addieren',
    title: 'Schriftliche Addition',
    task: {
      type: 'column_calc',
      prompt: 'Rechne schriftlich.',
      op: 'add',
      operands: ['4721', '1389'],
    },
  },
  {
    when: /schriftlich subtrahieren/i,
    reply: 'Gern – rechne von rechts nach links.',
    ask: 'Schriftlich subtrahieren',
    title: 'Schriftliche Subtraktion',
    task: {
      type: 'column_calc',
      prompt: 'Rechne schriftlich.',
      op: 'sub',
      operands: ['5203', '1874'],
    },
  },
  {
    when: /schriftlich malnehmen/i,
    reply: 'Gut – erst mit der 5, dann mit der 6.',
    ask: 'Schriftlich malnehmen',
    title: 'Schriftliche Multiplikation',
    task: {
      type: 'column_calc',
      prompt: 'Rechne schriftlich.',
      op: 'mul',
      operands: ['789', '56'],
    },
  },
  {
    // The tallest division: two steps under the first row, with a remainder.
    when: /schriftlich teilen/i,
    reply: 'Klar – Schritt für Schritt unter der Zahl.',
    ask: 'Schriftlich teilen',
    title: 'Schriftliche Division',
    task: {
      type: 'column_calc',
      prompt: 'Rechne schriftlich.',
      op: 'div',
      operands: ['174', '5'],
    },
  },
  {
    // A three-digit quotient (issue #413): the tallest staircase the board shows step by step.
    when: /dreistellig teilen/i,
    reply: 'Gern – drei Schritte, einer nach dem anderen.',
    ask: 'Dreistellig teilen',
    title: 'Schriftliche Division',
    task: {
      type: 'column_calc',
      prompt: 'Rechne schriftlich.',
      op: 'div',
      operands: ['672', '3'],
    },
  },
];

export function scriptWritten(): void {
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
        subject: MATH,
        items: [],
        structured: [{ ...c.task, topic: c.title, difficulty: 2, prompt_lang: 'de' }],
      }),
    });
  }
}
