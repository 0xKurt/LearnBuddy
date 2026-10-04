// Match items, Regel 0 in both directions (issues #224, #229): what the model wrote is
// checked before it is stored — and rejected, never repaired — and what she answers is
// compared with the key exactly, without a model. Every rejection the issue names is a test
// here, reached through the functions the server uses: `matchDraftProblem`/`matchTaskFrom`
// for a draft, `matchProblem` for a task built by hand (a stored row could hold one).

import {
  MATCH_ELEMENT_MAX,
  MATCH_GROUP_TEXT_MAX,
  MATCH_GROUPED_MAX,
  MATCH_GROUPS_MAX,
  MATCH_PAIRS_MAX,
  MATCH_PAIRS_MIN,
  MATCH_PROMPT_MAX,
  MATCH_WORD_MAX,
  StructuredTask,
  type MatchTask,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

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
import {
  matchDraftProblem,
  matchProblem,
  matchTaskFrom,
  type MatchCheck,
  type MatchDraft,
} from '../match.js';

const ORGANE: Array<{ left: string; right: string }> = [
  { left: 'Bundestag', right: 'beschließt die Gesetze' },
  { left: 'Bundesrat', right: 'vertritt die Länder' },
  { left: 'Bundeskanzler', right: 'bestimmt die Richtlinien' },
  { left: 'Bundespräsident', right: 'unterschreibt die Gesetze' },
];

const WORTARTEN: Array<{ name: string; elements: string[] }> = [
  { name: 'Nomen', elements: ['Haus', 'Freude', 'Baum'] },
  { name: 'Verb', elements: ['laufen', 'denkt'] },
  { name: 'Adjektiv', elements: ['schnell', 'grün'] },
];

const pairs = (p: Array<{ left: string; right: string }>): MatchDraft => ({
  pairs: p,
  groups: null,
});
const groups = (g: Array<{ name: string; elements: string[] }>): MatchDraft => ({
  pairs: null,
  groups: g,
});

function built(draft: MatchDraft): MatchTask {
  const task = matchTaskFrom(draft);
  expect(task, JSON.stringify(draft)).not.toBeNull();
  return task!;
}

/** Her answer that links each left TEXT to the right TEXT given here. */
function answerFor(task: MatchTask, links: Record<string, string>) {
  const leftId = new Map(task.left.map((e) => [e.text, e.id]));
  const rightId = new Map(task.right.map((e) => [e.text, e.id]));
  return {
    type: 'match' as const,
    links: Object.entries(links).map(([l, r]) => ({
      left: leftId.get(l) ?? 'zz',
      right: rightId.get(r) ?? 'zz',
    })),
  };
}

const allPairs = Object.fromEntries(ORGANE.map((p) => [p.left, p.right]));
const allGroups = Object.fromEntries(
  WORTARTEN.flatMap((g) => g.elements.map((e) => [e, g.name] as const)),
);

describe('match: what the model wrote (Regel 0)', () => {
  it('builds a pairing whose key reads back as the pairs the model wrote', () => {
    const task = built(pairs(ORGANE));
    expect(task.form).toBe('pairs');
    expect(task.left).toHaveLength(4);
    expect(task.right).toHaveLength(4);
    expect(matchProblem(task)).toBeNull();
    expect(StructuredTask.safeParse(task).success).toBe(true);
    // Every pair is in the key, whatever the display order.
    const text = new Map([...task.left, ...task.right].map((e) => [e.id, e.text]));
    const linked = task.key.map((k) => [text.get(k.left), text.get(k.right)]);
    expect(linked.sort()).toEqual(ORGANE.map((p) => [p.left, p.right]).sort());
    // Ids say where an element stands: a, b, c … on the left, r1, r2 … on the right.
    expect(task.left.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(task.right.map((e) => e.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('builds a grouping: the groups in the model order, the elements shuffled', () => {
    const task = built(groups(WORTARTEN));
    expect(task.form).toBe('groups');
    expect(task.right.map((g) => g.text)).toEqual(['Nomen', 'Verb', 'Adjektiv']);
    expect([...task.left.map((e) => e.text)].sort()).toEqual(Object.keys(allGroups).sort());
    expect(matchProblem(task)).toBeNull();
  });

  it('never shows a pairing already lined up, nor a grouping already sorted', () => {
    for (let n = MATCH_PAIRS_MIN; n <= MATCH_PAIRS_MAX; n++) {
      for (let v = 0; v < 30; v++) {
        const p = Array.from({ length: n }, (_, i) => ({
          left: `L${v}-${i}`,
          right: `R${v}-${i}`,
        }));
        const task = built(pairs(p));
        const rowOf = new Map(task.right.map((e, i) => [e.id, i]));
        const aligned = task.key.filter((k, i) => rowOf.get(k.right) === i).length;
        expect(aligned * 2, `${n} pairs, variant ${v}`).toBeLessThan(n);
      }
    }
    for (let v = 0; v < 40; v++) {
      const g = [
        { name: `A${v}`, elements: [`a${v}1`, `a${v}2`] },
        { name: `B${v}`, elements: [`b${v}1`, `b${v}2`, `b${v}3`] },
      ];
      const task = built(groups(g));
      const groupOf = new Map(task.key.map((k) => [k.left, k.right]));
      const row = task.left.map((e) => groupOf.get(e.id));
      const sorted = [...row].sort();
      expect(row, `variant ${v}`).not.toEqual(sorted);
    }
  });

  it('shuffles the same content the same way (a replay sees the same card)', () => {
    expect(built(pairs(ORGANE))).toEqual(built(pairs(ORGANE)));
    expect(built(groups(WORTARTEN))).toEqual(built(groups(WORTARTEN)));
  });

  it('rejects neither or both forms', () => {
    expect(matchDraftProblem({ pairs: null, groups: null })).toBe('form');
    expect(matchDraftProblem({ pairs: ORGANE, groups: WORTARTEN })).toBe('form');
    expect(matchTaskFrom({ pairs: ORGANE, groups: WORTARTEN })).toBeNull();
  });

  it('rejects counts out of range', () => {
    expect(matchDraftProblem(pairs(ORGANE.slice(0, 2)))).toBe('count');
    const tooMany = Array.from({ length: MATCH_PAIRS_MAX + 1 }, (_, i) => ({
      left: `l${i}`,
      right: `r${i}`,
    }));
    expect(matchDraftProblem(pairs(tooMany))).toBe('count');
    expect(matchDraftProblem(groups([WORTARTEN[0]!]))).toBe('count');
    const tooManyGroups = Array.from({ length: MATCH_GROUPS_MAX + 1 }, (_, i) => ({
      name: `G${i}`,
      elements: [`e${i}`],
    }));
    expect(matchDraftProblem(groups(tooManyGroups))).toBe('count');
    // Two groups, three elements in all: too few to sort.
    expect(
      matchDraftProblem(
        groups([
          { name: 'A', elements: ['x', 'y'] },
          { name: 'B', elements: ['z'] },
        ]),
      ),
    ).toBe('count');
    const tooManyThings = [
      { name: 'A', elements: Array.from({ length: 5 }, (_, i) => `a${i}`) },
      { name: 'B', elements: Array.from({ length: MATCH_GROUPED_MAX - 4 }, (_, i) => `b${i}`) },
    ];
    expect(matchDraftProblem(groups(tooManyThings))).toBe('count');
    expect(matchTaskFrom(groups(tooManyThings))).toBeNull();
  });

  // The maxima are what a 360×740 phone holds without the parts scrolling, measured in the
  // walkthrough with every text at its cap ("zuordnen at its largest", rule 16): 4 pairs, or 8
  // things in 3 groups. Exactly the maximum is a task; one more is not.
  it('takes the largest that fits the phone, and nothing larger', () => {
    expect(MATCH_PAIRS_MAX).toBe(4);
    expect(MATCH_GROUPS_MAX).toBe(3);
    expect(MATCH_GROUPED_MAX).toBe(8);
    const side = (c: string) =>
      `${c.repeat(MATCH_WORD_MAX)} ${c.repeat(MATCH_ELEMENT_MAX - MATCH_WORD_MAX - 1)}`;
    const largestPairs = Array.from({ length: MATCH_PAIRS_MAX }, (_, i) => ({
      left: side(String.fromCharCode(97 + i)),
      right: side(String.fromCharCode(107 + i)),
    }));
    expect(largestPairs[0]!.left).toHaveLength(MATCH_ELEMENT_MAX);
    expect(matchDraftProblem(pairs(largestPairs))).toBeNull();
    const thing = (c: string) => c.repeat(MATCH_GROUP_TEXT_MAX);
    const largestGroups = [
      { name: thing('A'), elements: ['b', 'c', 'd'].map(thing) },
      { name: thing('E'), elements: ['f', 'g', 'h'].map(thing) },
      { name: thing('I'), elements: ['j', 'k'].map(thing) },
    ];
    expect(matchDraftProblem(groups(largestGroups))).toBeNull();
    expect(
      matchDraftProblem({ ...pairs(largestPairs), prompt: 'P'.repeat(MATCH_PROMPT_MAX) }),
    ).toBeNull();
  });

  it('rejects a text, a word or a prompt that would not fit the phone', () => {
    const base = ORGANE.slice(0, 3);
    // A pair's side one character over.
    const longSide = [
      ...base,
      { left: 'Landtag', right: 'a'.repeat(9) + ' ' + 'b'.repeat(MATCH_ELEMENT_MAX - 9) },
    ];
    expect(longSide[3]!.right.length).toBe(MATCH_ELEMENT_MAX + 1);
    expect(matchDraftProblem(pairs(longSide))).toBe('too_long');
    // A word longer than a column holds, even in a short text.
    expect(
      matchDraftProblem(pairs([...base, { left: 'Bundesverfassungsgericht', right: 'prüft' }])),
    ).toBe('too_long');
    // A thing to sort, or a group's name, over its own (smaller) cap.
    const g = WORTARTEN.slice(0, 2);
    expect(
      matchDraftProblem(
        groups([...g, { name: 'Artikel', elements: ['der die das und ein eine'] }]),
      ),
    ).toBe('too_long');
    expect(
      matchDraftProblem(groups([...g, { name: 'Artikel und Pronomen', elements: ['der'] }])),
    ).toBe('too_long');
    // The prompt above the parts: one character over.
    expect(matchDraftProblem({ ...pairs(base), prompt: 'P'.repeat(MATCH_PROMPT_MAX + 1) })).toBe(
      'too_long',
    );
    // Rejected at generation: the draft gives no question, nothing is shortened.
    expect(
      structuredItem({
        type: 'match',
        prompt: 'P'.repeat(MATCH_PROMPT_MAX + 1),
        pairs: base,
        groups: null,
        topic: null,
        difficulty: 2,
        prompt_lang: 'de',
      }),
    ).toBeNull();
    // And a stored task over the caps is not read back either.
    const stored = built(pairs(base));
    expect(
      matchProblem({
        ...stored,
        left: stored.left.map((e, i) => (i === 0 ? { ...e, text: 'Bundesverfassungsgericht' } : e)),
      }),
    ).toBe('too_long');
  });

  it('rejects an empty group', () => {
    const g = [...WORTARTEN.slice(0, 2), { name: 'Artikel', elements: [] }];
    expect(matchDraftProblem(groups(g))).toBe('empty_group');
    expect(matchTaskFrom(groups(g))).toBeNull();
  });

  it('rejects a left element with two right ones, and a right one with two left ones', () => {
    const twoRights = [...ORGANE.slice(0, 3), { left: 'bundestag', right: 'wählt den Kanzler' }];
    expect(matchDraftProblem(pairs(twoRights))).toBe('ambiguous');
    const twoLefts = [...ORGANE.slice(0, 3), { left: 'Landtag', right: 'Beschließt die Gesetze.' }];
    expect(matchDraftProblem(pairs(twoLefts))).toBe('ambiguous');
    // A thing in two groups.
    const twice = [
      { name: 'Nomen', elements: ['Haus', 'Lauf'] },
      { name: 'Verb', elements: ['laufen', 'lauf'] },
    ];
    expect(matchDraftProblem(groups(twice))).toBe('ambiguous');
    expect(matchTaskFrom(groups(twice))).toBeNull();
  });

  it('rejects elements that are not unique after normalising', () => {
    // The same pair twice.
    expect(matchDraftProblem(pairs([...ORGANE.slice(0, 3), { ...ORGANE[0]! }]))).toBe('duplicate');
    // The same element twice in one group (case and spacing set aside).
    const g = [
      { name: 'Nomen', elements: ['Haus', ' haus '] },
      { name: 'Verb', elements: ['laufen', 'denkt'] },
    ];
    expect(matchDraftProblem(groups(g))).toBe('duplicate');
    // A left that reads like a right, or an element named like a group: caught on the task.
    const mirrored = [...ORGANE.slice(0, 2), { left: 'Wien', right: 'wien' }];
    expect(matchDraftProblem(pairs(mirrored))).toBeNull();
    expect(matchTaskFrom(pairs(mirrored))).toBeNull();
    const named = [
      { name: 'Nomen', elements: ['Haus', 'nomen'] },
      { name: 'Verb', elements: ['laufen', 'denkt'] },
    ];
    expect(matchTaskFrom(groups(named))).toBeNull();
    // Two groups with the same name.
    const sameName = [
      { name: 'Nomen', elements: ['Haus', 'Baum'] },
      { name: 'NOMEN', elements: ['laufen', 'denkt'] },
    ];
    expect(matchTaskFrom(groups(sameName))).toBeNull();
  });

  it('finds every problem on a stored task built by hand', () => {
    const good = built(pairs(ORGANE.slice(0, 3)));
    expect(matchProblem(good)).toBeNull();
    // A key that misses a left element.
    expect(matchProblem({ ...good, key: good.key.slice(0, 2) })).toBe('not_mapping');
    // A key that names a left element twice.
    expect(matchProblem({ ...good, key: [good.key[0]!, good.key[0]!, good.key[2]!] })).toBe(
      'not_mapping',
    );
    // A key that names an id that is not there.
    expect(
      matchProblem({
        ...good,
        key: [...good.key.slice(0, 2), { left: good.key[2]!.left, right: 'r9' }],
      }),
    ).toBe('not_mapping');
    // Two lefts to one right: a pairing that is not one.
    expect(
      matchProblem({
        ...good,
        key: good.key.map((k) => ({ left: k.left, right: good.key[0]!.right })),
      }),
    ).toBe('ambiguous');
    // Pairs with a right side of another length.
    expect(matchProblem({ ...good, right: good.right.slice(0, 2) })).toBe('count');
    // A grouping whose group gets nothing.
    const g = built(groups(WORTARTEN));
    const firstGroup = g.right[0]!.id;
    expect(
      matchProblem({
        ...g,
        key: g.key.map((k) => (k.right === firstGroup ? { ...k, right: g.right[1]!.id } : k)),
      }),
    ).toBe('empty_group');
    // A stored row that no longer holds together is no task at all.
    expect(structuredTaskOf({ ...good, key: good.key.slice(0, 2) }, 'match')).toBeNull();
    expect(structuredTaskOf(good, 'order')).toBeNull();
    expect(structuredTaskOf(good, 'match')).toEqual(good);
  });

  it('turns a draft into a question whose answer is the readable solution', () => {
    const item = structuredItem({
      type: 'match',
      prompt: 'Ordne jedem Organ seine Aufgabe zu.',
      pairs: ORGANE.slice(0, 3),
      groups: null,
      topic: 'Verfassungsorgane',
      difficulty: 2,
      prompt_lang: 'de',
      hints: [
        'Denk daran, wer die Länder vertritt.',
        // Gives a whole pair away: dropped.
        'Der Bundestag beschließt die Gesetze.',
      ],
      worked_solution: null,
    });
    expect(item?.kind).toBe('match');
    expect(item?.task.type).toBe('match');
    expect(item?.hints).toEqual(['Denk daran, wer die Länder vertritt.']);
    for (const p of ORGANE.slice(0, 3)) expect(item?.answer).toContain(`${p.left} – ${p.right}`);
    const g = built(groups(WORTARTEN));
    expect(solutionOf(g)).toBe(
      'Nomen: ' +
        g.left
          .filter((e) => ['Haus', 'Freude', 'Baum'].includes(e.text))
          .map((e) => e.text)
          .join(', ') +
        '; Verb: ' +
        g.left
          .filter((e) => ['laufen', 'denkt'].includes(e.text))
          .map((e) => e.text)
          .join(', ') +
        '; Adjektiv: ' +
        g.left
          .filter((e) => ['schnell', 'grün'].includes(e.text))
          .map((e) => e.text)
          .join(', '),
    );
    // A rejected draft is no question; one bad draft costs only itself.
    const bad = {
      type: 'match' as const,
      prompt: 'x',
      pairs: ORGANE.slice(0, 2),
      groups: null,
      topic: null,
      difficulty: 2,
      prompt_lang: 'de',
    };
    expect(structuredItem(bad)).toBeNull();
    const ok = { ...bad, pairs: ORGANE.slice(0, 3) };
    expect(structuredItems([bad, ok], new Set(['match']))).toHaveLength(1);
    expect(structuredItems([ok], new Set(['order']))).toEqual([]);
  });
});

describe('match: what she answers (Regel 0)', () => {
  const p = built(pairs(ORGANE));
  const g = built(groups(WORTARTEN));

  it('shows the task without its key', () => {
    for (const task of [p, g]) {
      const view = viewOf(task);
      expect(view).toEqual({ type: 'match', form: task.form, left: task.left, right: task.right });
      expect(JSON.stringify(view)).not.toContain('"key"');
    }
  });

  it('judges all pairs right', () => {
    const check = checkStructured(p, answerFor(p, allPairs)) as MatchCheck;
    expect(check.correct).toBe(true);
    expect(check.right).toBe(4);
    expect(check.first_wrong_text).toBeNull();
  });

  it('counts a swapped pair, and names it only from the second miss on', () => {
    const swapped = {
      ...allPairs,
      Bundestag: 'unterschreibt die Gesetze',
      Bundespräsident: 'beschließt die Gesetze',
    };
    const check = checkStructured(p, answerFor(p, swapped)) as MatchCheck;
    expect(check.correct).toBe(false);
    expect(check.right).toBe(2);
    expect(check.total).toBe(4);
    expect(check.parts.filter((x) => !x.ok)).toHaveLength(2);
    expect(structuredReply('de', check, 0)).toBe('2 von 4 Paaren stimmen schon.');
    expect(structuredNamesPart(check, 0)).toBe(false);
    const named = structuredReply('de', check, 1);
    expect(named).toMatch(
      /^2 von 4 Paaren stimmen schon\. Schau dir „Bundes(tag|präsident)“ nochmal an\.$/,
    );
    // The one it names is the first wrong one as she sees them.
    const firstWrong = p.left.find((e) => e.text === 'Bundestag' || e.text === 'Bundespräsident');
    expect(named).toContain(`„${firstWrong?.text}“`);
    expect(structuredNamesPart(check, 1)).toBe(true);
    expect(structuredReply('en', check, 0)).toBe('2 of 4 pairs are already right.');
  });

  it('says it kindly when one or none is right', () => {
    // A rotation of the rights: every pair wrong.
    const rot = Object.fromEntries(
      ORGANE.map((x, i) => [x.left, ORGANE[(i + 1) % ORGANE.length]!.right]),
    );
    const none = checkStructured(p, answerFor(p, rot)) as MatchCheck;
    expect(none.right).toBe(0);
    expect(structuredReply('de', none)).toBe(
      'Noch passt keins der Paare – schau sie dir nochmal in Ruhe an.',
    );
    const three = built(pairs(ORGANE.slice(0, 3)));
    const one = Object.fromEntries([
      [ORGANE[0]!.left, ORGANE[0]!.right],
      [ORGANE[1]!.left, ORGANE[2]!.right],
      [ORGANE[2]!.left, ORGANE[1]!.right],
    ]);
    const c = checkStructured(three, answerFor(three, one)) as MatchCheck;
    expect(structuredReply('de', c)).toBe('1 von 3 Paaren stimmt schon.');
  });

  it('judges a grouping element by element', () => {
    expect((checkStructured(g, answerFor(g, allGroups)) as MatchCheck).correct).toBe(true);
    const wrong = { ...allGroups, schnell: 'Verb', Freude: 'Adjektiv' };
    const check = checkStructured(g, answerFor(g, wrong)) as MatchCheck;
    expect(check.right).toBe(5);
    expect(check.total).toBe(7);
    expect(structuredReply('de', check)).toBe('5 von 7 sind schon richtig einsortiert.');
    // Several in one group is what a grouping is.
    expect(answerTextOf(g, answerFor(g, allGroups))).toBe(solutionOf(g));
  });

  it('refuses an answer that does not fit the task (not graded)', () => {
    const ok = answerFor(p, allPairs);
    // One left missing.
    expect(checkStructured(p, { type: 'match', links: ok.links.slice(0, 3) })).toBeNull();
    // A left twice.
    expect(
      checkStructured(p, { type: 'match', links: [...ok.links.slice(0, 3), ok.links[0]!] }),
    ).toBeNull();
    // An id that is not there.
    expect(
      checkStructured(p, {
        type: 'match',
        links: [...ok.links.slice(0, 3), { left: ok.links[3]!.left, right: 'r9' }],
      }),
    ).toBeNull();
    // Two lefts to one right in a pairing.
    expect(
      checkStructured(p, {
        type: 'match',
        links: ok.links.map((k) => ({ ...k, right: ok.links[0]!.right })),
      }),
    ).toBeNull();
    // Another kind's answer.
    expect(checkStructured(p, { type: 'order', order: ['a', 'b', 'c'] })).toBeNull();
  });
});
