// Vormachen for an explanation (issue #298): the key points are the steps. Where the ladder stands,
// which points Buddy showed, and what a step says — all from the stored rubric, no model.

import { describe, expect, it } from 'vitest';

import { keyPointsOf, lastPointText, pointLadder, pointStepText } from '../pointSteps.js';
import { keyPointFields } from '../teachBack.js';
import { stepOnRequest } from '../workedSteps.js';

const point = (name: string, statement: string, ask: string) => ({
  name,
  point: statement,
  ask,
  exact: [],
});

const { rubric } = keyPointFields([
  point('Licht', 'Licht liefert die Energie', 'Woher kommt die Energie?'),
  point('Stoffe', 'aus CO2 und Wasser wird Zucker', 'Was braucht sie, was entsteht?'),
  point('Ort', 'in den Chloroplasten', 'Wo passiert das?'),
]);
const points = keyPointsOf(rubric)!;

describe('the key points of an explanation', () => {
  it('reads them in order, and none from any other question', () => {
    expect(points.map((p) => p.ref)).toEqual(['r1', 'r2', 'r3']);
    expect(points[1]).toMatchObject({ name: 'Stoffe', ask: 'Was braucht sie, was entsteht?' });
    expect(keyPointsOf(null)).toBeNull();
    expect(keyPointsOf({ form: 'explanation', elements: [] })).toBeNull();
    expect(keyPointsOf({ nonsense: true })).toBeNull();
  });
});

describe('the ladder over them', () => {
  it('shows the first open point and asks for the next one', () => {
    const l = pointLadder(points, [], 0, 0);
    expect(l).toMatchObject({ shown: [], done: false, last: null });
    expect(l.next).toEqual({
      at: 0,
      name: 'Licht',
      point: 'Licht liefert die Energie',
      ask: 'Was braucht sie, was entsteht?',
    });
    const said = pointStepText('de', l.next!);
    expect(said).toContain('„Licht liefert die Energie“');
    expect(said).toContain('Jetzt du: Was braucht sie, was entsteht?');
  });

  it('leads on past points she explained, and a passed point she did not explain was shown', () => {
    const l = pointLadder(points, ['r2'], 1, 1);
    expect(l.shown).toEqual(['r1']);
    // r2 is hers, r3 the last open one: no step left — it is hers to explain.
    expect(l.next).toBeNull();
    expect(l.last).toEqual({ name: 'Ort', point: 'in den Chloroplasten' });
    expect(l.done).toBe(false);
    // Skipped over her point: the next step is the one after it.
    expect(pointLadder(points, ['r1'], 0, 0).next).toMatchObject({
      at: 1,
      ask: 'Wo passiert das?',
    });
  });

  it('ends after enough hints, showing the last point', () => {
    const l = pointLadder(points, [], 2, 2);
    expect(l).toMatchObject({ shown: ['r1', 'r2'], next: null, done: true });
    expect(lastPointText('de', l.last!)).toContain('„in den Chloroplasten“');
  });

  it('is what „Zeig mir wie" shows for an explanation', () => {
    const next = pointStepText('de', pointLadder(points, [], 0, 0).next!);
    expect(stepOnRequest({ rubric }, 'help_request', next)?.reply).toBe(next);
    expect(stepOnRequest({ rubric }, 'answer', next)).toBeNull();
  });
});
