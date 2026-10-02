// The guided worked example (issue #298): the plan is checked in both directions, her steps by
// code alone, a key point only with a quote from her text.

import { describe, expect, it } from 'vitest';

import type { ItemForCheck } from '../evaluate.js';
import {
  checkPointsPlan,
  checkStepsPlan,
  guideKindFor,
  openGuide,
  planOf,
  pointsTurn,
  reachesKey,
  rejectionNote,
  stepsTurn,
  type GuidePlan,
  type GuideState,
  type StepsDraft,
} from '../guide.js';

const item: ItemForCheck & { prompt: string } = {
  kind: 'numeric',
  answer: '4',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  tolerance: null,
  spelling: null,
  subject_kind: 'math',
  prompt: 'Löse: $2x + 3 = 11$',
};

const line = (
  l: string,
  say = 'Weil beide Seiten gleich bleiben.',
  hint = 'Rechne auf beiden Seiten.',
) => ({
  line: l,
  say,
  hint,
});

const good: StepsDraft = {
  lines: [
    line('2x + 3 = 11', 'Das ist gegeben.', ''),
    line('2x = 8', 'Minus 3 auf beiden Seiten.', 'Zieh auf beiden Seiten 3 ab.'),
    line('x = 4', 'Durch 2 geteilt.', 'Teile beide Seiten durch 2.'),
  ],
  figure: null,
};

function stepsPlan(
  draft: StepsDraft = good,
  forItem: ItemForCheck & { prompt: string } = item,
): Extract<GuidePlan, { kind: 'steps' }> {
  const r = checkStepsPlan(forItem, draft, forItem.answer);
  if (!r.ok) throw new Error(`plan rejected: ${r.reason}`);
  return r.plan;
}

describe('guideKindFor', () => {
  const base = { bar_task: null, staff_task: null, parts_task: null, listen_task: null };
  it('offers steps for a calculation and points for a free text', () => {
    expect(guideKindFor({ ...base, kind: 'numeric', answer: '4' })).toBe('steps');
    expect(guideKindFor({ ...base, kind: 'formula', answer: '2x+6' })).toBe('steps');
    expect(guideKindFor({ ...base, kind: 'short', answer: 'x = 4' })).toBe('steps');
    expect(guideKindFor({ ...base, kind: 'long', answer: 'Ein Text' })).toBe('points');
  });
  it('offers nothing code could not follow', () => {
    expect(guideKindFor({ ...base, kind: 'short', answer: 'Berlin' })).toBeNull();
    expect(guideKindFor({ ...base, kind: 'vocab', answer: 'dog' })).toBeNull();
    expect(guideKindFor({ ...base, kind: 'multiple_choice', answer: '4' })).toBeNull();
    expect(guideKindFor({ ...base, kind: 'numeric', answer: '4', bar_task: {} })).toBeNull();
    expect(guideKindFor({ ...base, kind: 'long', answer: 'x', listen_task: {} })).toBeNull();
  });
});

describe('reachesKey', () => {
  it('reads the right side of "x = …" against a bare key', () => {
    expect(reachesKey(item, 'x = 4')).toBe(true);
    expect(reachesKey(item, '4')).toBe(true);
    expect(reachesKey(item, 'x = 5')).toBe(false);
    expect(reachesKey(item, '2x = 8')).toBe(false);
  });
});

describe('checkStepsPlan — what the model writes is checked, never mended', () => {
  it('accepts a sound path that ends at the key', () => {
    const r = checkStepsPlan(item, good, '4');
    expect(r.ok).toBe(true);
  });
  it('rejects a step that does not follow', () => {
    const r = checkStepsPlan(
      item,
      { ...good, lines: [good.lines[0]!, line('2x = 14'), line('x = 7')] },
      '4',
    );
    expect(r).toMatchObject({ ok: false, reason: 'step_broke', at: 1 });
  });
  it('rejects a sound path that ends somewhere else than the key, or not in its form', () => {
    const wrong = checkStepsPlan(
      { ...item, answer: '5' },
      { ...good, lines: [good.lines[0]!, line('2x = 8'), line('x = 4')] },
      '5',
    );
    expect(wrong).toMatchObject({ ok: false, reason: 'not_the_key' });
    // 8/2 has the key's value, but it is not the result as the key writes it: the last line of
    // a plan is what she should arrive at, so it must be the key itself.
    const unfinished = checkStepsPlan(
      item,
      { ...good, lines: [good.lines[0]!, line('2x = 8'), line('x = 8/2')] },
      '4',
    );
    expect(unfinished).toMatchObject({ ok: false, reason: 'not_the_key' });
  });
  it('rejects a line it cannot read, a repeated line and too short a path', () => {
    expect(
      checkStepsPlan(
        item,
        { ...good, lines: [good.lines[0]!, line('2x = 8 | :2'), line('x = 4')] },
        '4',
      ),
    ).toMatchObject({ ok: false, reason: 'line_unreadable', at: 1 });
    expect(
      checkStepsPlan(
        item,
        { ...good, lines: [good.lines[0]!, line('2x+3 = 11'), line('x = 4')] },
        '4',
      ),
    ).toMatchObject({ ok: false, reason: 'repeated_line' });
    expect(checkStepsPlan(item, { ...good, lines: good.lines.slice(1) }, '4')).toMatchObject({
      ok: false,
      reason: 'too_few_lines',
    });
  });
  it('rejects a path whose first line already is the result', () => {
    const r = checkStepsPlan(
      item,
      { ...good, lines: [line('x = 4'), line('2x = 8'), line('x = 4 + 0')] },
      '4',
    );
    expect(r.ok).toBe(false);
  });
  it('rejects an explanation that gives the result away before the end', () => {
    const r = checkStepsPlan(
      item,
      {
        ...good,
        lines: [good.lines[0]!, line('2x = 8', 'Am Ende kommt 4 heraus.'), good.lines[2]!],
      },
      '4',
    );
    expect(r).toMatchObject({ ok: false, reason: 'say_gives_key', at: 1 });
  });
  it('drops a hint that states its own line, as hints.ts drops one that states the result', () => {
    const plan = stepsPlan({
      ...good,
      lines: [
        good.lines[0]!,
        line('2x = 8', 'Minus 3.', 'Es kommt 2x = 8 heraus.'),
        good.lines[2]!,
      ],
    });
    expect(plan.lines[1]!.hint).toBeNull();
    expect(plan.lines[2]!.hint).toBe('Teile beide Seiten durch 2.');
  });
  it('drops a figure that does not hold and keeps the plan', () => {
    const plan = stepsPlan({
      ...good,
      figure: {
        type: 'function_plot',
        functions: [{ expr: '2*x+3', label: null }],
        x_min: 5,
        x_max: 1,
        y_min: 0,
        y_max: 20,
        points: [],
      },
    });
    expect(plan.figure).toBeNull();
  });
  it('tells the model why, for its one second try', () => {
    expect(rejectionNote('step_broke', 1)).toContain('line 2 is not equivalent');
  });
});

describe('stepsTurn — her step, checked by code', () => {
  const key = { ...item, answer: '7', prompt: 'Löse $3(x-2) = 2x+1$' };
  const plan = stepsPlan(
    {
      ...good,
      lines: [
        line('3(x - 2) = 2x + 1', 'Gegeben.', ''),
        line('3x - 6 = 2x + 1', 'Klammer ausmultipliziert.', 'Multipliziere die Klammer aus.'),
        line('x - 6 = 1', 'Minus 2x auf beiden Seiten.', 'Bring alle x auf eine Seite.'),
        line('x = 7', 'Plus 6.', 'Addiere 6 auf beiden Seiten.'),
      ],
    },
    key,
  );
  const opened = openGuide('de', plan);

  it('opens with line 1 → line 2 and leaves line 3 to her', () => {
    expect(opened.state).toEqual({ at: 2, misses: 0, prev: '3x - 6 = 2x + 1', status: 'active' });
    expect(opened.reply).toContain('$3(x - 2) = 2x + 1$');
    expect(opened.reply).toContain('$3x - 6 = 2x + 1$');
  });

  it('accepts the plan’s step and lets her write the last line herself', () => {
    const r = stepsTurn('de', key, plan, opened.state, 'x - 6 = 1');
    expect(r.solved).toBe(false);
    // Line 3 is the last but one: Buddy does not show the result, she writes it.
    expect(r.next).toEqual({ at: 3, misses: 0, prev: 'x - 6 = 1', status: 'active' });
  });

  it('accepts her own way when it follows', () => {
    const r = stepsTurn('de', key, plan, opened.state, '3x = 2x + 7');
    expect(r.solved).toBe(false);
    expect(r.next.prev).toBe('3x = 2x + 7');
    expect(r.reply).toContain('eigener Weg');
  });

  it('closes as solved when her line arrives at the key', () => {
    const r = stepsTurn(
      'de',
      key,
      plan,
      { at: 3, misses: 0, prev: 'x - 6 = 1', status: 'active' },
      'x = 7',
    );
    expect(r.solved).toBe(true);
    expect(r.revealed).toBe(false);
    expect(r.next.status).toBe('done');
  });

  it('counts a line that is the result even where the step checker cannot follow the step', () => {
    // 1/R = 1/2 → R = 2 is right, and `steps.ts` reads it as "does not follow" (one variable,
    // not proportional). The result is judged like any answer, so she is not told it is wrong.
    const ohm = { ...item, answer: '2', prompt: 'Berechne R.' };
    // A plan like this never passes the check (that is the limit); built by hand to reach the
    // last step.
    const reciprocal: Extract<GuidePlan, { kind: 'steps' }> = {
      kind: 'steps',
      lines: [line('1/R = 1/6 + 1/3'), line('1/R = 1/2'), line('R = 2')],
      figure: null,
    };
    const r = stepsTurn(
      'de',
      ohm,
      reciprocal,
      { at: 3, misses: 0, prev: '1/R = 1/2', status: 'active' },
      'R = 2',
    );
    expect(r.solved).toBe(true);
  });

  it('reads several lines in order and stops at the result', () => {
    const r = stepsTurn('de', key, plan, opened.state, 'x - 6 = 1\nx = 7');
    expect(r.solved).toBe(true);
  });

  it('counts a step that does not follow, with the plan’s hint, and shows the step after two', () => {
    const one = stepsTurn('de', key, plan, opened.state, 'x - 6 = 3');
    expect(one.solved).toBe(false);
    expect(one.next.misses).toBe(1);
    expect(one.reply).toContain('Bring alle x auf eine Seite.');
    const two = stepsTurn('de', key, plan, one.next, 'x = 9');
    expect(two.revealed).toBe(false);
    expect(two.next).toEqual({ at: 3, misses: 0, prev: 'x - 6 = 1', status: 'active' });
    expect(two.reply).toContain('$x - 6 = 1$');
  });

  it('shows the last step after two misses there, and the question closes as shown', () => {
    const at = { at: 3, misses: 1, prev: 'x - 6 = 1', status: 'active' } as const;
    const r = stepsTurn('de', key, plan, at, 'x = 5');
    expect(r.revealed).toBe(true);
    expect(r.solved).toBe(false);
    expect(r.next.status).toBe('done');
  });

  it('never calls a line wrong that it cannot read, and does not count it', () => {
    const r = stepsTurn('de', key, plan, opened.state, 'keine Ahnung');
    expect(r.next).toEqual(opened.state);
    expect(r.reply).toContain('nicht nachrechnen');
  });

  it('does not count the same line typed again', () => {
    const r = stepsTurn('de', key, plan, opened.state, '3x - 6 = 2x + 1');
    expect(r.next).toEqual(opened.state);
    expect(r.reply).toContain('dieselbe Zeile');
  });
});

describe('text guide — key points with a quote from her text', () => {
  const draft = {
    points: [
      {
        name: 'These',
        missing: 'Nenne deine Position zum Thema.',
        demo: 'Ich bin der Meinung, dass Handys in der Schule erlaubt sein sollten.',
      },
      {
        name: 'Argument mit Beispiel',
        missing: 'Begründe deine These mit einem Beispiel.',
        demo: 'Mit dem Handy kann man schnell etwas nachschlagen, zum Beispiel eine Vokabel.',
      },
      {
        name: 'Gegenargument',
        missing: 'Nenne, was dagegen spricht.',
        demo: 'Andererseits lenken Handys im Unterricht leicht ab.',
      },
      {
        name: 'Schluss',
        missing: 'Wäge ab und nenne deine Position.',
        demo: 'Insgesamt überwiegen für mich die Vorteile, wenn es klare Regeln gibt.',
      },
    ],
  };
  const r = checkPointsPlan(draft, null);
  if (!r.ok) throw new Error('points plan rejected');
  const plan = r.plan;

  it('rejects a plan with an over-long example or a repeated point', () => {
    const long = {
      points: [draft.points[0]!, { ...draft.points[1]!, demo: Array(50).fill('Wort').join(' ') }],
    };
    expect(checkPointsPlan(long, null)).toMatchObject({ ok: false, reason: 'demo_length' });
    const twice = { points: [draft.points[0]!, { ...draft.points[1]!, name: 'These' }] };
    expect(checkPointsPlan(twice, null)).toMatchObject({ ok: false, reason: 'repeated_point' });
  });

  it('takes names and what is missing from a rubric, only the example from the model', () => {
    const rubric = {
      form: 'Erörterung',
      elements: [
        {
          name: 'Einleitung mit These',
          missing: 'Nenne in der Einleitung deine These.',
          check: { by: 'judged' as const },
        },
        {
          name: 'Länge',
          missing: 'Schreib mindestens 200 Wörter.',
          check: { by: 'word_count' as const, min: 200, max: null },
        },
        {
          name: 'Schluss mit Position',
          missing: 'Schließ mit deiner Position.',
          check: { by: 'judged' as const },
        },
      ],
    };
    const two = { points: [draft.points[0]!, draft.points[3]!] };
    const ok = checkPointsPlan(two, rubric);
    expect(ok.ok && ok.plan.points.map((p) => p.name)).toEqual([
      'Einleitung mit These',
      'Schluss mit Position',
    ]);
    expect(checkPointsPlan(draft, rubric)).toMatchObject({ ok: false, reason: 'point_count' });
  });

  const opened = openGuide('de', plan);
  const her =
    'Handys helfen beim Lernen, weil man zum Beispiel eine Vokabel sofort nachschlagen kann.';

  it('opens with Buddy’s example for the first point; the second is hers', () => {
    expect(opened.state.at).toBe(1);
    expect(opened.reply).toContain('These');
    expect(opened.reply).toContain('Argument mit Beispiel');
  });

  it('accepts a point only with a quote that stands in her text', () => {
    const ok = pointsTurn('de', plan, opened.state, her, {
      met: true,
      quote: 'eine Vokabel sofort nachschlagen',
    });
    expect(ok.next).toEqual({ at: 3, misses: 0, prev: null, status: 'active' });
    // Buddy showed point 3 (the counter-argument); the last one is hers.
    expect(ok.reply).toContain('Andererseits');
    const invented = pointsTurn('de', plan, opened.state, her, {
      met: true,
      quote: 'Smartphones sind praktisch',
    });
    expect(invented.next.misses).toBe(1);
    expect(invented.reply).toContain('Begründe deine These');
  });

  it('shows an example after two misses and goes on', () => {
    const second = pointsTurn('de', plan, { ...opened.state, misses: 1 }, her, {
      met: false,
      quote: '',
    });
    expect(second.reply).toContain('Vokabel');
    expect(second.next.misses).toBe(0);
    expect(second.next.at).toBe(2);
  });

  it('ends without a grade when her last point holds; the question stays hers', () => {
    const last: GuideState = { at: 3, misses: 0, prev: null, status: 'active' };
    const done = pointsTurn('de', plan, last, 'Insgesamt finde ich Handys gut.', {
      met: true,
      quote: 'Insgesamt finde ich Handys gut',
    });
    expect(done.next.status).toBe('done');
    expect(done.solved).toBe(false);
    expect(done.revealed).toBe(false);
    expect(done.reply).not.toMatch(/Note|Punkte|richtig|falsch/i);
  });

  it('changes nothing when the model could not judge (nothing measured, nothing missing)', () => {
    const r = pointsTurn('de', plan, opened.state, her, null);
    expect(r.next).toEqual(opened.state);
  });
});

describe('planOf', () => {
  it('reads a stored plan back strictly', () => {
    expect(planOf(stepsPlan())).not.toBeNull();
    expect(planOf({ kind: 'steps', lines: [] })).toBeNull();
    expect(planOf(null)).toBeNull();
  });
});
