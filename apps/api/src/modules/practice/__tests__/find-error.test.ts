// Fehlerdetektiv (issue #260), Regel 0 in beiden Richtungen: the model writes a CORRECT worked
// solution, code checks every step (`steps.ts`), builds the error into one line itself and proves
// that exactly that line breaks. Her answer is the line she tapped and that line written right;
// the correction is compared with the line before by the same equivalence — never by a model.

import { FindErrorTask, FindErrorTaskView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { findErrorProblem, findErrorTaskFrom, type FindErrorCheck } from '../findError.js';
import { checkPath } from '../steps.js';
import {
  answerTextOf,
  checkStructured,
  secretsOf,
  structuredItem,
  structuredNamesPart,
  structuredReply,
  structuredTaskOf,
  structuredVerdict,
  viewOf,
} from '../structured.js';

const BRACKET = ['3(x+2) = 21', '3x + 6 = 21', '3x = 15', 'x = 5'];
const MINUS = ['5 - (x - 2) = 1', '5 - x + 2 = 1', '7 - x = 1', 'x = 6'];
const SPLIT = ['347 + 285', '347 + 200 + 85', '547 + 85', '632'];
const SHORT = ['2x + 3 = 11', '2x = 8', 'x = 4'];

function built(lines: string[]): FindErrorTask {
  const task = findErrorTaskFrom({ lines });
  if (!task) throw new Error('expected a task');
  return task;
}

function check(task: FindErrorTask, line: string, fix: string): FindErrorCheck {
  const c = checkStructured(task, { type: 'find_error', line, fix });
  if (!c || c.type !== 'find_error') throw new Error('expected a find_error check');
  return c;
}

const textsOf = (task: FindErrorTask) => task.lines.map((l) => l.text);

describe('find_error: the error, built by code', () => {
  it('dissolves a bracket the classic wrong way where a line dissolves one', () => {
    const task = built(BRACKET);
    expect(textsOf(task)).toEqual(['3(x+2) = 21', '3x+2 = 21', '3x = 15', 'x = 5']);
    expect(task.key).toBe('l2');
    expect(task.right).toBe('3x + 6 = 21');
  });

  it('forgets to turn the signs after a minus before a bracket', () => {
    expect(textsOf(built(MINUS))[1]).toBe('5 - x - 2 = 1');
  });

  it('builds a slip of a sign or a number into a path without brackets — halbschriftlich too', () => {
    const split = built(SPLIT);
    expect(split.key).not.toBe('l1');
    expect(textsOf(split)).not.toEqual(SPLIT);
    const short = built(SHORT);
    expect(short.lines).toHaveLength(3);
  });

  it('breaks exactly one line: the wrong one is the first that no longer follows', () => {
    for (const lines of [BRACKET, MINUS, SPLIT, SHORT]) {
      const task = built(lines);
      const k = task.lines.findIndex((l) => l.id === task.key);
      expect(checkPath(textsOf(task).join('\n'))).toMatchObject({ kind: 'broke', line: k });
      // Put back, the path is the model's sound solution again.
      const right = textsOf(task).map((l, i) => (i === k ? task.right : l));
      expect(checkPath(right.join('\n')).kind).toBe('sound');
      expect(findErrorProblem(task)).toBeNull();
    }
  });

  it('chooses from the content, never by chance: the same solution gives the same card', () => {
    expect(built(SPLIT)).toEqual(built(SPLIT));
  });

  it('never makes the task itself wrong, and never sends the key to the app', () => {
    for (const lines of [BRACKET, MINUS, SPLIT, SHORT]) {
      const task = built(lines);
      expect(task.lines[0]!.text).toBe(lines[0]);
      const view = viewOf(task);
      expect(FindErrorTaskView.strict().safeParse(view).success).toBe(true);
      expect(JSON.stringify(view)).not.toContain(task.right);
    }
  });
});

describe('find_error: what the model wrote (Regel 0)', () => {
  it('rejects a solution that is already wrong, unreadable, too short, too long or repeats itself', () => {
    expect(findErrorTaskFrom({ lines: ['2x + 3 = 11', '2x = 9', 'x = 4.5'] })).toBeNull();
    expect(findErrorTaskFrom({ lines: ['2x + 3 = 11', 'also 2x = 8', 'x = 4'] })).toBeNull();
    expect(findErrorTaskFrom({ lines: ['2x + 3 = 11', 'x = 4'] })).toBeNull();
    expect(
      findErrorTaskFrom({
        lines: ['x + 1 = 2', 'x + 2 = 3', 'x + 0 = 1', '2x = 2', 'x = 1'],
      }),
    ).toBeNull();
    expect(findErrorTaskFrom({ lines: ['2x + 3 = 11', '2x = 8', '2x = 8'] })).toBeNull();
    expect(
      findErrorTaskFrom({
        lines: ['x + 100000 + 200000 + 300000 + 400000 = 1000001', 'x = 1', 'x + 1 = 2'],
      }),
    ).toBeNull();
  });

  it('reads back a stored task only while exactly one line is wrong', () => {
    const task = built(BRACKET);
    expect(structuredTaskOf(task, 'find_error')).not.toBeNull();
    // The error taken out: nothing is wrong any more, so it is no task.
    const healed = {
      ...task,
      lines: task.lines.map((l) => (l.id === task.key ? { ...l, text: task.right } : l)),
    };
    expect(structuredTaskOf(healed, 'find_error')).toBeNull();
    // The first line can never be the wrong one.
    expect(structuredTaskOf({ ...task, key: 'l1', right: '3(x+2) = 21' }, 'find_error')).toBeNull();
    expect(FindErrorTask.safeParse(task).success).toBe(true);
  });

  it('turns a draft into an item: the solution is code’s, hints that give the line away are dropped', () => {
    const item = structuredItem({
      type: 'find_error',
      prompt: 'Finde die falsche Zeile und verbessere sie.',
      lines: BRACKET,
      hints: ['Prüfe jede Zeile: folgt sie aus der davor?', 'Richtig wäre 3x + 6 = 21.'],
      topic: 'Gleichungen',
      difficulty: 3,
      prompt_lang: 'de',
    });
    expect(item).toMatchObject({
      kind: 'find_error',
      answer: '② 3x + 6 = 21',
      hints: ['Prüfe jede Zeile: folgt sie aus der davor?'],
      worked_solution: null,
    });
    expect(secretsOf(item!.task, item!.prompt).secrets).toEqual(['3x + 6 = 21']);
  });
});

describe('find_error: her answer, checked by code', () => {
  const task = built(BRACKET);

  it('takes the wrong line with any equivalent correction', () => {
    for (const fix of ['3x + 6 = 21', '6 + 3x = 21', '3·x+6=21']) {
      const c = check(task, 'l2', fix);
      expect(c.correct, fix).toBe(true);
      expect(structuredVerdict(c)).toBe('correct');
    }
  });

  it('says where to look when she tapped another line, never which one it is', () => {
    const later = check(task, 'l3', '3x = 15');
    expect(later).toMatchObject({ correct: false, look: 'earlier', fix: null });
    expect(structuredVerdict(later)).toBe('incorrect');
    expect(structuredReply('de', later)).toBe('Der Fehler steckt schon weiter oben.');
    // The bracket is dissolved in the third line here, so the error can only stand there.
    const third = built(['x + 3 = 6', '2(x + 3) = 12', '2x + 6 = 12', 'x = 3']);
    expect(third.key).toBe('l3');
    const early = check(third, 'l2', '2(x + 3) = 12');
    expect(early.look).toBe('later');
    expect(structuredReply('de', early)).toBe(
      'Bis zu dieser Zeile stimmt alles – der Fehler kommt erst weiter unten.',
    );
    expect(structuredNamesPart(later, 1)).toBe(false);
  });

  it('half right: the line found, the correction not yet — and why, without claiming too much', () => {
    const wrongFix = check(task, 'l2', '3x + 5 = 21');
    expect(wrongFix).toMatchObject({ correct: false, look: null, fix: 'different' });
    expect(structuredVerdict(wrongFix)).toBe('partially_correct');
    expect(structuredReply('de', wrongFix)).toContain('passt aber noch nicht zur Zeile davor');
    // Not maths it can read: said so, never called wrong maths.
    const unreadable = check(task, 'l2', 'mal drei rechnen');
    expect(unreadable.fix).toBe('unreadable');
    expect(structuredReply('en', unreadable)).toContain("can't read your correction");
    // The line before, copied: no step.
    expect(check(task, 'l2', '3(x+2) = 21').fix).toBe('repeat');
    // Left unchanged: still the wrong line.
    expect(check(task, 'l2', '3x+2 = 21').fix).toBe('different');
  });

  it('refuses a tap on the task itself or on a line that is not there', () => {
    expect(checkStructured(task, { type: 'find_error', line: 'l1', fix: 'x = 5' })).toBeNull();
    expect(checkStructured(task, { type: 'find_error', line: 'l9', fix: 'x = 5' })).toBeNull();
    expect(checkStructured(task, { type: 'order', order: ['a', 'b', 'c'] })).toBeNull();
  });

  it('keeps her answer in the conversation with the line’s number', () => {
    expect(answerTextOf(task, { type: 'find_error', line: 'l2', fix: '3x + 6 = 21' }, 'de')).toBe(
      '② 3x + 6 = 21',
    );
  });
});
