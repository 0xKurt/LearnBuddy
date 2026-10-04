// Mehrfachauswahl mit mehreren richtigen Antworten (issue #240), Regel 0 in beiden Richtungen:
// what the model wrote is checked before anything is stored (at least two right and one wrong,
// no two alike), and the set she ticked is compared with the key exactly — no model, and a
// partial answer gets a count, never a harsh verdict.

import { StructuredTask, type SelectAllTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  selectDraftProblem,
  selectProblem,
  selectTaskFrom,
  type SelectCheck,
} from '../selectAll.js';
import {
  answerTextOf,
  checkStructured,
  solutionOf,
  structuredItem,
  structuredItems,
  structuredNamesPart,
  structuredReply,
  structuredTaskOf,
  viewOf,
} from '../structured.js';

/** The Latin form "rosae": which cases can it be? Genitive, dative and nominative. */
const ROSAE = [
  { text: 'Genitiv', correct: true },
  { text: 'Dativ', correct: true },
  { text: 'Nominativ', correct: true },
  { text: 'Akkusativ', correct: false },
  { text: 'Ablativ', correct: false },
];

function built(options = ROSAE): SelectAllTask {
  const task = selectTaskFrom({ options });
  if (!task) throw new Error('expected a task');
  return task;
}

function idOf(task: SelectAllTask, text: string): string {
  const o = task.options.find((x) => x.text === text);
  if (!o) throw new Error(`no option ${text}`);
  return o.id;
}

function check(task: SelectAllTask, texts: string[]): SelectCheck {
  const c = checkStructured(task, {
    type: 'select_all',
    chosen: texts.map((t) => idOf(task, t)),
  });
  if (!c || c.type !== 'select_all') throw new Error('expected a select check');
  return c;
}

describe('select_all: what the model wrote (Regel 0)', () => {
  it('builds a task whose key is exactly the options the model marked right', () => {
    const task = built();
    expect(task.options).toHaveLength(5);
    expect(new Set(task.key.map((id) => task.options.find((o) => o.id === id)?.text))).toEqual(
      new Set(['Genitiv', 'Dativ', 'Nominativ']),
    );
    expect(StructuredTask.safeParse(task).success).toBe(true);
    expect(selectProblem(task)).toBeNull();
  });

  it('gives ids by display position and never shows every right option first', () => {
    const task = built();
    expect(task.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const firstThree = new Set(task.options.slice(0, 3).map((o) => o.id));
    expect(task.key.every((id) => firstThree.has(id))).toBe(false);
    // Same content, same card: a replay and a second reading see the same order.
    expect(built()).toEqual(task);
  });

  it('rejects "all right" and "none right" — and a single right one (that is ordinary MC)', () => {
    const all = ROSAE.map((o) => ({ ...o, correct: true }));
    const none = ROSAE.map((o) => ({ ...o, correct: false }));
    const one = ROSAE.map((o, i) => ({ ...o, correct: i === 0 }));
    expect(selectDraftProblem({ options: all })).toBe('right_count');
    expect(selectDraftProblem({ options: none })).toBe('right_count');
    expect(selectDraftProblem({ options: one })).toBe('right_count');
    expect(selectTaskFrom({ options: all })).toBeNull();
    expect(selectTaskFrom({ options: none })).toBeNull();
    expect(selectTaskFrom({ options: one })).toBeNull();
  });

  it('rejects fewer than 3 and more than 6 options', () => {
    expect(selectDraftProblem({ options: ROSAE.slice(0, 2) })).toBe('count');
    const seven = [
      ...ROSAE,
      { text: 'Vokativ', correct: true },
      { text: 'Lokativ', correct: false },
    ];
    expect(selectDraftProblem({ options: seven })).toBe('count');
  });

  it('rejects two options that say the same, in text or in value', () => {
    expect(
      selectDraftProblem({
        options: [
          { text: 'Dativ', correct: true },
          { text: ' dativ ', correct: false },
          { text: 'Genitiv', correct: true },
        ],
      }),
    ).toBe('duplicate');
    // 0,5 and $\frac{1}{2}$ are one number: one marked right, one wrong would make the key a guess.
    expect(
      selectDraftProblem({
        options: [
          { text: '0,5', correct: true },
          { text: '$\\frac{1}{2}$', correct: false },
          { text: '$\\frac{2}{4}$', correct: true },
          { text: '0,25', correct: false },
        ],
      }),
    ).toBe('duplicate');
  });

  it('takes six short options, but only four once one is a statement (they then stand full width)', () => {
    const six = [...ROSAE, { text: 'Vokativ', correct: true }];
    expect(selectDraftProblem({ options: six })).toBeNull();
    const statements = [
      { text: 'Zwei unabhängige Bremsen', correct: true },
      { text: 'Eine helltönende Klingel', correct: true },
      { text: 'Einen Gepäckträger', correct: false },
      { text: 'Ein roter Rückstrahler', correct: true },
    ];
    expect(selectDraftProblem({ options: statements })).toBeNull();
    expect(selectDraftProblem({ options: [...statements, { text: 'Licht', correct: true }] })).toBe(
      'count',
    );
    // One word too long for half a line makes the set a list, too.
    expect(
      selectDraftProblem({
        options: [...ROSAE.slice(0, 4), { text: 'Nominativus', correct: false }],
      }),
    ).toBe('count');
  });

  it('rejects an option longer than one line of a card, and a question longer than two', () => {
    const long = [...ROSAE.slice(0, 3), { text: 'x '.repeat(15).trim(), correct: false }];
    expect(selectDraftProblem({ options: long })).toBe('too_long');
    expect(selectDraftProblem({ options: ROSAE, prompt: 'Welche? '.repeat(11) })).toBe('too_long');
    expect(
      structuredItem({
        type: 'select_all',
        prompt: 'Welche? '.repeat(11),
        options: ROSAE,
        topic: null,
        difficulty: 2,
        prompt_lang: null,
      }),
    ).toBeNull();
  });

  it('turns a draft into a question; the answer is the right options, no hint names an option', () => {
    const item = structuredItem({
      type: 'select_all',
      prompt: 'Welche Fälle kann „rosae“ sein?',
      options: ROSAE,
      topic: 'a-Deklination',
      difficulty: 2,
      prompt_lang: 'de',
      hints: [
        'Denk an die Endung -ae in beiden Zahlen.',
        // Kept: names no option.
        'Mehr als eine steht im Singular.',
        // Dropped: the whole option, and a word that belongs to one option alone.
        'Dativ ist eine davon.',
        'Und was ist mit dem Ablativ?',
      ],
    });
    expect(item?.kind).toBe('select_all');
    expect(item?.choices).toBeNull();
    expect(item?.correct_choice).toBeNull();
    expect(item?.hints).toEqual([
      'Denk an die Endung -ae in beiden Zahlen.',
      'Mehr als eine steht im Singular.',
    ]);
    const task = item?.task;
    if (!task || task.type !== 'select_all') throw new Error('expected a select task');
    expect(item?.answer).toBe(solutionOf(task));
    expect(item?.answer.split('; ').sort()).toEqual(['Dativ', 'Genitiv', 'Nominativ'].sort());
  });

  it('drops a failing draft and keeps the others; only allowed kinds', () => {
    const good = {
      type: 'select_all' as const,
      prompt: 'Welche Fälle kann „rosae“ sein?',
      options: ROSAE,
      topic: null,
      difficulty: 2,
      prompt_lang: null,
    };
    const bad = { ...good, options: ROSAE.map((o) => ({ ...o, correct: true })) };
    expect(structuredItems([bad, good], new Set(['select_all']))).toHaveLength(1);
    expect(structuredItems([good], new Set(['order']))).toHaveLength(0);
  });
});

describe('select_all: a hint that names an option', () => {
  it('drops a word that belongs to one option alone, keeps one several options share', () => {
    const item = structuredItem({
      type: 'select_all',
      prompt: 'Was muss ein verkehrssicheres Fahrrad haben?',
      options: [
        { text: 'Eine helltönende Klingel', correct: true },
        { text: 'Einen weißen Scheinwerfer', correct: true },
        { text: 'Einen Gepäckträger', correct: false },
      ],
      topic: null,
      difficulty: 1,
      prompt_lang: 'de',
      hints: [
        'Was brauchst du, um gesehen und gehört zu werden?',
        // "Einen" stands in two options: it names neither.
        'Zwei davon fangen mit „Einen“ an.',
        'Die Klingel gehört dazu.',
        'Ein Gepäckträger ist praktisch.',
      ],
    });
    expect(item?.hints).toEqual([
      'Was brauchst du, um gesehen und gehört zu werden?',
      'Zwei davon fangen mit „Einen“ an.',
    ]);
  });
});

describe('select_all: the stored task, read back', () => {
  it('reads a sound task and refuses one whose key no longer holds', () => {
    const task = built();
    expect(structuredTaskOf(task, 'select_all')).toEqual(task);
    expect(structuredTaskOf(task, 'order')).toBeNull();
    // Every option right, a key id that is not there, a key id twice: no task.
    expect(structuredTaskOf({ ...task, key: task.options.map((o) => o.id) }, 'select_all')).toBe(
      null,
    );
    expect(structuredTaskOf({ ...task, key: ['a', 'z'] }, 'select_all')).toBeNull();
    expect(structuredTaskOf({ ...task, key: ['a', 'a'] }, 'select_all')).toBeNull();
  });

  it('shows the options and never the key or how many are right', () => {
    const view = viewOf(built());
    expect(view).toEqual({ type: 'select_all', options: built().options });
    expect(JSON.stringify(view)).not.toContain('key');
  });
});

describe('select_all: her answer (Regel 0)', () => {
  const task = built();

  it('is right only for exactly the right set, in any order', () => {
    expect(check(task, ['Nominativ', 'Genitiv', 'Dativ']).correct).toBe(true);
    expect(check(task, ['Genitiv', 'Dativ']).correct).toBe(false);
    expect(check(task, ['Genitiv', 'Dativ', 'Nominativ', 'Ablativ']).correct).toBe(false);
  });

  it('counts what she found and what does not belong', () => {
    const c = check(task, ['Genitiv', 'Dativ', 'Akkusativ']);
    expect({ found: c.found, total: c.total, extra: c.extra }).toEqual({
      found: 2,
      total: 3,
      extra: 1,
    });
    expect(c.first_extra_text).toBe('Akkusativ');
  });

  it('answers a partial selection gently, with the count — never which right one is missing', () => {
    expect(structuredReply('de', check(task, ['Genitiv', 'Dativ']))).toBe(
      '2 von 3 richtigen hast du schon.',
    );
    expect(structuredReply('de', check(task, ['Genitiv', 'Dativ', 'Ablativ']))).toBe(
      '2 von 3 richtigen hast du schon. Eine passt aber nicht dazu.',
    );
    expect(
      structuredReply('de', check(task, ['Genitiv', 'Dativ', 'Nominativ', 'Ablativ', 'Akkusativ'])),
    ).toBe('Alle richtigen hast du schon. 2 passen aber nicht dazu.');
    expect(structuredReply('de', check(task, ['Ablativ']))).toBe(
      'Noch ist keine der richtigen dabei – schau dir alle nochmal in Ruhe an.',
    );
    expect(structuredReply('en', check(task, ['Genitiv']))).toBe(
      "You've got 1 of the 3 right ones.",
    );
  });

  it('names a wrongly ticked option only on the second miss, and that counts as help', () => {
    const c = check(task, ['Genitiv', 'Ablativ']);
    expect(structuredNamesPart(c, 0)).toBe(false);
    expect(structuredNamesPart(c, 1)).toBe(true);
    expect(structuredReply('de', c, 1)).toBe(
      '1 von 3 richtigen hast du schon. Eine passt aber nicht dazu. Schau dir „Ablativ“ nochmal an.',
    );
    // Only right ones, some missing: nothing to name (naming a missing one would be the answer).
    const missing = check(task, ['Genitiv']);
    expect(structuredNamesPart(missing, 3)).toBe(false);
    expect(structuredReply('de', missing, 3)).toBe('1 von 3 richtigen hast du schon.');
  });

  it('refuses an answer that ticks an option twice or one that is not there', () => {
    const a = idOf(task, 'Genitiv');
    expect(checkStructured(task, { type: 'select_all', chosen: [a, a] })).toBeNull();
    expect(checkStructured(task, { type: 'select_all', chosen: ['z'] })).toBeNull();
    expect(checkStructured(task, { type: 'order', order: ['a', 'b', 'c'] })).toBeNull();
  });

  it('writes what she ticked into the conversation, in the order she sees the options', () => {
    const chosen = ['Dativ', 'Genitiv'];
    const text = answerTextOf(task, {
      type: 'select_all',
      chosen: chosen.map((t) => idOf(task, t)),
    });
    const shown = task.options.map((o) => o.text).filter((t) => chosen.includes(t));
    expect(text).toBe(shown.join('; '));
  });
});
