import { describe, expect, it } from 'vitest';

import { rubricOf } from '../rubric.js';
import {
  followsOn,
  formulaHolds,
  openPartProblem,
  partTaskItems,
  type PartTaskDraft,
} from '../taskParts.js';

type Part = PartTaskDraft['parts'][number];

function part(answer: string, from: string | null = null, kind: Part['kind'] = 'numeric'): Part {
  return {
    kind,
    prompt: `Berechne den Wert (${answer}).`,
    answer,
    accepted_answers: [],
    unit: kind === 'numeric' ? 'm' : null,
    choices: null,
    correct_choice: null,
    tolerance: null,
    read: null,
    from,
    points: [],
  };
}

const point = (name: string, statement: string, ask: string, exact: string[] = []) => ({
  name,
  point: statement,
  ask,
  exact,
});

/** An open part („Begründe …", step 2 of #297) with its key points. */
function open(prompt: string, points = FENCE_POINTS): Part {
  return { ...part('', null, 'long'), prompt, answer: 'Rand und Länge', unit: null, points };
}

const FENCE_POINTS = [
  point('Rand', 'der Zaun steht am Rand des Rechtecks', 'Wo genau steht ein Zaun?'),
  point(
    'Länge',
    'man misst eine Länge in Metern, keine Fläche',
    'In welcher Einheit misst du ihn?',
  ),
];
const WHY_PERIMETER = 'Begründe, warum man für den Zaun den Umfang braucht.';

function task(...parts: Part[]): PartTaskDraft {
  return {
    stem: 'Ein Rechteck ist 4 m lang und 2,5 m breit. Ein Zaun soll es umgeben.',
    topic: 'Umfang',
    difficulty: 2,
    prompt_lang: 'de',
    figure: null,
    parts,
  };
}

describe('tasks in parts (#297): writing', () => {
  it('letters the parts in order and gives them one group', () => {
    const items = partTaskItems(task(part('10'), part('13', 'a + 3'), part('26', 'b * 2')));
    expect(items.map((i) => i.task_part?.part)).toEqual(['a', 'b', 'c']);
    expect(new Set(items.map((i) => i.task_part?.group)).size).toBe(1);
    expect(items.every((i) => i.task_part?.of === 3)).toBe(true);
  });

  it('recomputes with decimal commas and to the key’s precision', () => {
    expect(formulaHolds('a * 0,15 + 12', 1, [part('80'), part('24')])).toBe(true);
    // 10 / 3 written as 3.33: the key's two decimals decide.
    expect(formulaHolds('a / 3', 1, [part('10'), part('3.33')])).toBe(true);
    expect(formulaHolds('a / 3', 1, [part('10'), part('3.3')])).toBe(true);
    expect(formulaHolds('a / 3', 1, [part('10'), part('3.4')])).toBe(false);
  });

  it('drops the whole task for a formula that does not hold or points nowhere', () => {
    // Does not give its own key.
    expect(partTaskItems(task(part('10'), part('14', 'a + 3')))).toEqual([]);
    // Names a later part, itself, a part that does not exist, or nothing at all.
    expect(partTaskItems(task(part('13', 'b'), part('13')))).toEqual([]);
    expect(partTaskItems(task(part('10'), part('13', 'b + 3')))).toEqual([]);
    expect(partTaskItems(task(part('10'), part('13', 'd + 3')))).toEqual([]);
    expect(partTaskItems(task(part('10'), part('13', '10 + 3')))).toEqual([]);
    // Unreadable.
    expect(partTaskItems(task(part('10'), part('13', 'a +* 3')))).toEqual([]);
    // Builds on a part that is no number.
    expect(partTaskItems(task(part('Rechteck', null, 'short'), part('13', 'a + 3')))).toEqual([]);
    // A formula on a part that is no number.
    expect(partTaskItems(task(part('10'), { ...part('mehr', 'a + 3', 'short') }))).toEqual([]);
  });
});

describe('tasks in parts (#297): open parts, checked against key points', () => {
  it('mixes computed and open parts: the open one is stored as an explanation question', () => {
    // What the model wrote beside the points is no key: no wording of hers is right by rule.
    const why = { ...open(WHY_PERIMETER), accepted_answers: ['wegen dem Rand'], unit: 'm' };
    const items = partTaskItems(task(part('13'), part('104', 'a * 8'), why));
    expect(items.map((i) => [i.task_part?.part, i.kind])).toEqual([
      ['a', 'numeric'],
      ['b', 'numeric'],
      ['c', 'long'],
    ]);
    const c = items[2]!;
    expect(c.task_part?.from).toBeNull();
    // The points are its key and its rubric, their follow-ups its hints; no model answer.
    expect(c.answer).toBe(FENCE_POINTS.map((p) => p.point).join('; '));
    expect(c.accepted_answers).toEqual([]);
    expect(c.unit).toBeNull();
    expect(rubricOf(c.rubric)?.elements.map((e) => [e.name, e.check.by])).toEqual([
      ['Rand', 'key_point'],
      ['Länge', 'key_point'],
    ]);
    expect(c.hints).toEqual(FENCE_POINTS.map((p) => p.ask));
    expect(c.worked_solution).toBeNull();
    expect(c.spelling).toBe('gentle');
    // The computed parts carry no rubric.
    expect(items[0]!.rubric).toBeNull();
  });

  it.each([
    ['too few key points', open(WHY_PERIMETER, FENCE_POINTS.slice(0, 1))],
    [
      'point stated in the question',
      open('Begründe: der Zaun steht am Rand des Rechtecks. Warum also der Umfang?'),
    ],
    [
      'follow-up gives the point away',
      open(WHY_PERIMETER, [
        FENCE_POINTS[0]!,
        { ...FENCE_POINTS[1]!, ask: 'Stimmt es: man misst eine Länge in Metern, keine Fläche?' },
      ]),
    ],
    [
      'point hangs on an earlier result',
      open('Begründe, ob 100 € für den Zaun reichen.', [
        point('Kosten', 'der Zaun kostet mehr als 100 €', 'Was kostet der Zaun?', ['104 €']),
        point('Vergleich', 'das Geld reicht also nicht', 'Reicht das Geld?'),
      ]),
    ],
    [
      'point hangs on an earlier result',
      open('Begründe, ob 100 € für den Zaun reichen.', [
        point('Kosten', 'der Zaun kostet 104 €, mehr als 100 €', 'Was kostet der Zaun?'),
        point('Vergleich', 'das Geld reicht also nicht', 'Reicht das Geld?'),
      ]),
    ],
  ])('%s → the whole task is dropped', (why, c) => {
    const d = task(part('13'), part('104', 'a * 8'), c);
    expect(openPartProblem(d, 2)).toBe(why);
    expect(partTaskItems(d)).toEqual([]);
  });

  it('a point stated in the situation counts as stated', () => {
    const d = {
      ...task(part('13'), open(WHY_PERIMETER)),
      stem: 'Ein Rechteck ist 4 m lang und 2,5 m breit. Der Zaun steht am Rand des Rechtecks.',
    };
    expect(openPartProblem(d, 1)).toBe('point stated in the question');
  });

  it('a number the situation states is hers to use, even when it is an earlier key', () => {
    const d = {
      ...task(
        part('13'),
        open('Begründe, ob der Zaun des Nachbarn reicht.', [
          point('Länge', 'sein Zaun ist 13 m lang, so lang wie der Umfang', 'Wie lang ist er?'),
          point('Ergebnis', 'er reicht genau', 'Reicht er also?'),
        ]),
      ),
      stem: 'Ein Rechteck ist 4 m lang und 2,5 m breit. Der Nachbar hat 13 m Zaun übrig.',
    };
    expect(openPartProblem(d, 1)).toBeNull();
    expect(partTaskItems(d)).toHaveLength(2);
  });

  it('a closed part carries no key points, an open part no formula', () => {
    const pointed = { ...part('13'), points: FENCE_POINTS };
    expect(openPartProblem(task(pointed, open(WHY_PERIMETER)), 0)).toBe(
      'key points on a closed part',
    );
    expect(partTaskItems(task(pointed, open(WHY_PERIMETER)))).toEqual([]);
    expect(partTaskItems(task(part('13'), { ...open(WHY_PERIMETER), from: 'a' }))).toEqual([]);
  });

  it('an open part never follows on: it has no formula to recompute', () => {
    const [, c] = partTaskItems(task(part('13'), open(WHY_PERIMETER)));
    expect(
      followsOn(c!.task_part!, c!, 'am Rand', [{ part: 'a', answer: '13', text: '12' }]),
    ).toBeNull();
  });
});

describe('tasks in parts (#297): Folgefehler', () => {
  const [, b] = partTaskItems(task(part('10'), part('13', 'a + 3')));
  const p = b!.task_part!;

  it('follows her wrong a) to a right b)', () => {
    expect(followsOn(p, b!, '12 m', [{ part: 'a', answer: '10', text: '9 m' }])).toBe('a');
    // Her working, ending in the number: the last value counts.
    expect(followsOn(p, b!, '9 + 3 = 12', [{ part: 'a', answer: '10', text: '9' }])).toBe('a');
  });

  it('says nothing when her a) was right, missing, unreadable, or b) does not follow', () => {
    expect(followsOn(p, b!, '13 m', [{ part: 'a', answer: '10', text: '10 m' }])).toBeNull();
    expect(followsOn(p, b!, '12 m', [])).toBeNull();
    expect(
      followsOn(p, b!, '12 m', [{ part: 'a', answer: '10', text: 'keine Ahnung' }]),
    ).toBeNull();
    expect(followsOn(p, b!, '11 m', [{ part: 'a', answer: '10', text: '9 m' }])).toBeNull();
  });
});
