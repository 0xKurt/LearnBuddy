// Fehlerdetektiv (issue #260), Regel 0 in both directions: the model's worked solution is
// stored only when code finds exactly ONE wrong line, where the model says it is, and a
// correction that follows; her tapped line and her correction are judged by the same code
// (`steps.ts`), never by a model and never by comparing characters.

import type { FindErrorTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  checkFindError,
  cleanLine,
  findErrorAnswerText,
  findErrorDraftProblem,
  findErrorProblem,
  findErrorReply,
  findErrorTaskFrom,
  shownLine,
  type FindErrorDraft,
} from '../findError.js';
import {
  answerTextOf,
  solutionOf,
  structuredItem,
  structuredTaskOf,
  viewOf,
} from '../structured.js';

/** An equation solved with a sign slip in line 3, carried on to the end. */
const EQUATION: FindErrorDraft = {
  lines: ['3x + 5 = 20', '3x = 15', 'x = 45'],
  wrong_line: 3,
  fixed_line: 'x = 5',
};

/** Halbschriftlich: 23 · 4 with a slip in the second partial product, carried on. */
const TERMS: FindErrorDraft = {
  lines: ['23 · 4', '= 20 · 4 + 3 · 4', '= 80 + 21', '= 101'],
  wrong_line: 3,
  fixed_line: '80 + 12',
};

/** A bracket slip: 2(x + 3) = 14 → 2x + 3 = 14, carried on. */
const BRACKET: FindErrorDraft = {
  lines: ['2(x + 3) = 14', '2x + 3 = 14', '2x = 11', 'x = 5,5'],
  wrong_line: 2,
  fixed_line: '2x + 6 = 14',
};

describe('findErrorDraftProblem: what the model wrote, checked (Regel 0)', () => {
  it('takes a path with exactly one wrong line, where it says, and a fix that follows', () => {
    expect(findErrorDraftProblem(EQUATION)).toBeNull();
    expect(findErrorDraftProblem(TERMS)).toBeNull();
    expect(findErrorDraftProblem(BRACKET)).toBeNull();
  });

  it('rejects a path without a mistake', () => {
    expect(
      findErrorDraftProblem({
        lines: ['3x + 5 = 20', '3x = 15', 'x = 5'],
        wrong_line: 3,
        fixed_line: 'x = 5',
      }),
    ).toBe('no_error');
  });

  it('rejects a mistake that is not where the model says it is', () => {
    expect(findErrorDraftProblem({ ...BRACKET, wrong_line: 3 })).toBe('not_where_said');
  });

  it('rejects two mistakes: a later line that does not follow either', () => {
    expect(
      findErrorDraftProblem({
        lines: ['2(x + 3) = 14', '2x + 3 = 14', '2x = 12', 'x = 6'],
        wrong_line: 2,
        fixed_line: '2x + 6 = 14',
      }),
    ).toBe('two_errors');
  });

  it('rejects a mistake in the task itself (line 1 cannot be the wrong one)', () => {
    expect(findErrorDraftProblem({ ...EQUATION, wrong_line: 1 })).toBe('not_where_said');
  });

  it('rejects a fix that does not follow, or is the wrong line again', () => {
    expect(findErrorDraftProblem({ ...EQUATION, fixed_line: 'x = 6' })).toBe('fix_wrong');
    expect(findErrorDraftProblem({ ...EQUATION, fixed_line: 'x = 45' })).toBe('fix_wrong');
    expect(findErrorDraftProblem({ ...TERMS, fixed_line: '80 + 12 = 92' })).toBe('fix_wrong');
  });

  it('rejects mixed equations and terms, and lines it cannot read', () => {
    expect(
      findErrorDraftProblem({
        lines: ['3x + 5 = 20', '3x', 'x = 5'],
        wrong_line: 2,
        fixed_line: '3x = 15',
      }),
    ).toBe('mixed');
    expect(
      findErrorDraftProblem({
        lines: ['3x + 5 = 20', '3x = 15 Äpfel', 'x = 5'],
        wrong_line: 2,
        fixed_line: '3x = 15',
      }),
    ).toBe('unreadable');
    // Two variables are outside the checker: never guessed at.
    expect(
      findErrorDraftProblem({
        lines: ['x + y = 5', 'x = 5 - y', 'x = 4'],
        wrong_line: 3,
        fixed_line: 'x = 5 - y',
      }),
    ).toBe('unreadable');
  });

  it('rejects too few or too many lines, and lines or a prompt too long for the phone', () => {
    expect(
      findErrorDraftProblem({ lines: ['3x = 15', 'x = 6'], wrong_line: 2, fixed_line: 'x = 5' }),
    ).toBe('count');
    expect(
      findErrorDraftProblem({
        lines: ['x = 1', 'x = 1', 'x = 1', 'x = 1', 'x = 1', 'x = 2'],
        wrong_line: 6,
        fixed_line: 'x = 1',
      }),
    ).toBe('count');
    expect(
      findErrorDraftProblem({
        ...EQUATION,
        lines: ['3x + 5 + 0 + 0 + 0 + 0 + 0 + 0 = 20', '3x = 15', 'x = 45'],
      }),
    ).toBe('too_long');
    expect(findErrorDraftProblem({ ...EQUATION, prompt: 'Finde den Fehler. '.repeat(6) })).toBe(
      'too_long',
    );
  });

  it('a leading minus is maths, not a bullet', () => {
    expect(
      findErrorDraftProblem({
        lines: ['-2x + 4 = 0', '-2x = -4', 'x = -2'],
        wrong_line: 3,
        fixed_line: 'x = 2',
      }),
    ).toBeNull();
  });
});

describe('the stored task', () => {
  it('names the lines by position and records the wrong one by id', () => {
    const task = findErrorTaskFrom(TERMS)!;
    expect(task.chain).toBe('term');
    expect(task.lines.map((l) => l.text)).toEqual(['23 · 4', '20 · 4 + 3 · 4', '80 + 21', '101']);
    expect(task.wrong).toBe('l3');
    expect(task.fixed).toBe('80 + 12');
    expect(shownLine(task, 'l1')).toBe('23 · 4');
    expect(shownLine(task, 'l3')).toBe('= 80 + 21');
  });

  it('is read back through Regel 0: a stored task whose wrong line is not the broken one is no task', () => {
    const task = findErrorTaskFrom(BRACKET)!;
    expect(findErrorProblem(task)).toBeNull();
    const moved: FindErrorTask = { ...task, wrong: 'l3' };
    expect(findErrorProblem(moved)).toBe('not_where_said');
    expect(structuredTaskOf(moved, 'find_error')).toBeNull();
    expect(structuredTaskOf(task, 'find_error')).toEqual(task);
  });

  it('its view never carries the wrong line or the fix', () => {
    const task = findErrorTaskFrom(BRACKET)!;
    const view = JSON.stringify(viewOf(task));
    expect(view).not.toContain('2x + 6');
    expect(view).not.toContain('wrong');
  });

  it('cleans the notation the model may write', () => {
    expect(cleanLine('$= 20 * 4$')).toBe('20 · 4');
  });
});

describe('checkFindError: her line and her correction', () => {
  const task = findErrorTaskFrom(BRACKET)!;

  it('the right line, corrected: any line that follows is right, not only the model’s', () => {
    expect(
      checkFindError(task, { type: 'find_error', line: 'l2', fix: '2x + 6 = 14' }),
    ).toMatchObject({
      correct: true,
      line_ok: true,
      fix_ok: true,
    });
    // An equivalent line — she went a step further — is just as right.
    expect(checkFindError(task, { type: 'find_error', line: 'l2', fix: '2x = 8' })?.correct).toBe(
      true,
    );
    expect(checkFindError(task, { type: 'find_error', line: 'l2', fix: 'x+3=7' })?.correct).toBe(
      true,
    );
  });

  it('a line that is fine: the fix is not judged, and the reply says the line is fine', () => {
    const check = checkFindError(task, { type: 'find_error', line: 'l3', fix: '2x = 8' })!;
    expect(check).toMatchObject({ correct: false, line_ok: false, fix_ok: null, line: 3 });
    expect(findErrorReply('de', check)).toBe(
      'Zeile 3 stimmt – sie folgt richtig aus der Zeile davor. Such weiter!',
    );
  });

  it('the right line with a wrong correction', () => {
    const check = checkFindError(task, { type: 'find_error', line: 'l2', fix: '2x + 5 = 14' })!;
    expect(check).toMatchObject({ correct: false, line_ok: true, fix_ok: false });
    expect(findErrorReply('de', check)).toBe(
      'Richtig, in Zeile 2 steckt der Fehler! Deine Verbesserung passt aber noch nicht zu Zeile 1.',
    );
  });

  it('copying the line above corrects nothing', () => {
    const check = checkFindError(task, { type: 'find_error', line: 'l2', fix: '2(x+3) = 14' })!;
    expect(check).toMatchObject({ correct: false, copied: true });
    expect(findErrorReply('en', check)).toContain('only copied the line above');
  });

  it('an empty or unreadable correction is not right', () => {
    expect(checkFindError(task, { type: 'find_error', line: 'l2', fix: '' })?.correct).toBe(false);
    expect(
      checkFindError(task, { type: 'find_error', line: 'l2', fix: 'weiß nicht' })?.correct,
    ).toBe(false);
    // A term where an equation belongs does not follow.
    expect(checkFindError(task, { type: 'find_error', line: 'l2', fix: '2x + 6' })?.correct).toBe(
      false,
    );
  });

  it('a term chain: "=" in front is hers to write or not', () => {
    const terms = findErrorTaskFrom(TERMS)!;
    expect(
      checkFindError(terms, { type: 'find_error', line: 'l3', fix: '= 80 + 12' })?.correct,
    ).toBe(true);
    expect(checkFindError(terms, { type: 'find_error', line: 'l3', fix: '80+12' })?.correct).toBe(
      true,
    );
    expect(checkFindError(terms, { type: 'find_error', line: 'l3', fix: '80 + 13' })?.correct).toBe(
      false,
    );
  });

  it('refuses a line that is not there, and the task line itself (400, not graded)', () => {
    expect(checkFindError(task, { type: 'find_error', line: 'l9', fix: 'x = 4' })).toBeNull();
    expect(checkFindError(task, { type: 'find_error', line: 'l1', fix: 'x = 4' })).toBeNull();
  });

  it('her answer and the solution in words', () => {
    expect(findErrorAnswerText(task, { type: 'find_error', line: 'l2', fix: '2x+6=14' })).toBe(
      'Zeile 2: 2x+6=14',
    );
    expect(
      answerTextOf(
        findErrorTaskFrom(TERMS)!,
        { type: 'find_error', line: 'l3', fix: '80 + 12' },
        'en',
      ),
    ).toBe('Line 3: = 80 + 12');
    expect(solutionOf(task)).toBe('Zeile 2: 2x + 6 = 14');
  });
});

describe('structured: a Fehlerdetektiv as a question', () => {
  const draft = {
    type: 'find_error' as const,
    prompt: 'Tim hat die Gleichung gelöst. Wo ist sein Fehler?',
    ...BRACKET,
    topic: 'Gleichungen',
    difficulty: 3,
    prompt_lang: 'de',
    hints: ['Schau dir die Klammer genau an.', 'Richtig wäre 2x + 6 = 14.'],
    worked_solution: null,
  };

  it('is stored with its solution, and a hint that states the fix is dropped', () => {
    const item = structuredItem(draft)!;
    expect(item.kind).toBe('find_error');
    expect(item.answer).toBe('Zeile 2: 2x + 6 = 14');
    expect(item.hints).toEqual(['Schau dir die Klammer genau an.']);
  });

  it('a draft that fails Regel 0 gives no question', () => {
    expect(structuredItem({ ...draft, wrong_line: 4 })).toBeNull();
  });
});
