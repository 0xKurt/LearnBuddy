// Informatik tasks (issue #262): a program whose output she predicts, a program with a failing
// line, a function she writes against test cases and a query on a small table. Every claim here
// is what the sandbox computes (`modules/practice/code.ts` runs it before anything is stored).
// Shared by the integration test (`__tests__/code-practice.int.test.ts`) and the browser
// walkthrough of the gallery (tests/web/gallery.spec.ts, issue #387). Her own sentence
// („Programme und Abfragen"), which no other spec types (#350).
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { CodeTask } from '@learnbuddy/shared-types/contracts';

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export const PREDICT: CodeTask = {
  task: 'predict_output',
  program: 'summe = 0\nfor i in range(1, 4):\n    summe = summe + i\n    print(summe)',
  output: '1\n3\n6',
};

export const FIND: CodeTask = {
  task: 'find_error',
  program: 'werte = [4, 0, 2]\nfor w in werte:\n    print(8 / w)',
  line: 3,
};

export const WRITE: CodeTask = {
  task: 'write_function',
  name: 'verdoppeln',
  params: ['zahl'],
  statement: 'Die Funktion gibt das Doppelte der Zahl zurück.',
  tests: [
    { args: '2', expected: '4' },
    { args: '0', expected: '0' },
    { args: '-3', expected: '-6' },
    { args: '1.5', expected: '3.0' },
  ],
  solution: 'def verdoppeln(zahl):\n    return zahl * 2',
};

export const QUERY: CodeTask = {
  task: 'sql_query',
  table: 'schueler',
  columns: [
    { name: 'name', type: 'TEXT' },
    { name: 'klasse', type: 'TEXT' },
  ],
  rows: [
    ['Ada', '7a'],
    ['Ben', '7b'],
    ['Cem', '7a'],
  ],
  statement: 'Finde die Namen aller Schüler der Klasse 7a.',
  query: "SELECT name FROM schueler WHERE klasse = '7a'",
  result: [['Ada'], ['Cem']],
};

/** What the generator answers for a practice run of these tasks. */
export function codeRun(codes: CodeTask[]) {
  return {
    usable: true,
    title: 'Python und SQL',
    subject: { name: 'Informatik', kind: 'computer_science' },
    items: [],
    codes,
  };
}

export function scriptCode(): void {
  scriptTurns({
    when: /programme und abfragen/i,
    answer: says('Gern – vier Aufgaben am Code, jede läuft vorher wirklich.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Programme und Abfragen' } },
    ]),
  });
  scriptGenerations({
    when: /Programme und Abfragen/i,
    answer: () => codeRun([PREDICT, FIND, WRITE, QUERY]),
  });
}
