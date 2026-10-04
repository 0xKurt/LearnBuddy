// „Erklär mal" (issue #236) without a database: the generator's key points held to their rules,
// and what the server says about an explanation point by point.

import { describe, expect, it } from 'vitest';

import { checkRubric, newlyExplained, rubricOf, rubricReply } from '../rubric.js';
import { teachBackItems, teachBackProblem, type TeachBackDraft } from '../teachBack.js';

const draft = (over: Partial<TeachBackDraft> = {}): TeachBackDraft => ({
  prompt: 'Erklär mir, wie die Fotosynthese funktioniert.',
  topic: 'Fotosynthese',
  difficulty: 2,
  points: [
    {
      name: 'Licht',
      point: 'Licht liefert die Energie',
      ask: 'Woher kommt die Energie?',
      exact: [],
    },
    {
      name: 'Ausgangsstoffe',
      point: 'aus CO2 und Wasser',
      ask: 'Was braucht die Pflanze?',
      exact: ['CO2'],
    },
    { name: 'Ort', point: 'in den Chloroplasten', ask: 'Und wo passiert das?', exact: [] },
  ],
  ...over,
});

describe('the key points a question may carry', () => {
  it('a sound question holds', () => {
    expect(teachBackProblem(draft(), null)).toBeNull();
  });

  it.each([
    [
      'duplicate point',
      draft({ points: [draft().points[0]!, draft().points[0]!, draft().points[2]!] }),
    ],
    ['point stated in the question', draft({ prompt: 'Erklär, wie Licht liefert die Energie.' })],
    [
      'follow-up is no question',
      draft({
        points: [...draft().points.slice(0, 2), { ...draft().points[2]!, ask: 'Sag den Ort.' }],
      }),
    ],
    [
      'follow-up gives the point away',
      draft({
        points: [
          ...draft().points.slice(0, 2),
          { ...draft().points[2]!, ask: 'Passiert es in den Chloroplasten?' },
        ],
      }),
    ],
    [
      'follow-up gives an exact term away',
      draft({
        points: [
          draft().points[0]!,
          { ...draft().points[1]!, ask: 'Braucht sie CO2?' },
          draft().points[2]!,
        ],
      }),
    ],
    [
      'name gives an exact term away',
      draft({
        points: [draft().points[0]!, { ...draft().points[1]!, name: 'CO2' }, draft().points[2]!],
      }),
    ],
  ])('%s → the question is dropped', (why, d) => {
    expect(teachBackProblem(d, null)).toBe(why);
    expect(teachBackItems([d], null)).toEqual([]);
  });

  it('from her sheet, an exact term must stand on it', () => {
    expect(teachBackProblem(draft(), 'Licht und Wasser')).toBe('exact term not on her sheet');
    expect(teachBackProblem(draft(), 'Licht, Wasser und CO2')).toBeNull();
  });

  it('is stored as a free text with key points, its follow-ups as hints, no solution', () => {
    const [it0] = teachBackItems([draft(), draft()], null);
    expect(teachBackItems([draft(), draft()], null)).toHaveLength(1);
    expect(it0!.kind).toBe('long');
    expect(it0!.hints).toEqual(draft().points.map((p) => p.ask));
    expect(it0!.worked_solution).toBeNull();
    expect(rubricOf(it0!.rubric)?.elements.map((e) => e.check.by)).toEqual([
      'key_point',
      'key_point',
      'key_point',
    ]);
  });
});

describe('an explanation, point by point', () => {
  const rubric = rubricOf(teachBackItems([draft()], null)[0]!.rubric)!;
  const claim = (element: string, met: boolean, quote = '') => ({
    element,
    met,
    quote,
    verbs: [],
  });

  it('a confirmed point stays confirmed, whatever the next judgement', () => {
    const o = checkRubric(rubric, 'im Chloroplasten', [claim('r3', false)], ['r1']);
    expect(o.elements.map((e) => e.state)).toEqual(['met', 'unknown', 'open']);
    expect(newlyExplained(o, ['r1'])).toEqual([]);
  });

  it('the exact part is code’s: a quote without "CO2" is not the point', () => {
    const o = checkRubric(rubric, 'aus Luft und Wasser', [
      claim('r2', true, 'aus Luft und Wasser'),
    ]);
    expect(o.elements[1]!.state).toBe('open');
    const ok = checkRubric(rubric, 'aus CO₂ und Wasser', [claim('r2', true, 'aus CO₂ und Wasser')]);
    expect(ok.elements[1]!.state).toBe('met');
  });

  it('nothing held yet: only the follow-up, no list of gaps', () => {
    const o = checkRubric(rubric, 'Pflanzen sind grün.', [
      claim('r1', false),
      claim('r2', false),
      claim('r3', false),
    ]);
    const reply = rubricReply('de', o, 'x');
    expect(reply).toBe('Fang mit einem Punkt an: Woher kommt die Energie?');
  });

  it('some held: each point, then ONE follow-up; the last try closes without one', () => {
    const o = checkRubric(rubric, 'Licht ist die Energie', [
      claim('r1', true, 'Licht ist die Energie'),
      claim('r2', false),
      claim('r3', false),
    ]);
    // Each point is held together by no-break spaces; the follow-up is its own paragraph.
    expect(rubricReply('de', o, 'x')).toBe(
      '✓ Licht · Ausgangsstoffe fehlt noch · Ort fehlt noch\n\nWas braucht die Pflanze?',
    );
    expect(rubricReply('de', o, 'x', true)).toBe(
      '✓ Licht · Ausgangsstoffe fehlt noch · Ort fehlt noch\n\nDen Rest schauen wir uns beim nächsten Mal zusammen an.',
    );
    expect(rubricReply('en', o, 'x')).toContain('Ausgangsstoffe still missing');
  });
});
