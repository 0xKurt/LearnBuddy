// Zeichnen auf dem Raster (issue #249): Regel 0 in both directions — what the model chose, and
// what she drew. The acceptance list of the issue: a test per tool and per check, each rejection by
// its name; a wrong task is never stored, a wrong drawing is found without a model call.

import {
  GRID_SPAN_MAX,
  gridDrawnText,
  type GridDrawTask,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  checkGrid,
  gridBarStep,
  gridDraftProblem,
  gridProblem,
  gridReply,
  gridSecrets,
  gridSolution,
  gridTaskFrom,
  gridView,
  type GridDraft,
} from '../grid.js';
import { SHEET_STRUCTURED, structuredItem, viewOf } from '../structured.js';

const none = { points: null, fn: null, count: null, axis: null, axis_at: null, bars: null };
const points = (ps: Array<[number, number]>, prompt = 'Trage die Punkte ein.'): GridDraft => ({
  ...none,
  type: 'grid_draw',
  prompt,
  task: 'points',
  points: ps.map(([x, y]) => ({ x, y })),
});
const graph = (fn: string, count: number): GridDraft => ({
  ...none,
  type: 'grid_draw',
  prompt: 'Zeichne den Graphen.',
  task: 'graph',
  fn,
  count,
});
const mirror = (
  ps: Array<[number, number]>,
  axis: 'vertical' | 'horizontal',
  at: number,
): GridDraft => ({
  ...none,
  type: 'grid_draw',
  prompt: 'Spiegle die Figur an der Achse.',
  task: 'mirror',
  points: ps.map(([x, y]) => ({ x, y })),
  axis,
  axis_at: at,
});
const bars = (b: Array<[string, number]>): GridDraft => ({
  ...none,
  type: 'grid_draw',
  prompt: 'Zeichne das Säulendiagramm.',
  task: 'bars',
  bars: b.map(([label, value]) => ({ label, value })),
});

/** The built task, failing the test when Regel 0 rejected it. */
function built(draft: GridDraft): { task: GridDrawTask; prompt: string } {
  const out = gridTaskFrom(draft);
  expect(out, `rejected: ${gridDraftProblem(draft)}`).not.toBeNull();
  return out!;
}

const pts = (...ps: Array<[number, number]>) => ps.map(([x, y]) => ({ x, y }));
const drawn = (...ps: Array<[number, number]>) => ({
  type: 'grid_draw' as const,
  points: pts(...ps),
  bars: [],
});

describe('points: plotting given points (Regel 0 on the task)', () => {
  it('names the points, fits the paper around them and the origin, and writes them after the instruction', () => {
    const { task, prompt } = built(
      points([
        [2, 3],
        [-1, 2],
        [0, -1],
      ]),
    );
    expect(task.sheet).toMatchObject({ mode: 'points', names: ['A', 'B', 'C'] });
    // One unit of air beyond the data on every side; none below 0 where nothing is negative.
    expect(task.frame).toEqual({ x_min: -2, x_max: 3, y_min: -2, y_max: 4 });
    expect(prompt).toBe('Trage die Punkte ein: A(2|3), B(−1|2), C(0|−1)');
    expect(gridSolution(task)).toBe('A(2|3), B(−1|2), C(0|−1)');
  });

  it('keeps a first-quadrant task’s axes at the edge and widens a small paper to the minimum', () => {
    expect(
      built(
        points([
          [1, 1],
          [2, 1],
        ]),
      ).task.frame,
    ).toEqual({ x_min: 0, x_max: 4, y_min: 0, y_max: 4 });
    // Eight units across, six up: the most the paper may be (up is the scarce direction).
    expect(
      built(
        points([
          [3, 5],
          [7, 2],
        ]),
      ).task.frame,
    ).toEqual({ x_min: 0, x_max: 8, y_min: 0, y_max: 6 });
  });

  it('rejects what is no plotting task on this paper', () => {
    expect(gridDraftProblem(points([[1, 1]]))).toBe('count');
    expect(
      gridDraftProblem(
        points([
          [1, 1],
          [1.5, 2],
        ]),
      ),
    ).toBe('off_grid');
    expect(
      gridDraftProblem(
        points([
          [1, 1],
          [1, 1],
        ]),
      ),
    ).toBe('duplicate');
    // With the origin, 9 units: more than the paper may show.
    expect(
      gridDraftProblem(
        points([
          [9, 1],
          [2, 2],
        ]),
      ),
    ).toBe('too_big');
    expect(
      gridDraftProblem(
        points([
          [-5, 0],
          [4, 0],
        ]),
      ),
    ).toBe('too_big');
    // Up, eight units with the air around them: more than six rows.
    expect(
      gridDraftProblem(
        points([
          [1, 5],
          [1, -1],
        ]),
      ),
    ).toBe('too_big');
  });

  it('refuses an instruction with a number of its own, one over its cap, or a field of another mode', () => {
    expect(
      gridDraftProblem(
        points(
          [
            [1, 1],
            [2, 2],
          ],
          'Trage A(3|3) ein.',
        ),
      ),
    ).toBe('form');
    expect(
      gridDraftProblem(
        points(
          [
            [1, 1],
            [2, 2],
          ],
          'x'.repeat(61),
        ),
      ),
    ).toBe('too_long');
    expect(
      gridDraftProblem({
        ...points([
          [1, 1],
          [2, 2],
        ]),
        fn: '2*x',
      }),
    ).toBe('form');
  });
});

describe('graph: a line through two points, a parabola over points', () => {
  it('reads y = 2x − 1 as a line, writes it itself and keeps every crossing it passes', () => {
    const { task, prompt } = built(graph('2*x - 1', 2));
    expect(prompt).toBe('Zeichne den Graphen: $y = 2x - 1$');
    expect(task.sheet).toMatchObject({ mode: 'graph', count: 2, line: true, fn: '2*x - 1' });
    expect(task.frame).toEqual({ x_min: -4, x_max: 4, y_min: -3, y_max: 3 });
    if (task.sheet.mode !== 'graph') throw new Error('graph');
    expect(task.sheet.key).toEqual(pts([-1, -3], [0, -1], [1, 1], [2, 3]));
  });

  it('writes fractions and squares the way school does', () => {
    expect(built(graph('0.5*x^2 - 2', 3)).prompt).toBe(
      'Zeichne den Graphen: $y = \\frac{1}{2}x^{2} - 2$',
    );
    expect(built(graph('-x + 3', 2)).prompt).toBe('Zeichne den Graphen: $y = -x + 3$');
    expect(built(graph('y = 3', 2)).prompt).toBe('Zeichne den Graphen: $y = 3$');
  });

  it('rejects what is neither a line nor a parabola, or has too few crossings on the paper', () => {
    expect(gridDraftProblem(graph('x^3', 3))).toBe('not_a_function');
    expect(gridDraftProblem(graph('sqrt(x)', 3))).toBe('not_a_function');
    expect(gridDraftProblem(graph('x +', 2))).toBe('not_a_function');
    expect(gridDraftProblem(graph('0.3*x', 2))).toBe('not_a_function');
    // A line is drawn through two points, a parabola needs three at least.
    expect(gridDraftProblem(graph('2*x', 3))).toBe('count');
    expect(gridDraftProblem(graph('x^2', 2))).toBe('count');
    // y = x/3 + 1/2 passes no crossing at all; y = x² + 5 none inside the paper.
    expect(gridDraftProblem(graph('x/3 + 1/2', 2))).toBe('too_few_on_grid');
    expect(gridDraftProblem(graph('x^2 + 5', 3))).toBe('too_few_on_grid');
  });

  it('judges ANY two right points as right — y = 2x − 1 (acceptance of #249)', () => {
    const { task } = built(graph('2*x - 1', 2));
    for (const pair of [drawn([0, -1], [1, 1]), drawn([2, 3], [-1, -3]), drawn([1, 1], [2, 3])]) {
      expect(checkGrid(task, pair)).toMatchObject({ correct: true, wrong: [] });
    }
    const off = checkGrid(task, drawn([0, -1], [1, 2]));
    expect(off).toMatchObject({ correct: false, wrong: ['(1|2)'] });
    expect(gridReply('de', off!)).toBe('Noch nicht ganz: (1|2) liegt nicht auf dem Graphen.');
  });

  it('refuses a drawing that is no answer to the task: too few points, one twice, off the paper', () => {
    const { task } = built(graph('2*x - 1', 2));
    expect(checkGrid(task, drawn([0, -1]))).toBeNull();
    expect(checkGrid(task, drawn([0, -1], [0, -1]))).toBeNull();
    expect(checkGrid(task, drawn([0, -1], [5, 9]))).toBeNull();
    expect(
      checkGrid(task, { ...drawn([0, -1], [1, 1]), bars: [{ id: 'b1', value: 1 }] }),
    ).toBeNull();
  });
});

describe('mirror: a figure on squared paper', () => {
  it('mirrors the figure in code, moves the drawing one square in, and names the images A′, B′ …', () => {
    const { task, prompt } = built(
      mirror(
        [
          [1, 1],
          [3, 1],
          [3, 3],
        ],
        'vertical',
        4,
      ),
    );
    expect(prompt).toBe('Spiegle die Figur an der Achse.');
    expect(task.sheet).toMatchObject({
      mode: 'mirror',
      names: ['A′', 'B′', 'C′'],
      axis: { dir: 'vertical', at: 4 },
      figure: [
        { name: 'A', x: 1, y: 1 },
        { name: 'B', x: 3, y: 1 },
        { name: 'C', x: 3, y: 3 },
      ],
      key: pts([7, 1], [5, 1], [5, 3]),
    });
    expect(task.frame).toEqual({ x_min: 0, x_max: 8, y_min: 0, y_max: 4 });
  });

  it('mirrors at a horizontal axis halfway between two lines', () => {
    const { task } = built(
      mirror(
        [
          [0, 0],
          [2, 0],
          [1, 1],
        ],
        'horizontal',
        -0.5,
      ),
    );
    if (task.sheet.mode !== 'mirror') throw new Error('mirror');
    // The image of (0|0) at y = −0.5 is (0|−1); moved one square in, both stay on crossings.
    expect(task.sheet.axis.at).toBe(2.5);
    expect(task.sheet.key).toEqual(pts([1, 2], [3, 2], [2, 1]));
    expect(task.frame).toEqual({ x_min: 0, x_max: 4, y_min: 0, y_max: 5 });
  });

  it('rejects a figure that is no mirroring task', () => {
    expect(
      gridDraftProblem(
        mirror(
          [
            [1, 1],
            [2, 2],
          ],
          'vertical',
          4,
        ),
      ),
    ).toBe('count');
    expect(
      gridDraftProblem(
        mirror(
          [
            [1, 1],
            [2, 2],
            [3, 3],
          ],
          'vertical',
          4,
        ),
      ),
    ).toBe('degenerate');
    expect(
      gridDraftProblem(
        mirror(
          [
            [1, 1],
            [5, 1],
            [3, 3],
          ],
          'vertical',
          4,
        ),
      ),
    ).toBe('degenerate');
    expect(
      gridDraftProblem(
        mirror(
          [
            [1, 1],
            [3, 1],
            [3, 3],
          ],
          'vertical',
          4.25,
        ),
      ),
    ).toBe('off_grid');
    expect(
      gridDraftProblem(
        mirror(
          [
            [0, 1],
            [3, 1],
            [3, 3],
          ],
          'vertical',
          4,
        ),
      ),
    ).toBe('too_big');
    expect(
      gridDraftProblem(
        mirror(
          [
            [1, 1],
            [3, 1],
            [3, 6],
          ],
          'vertical',
          4,
        ),
      ),
    ).toBe('too_big');
    expect(
      gridDraftProblem({
        ...mirror(
          [
            [1, 1],
            [3, 1],
            [3, 3],
          ],
          'vertical',
          4,
        ),
        axis: null,
      }),
    ).toBe('count');
  });

  it('names the wrong image point and keeps the image points from a hint', () => {
    const { task } = built(
      mirror(
        [
          [1, 1],
          [3, 1],
          [3, 3],
        ],
        'vertical',
        4,
      ),
    );
    expect(checkGrid(task, drawn([7, 1], [5, 1], [5, 3]))?.correct).toBe(true);
    const wrong = checkGrid(task, drawn([7, 1], [6, 1], [5, 2]))!;
    expect(wrong.wrong).toEqual(['B′', 'C′']);
    expect(gridReply('de', wrong)).toBe('Noch nicht ganz: B′, C′ liegen noch nicht richtig.');
    expect(gridSecrets(task)).toContain('B′(5|1)');
  });
});

describe('bars: a bar chart from data', () => {
  it('picks the smallest step every value fits, one free row on top', () => {
    expect(gridBarStep([3, 5, 2])).toBe(1);
    expect(gridBarStep([20, 50, 30])).toBe(10);
    expect(gridBarStep([4, 10])).toBe(2);
    expect(gridBarStep([5, 3])).toBe(1);
    // 8 needs two rows a step, and 3 is no whole number of twos: no scale.
    expect(gridBarStep([6, 3])).toBeNull();
    expect(gridBarStep([8, 3])).toBeNull();
    expect(gridBarStep([1, 700])).toBeNull();
  });

  it('names the bars, scales the paper and writes the data after the instruction', () => {
    const { task, prompt } = built(
      bars([
        ['Apfel', 5],
        ['Birne', 3],
        ['Kiwi', 0],
      ]),
    );
    expect(prompt).toBe('Zeichne das Säulendiagramm: Apfel 5, Birne 3, Kiwi 0');
    expect(task.sheet).toMatchObject({ mode: 'bars', step: 1, values: [5, 3, 0] });
    expect(task.frame).toEqual({ x_min: 0, x_max: 3, y_min: 0, y_max: 6 });
    expect(gridView(task).sheet).toEqual({
      mode: 'bars',
      step: 1,
      bars: [
        { id: 'b1', label: 'Apfel' },
        { id: 'b2', label: 'Birne' },
        { id: 'b3', label: 'Kiwi' },
      ],
    });
  });

  it('rejects data no paper holds', () => {
    expect(gridDraftProblem(bars([['Apfel', 5]]))).toBe('count');
    expect(
      gridDraftProblem(
        bars([
          ['Apfel', 0],
          ['Birne', 0],
        ]),
      ),
    ).toBe('count');
    expect(
      gridDraftProblem(
        bars([
          ['Erdbeeren', 5],
          ['Birne', 3],
        ]),
      ),
    ).toBe('too_long');
    // Eight letters stand under one of four columns, not under one of six.
    const six = (first: string) =>
      bars([
        [first, 1],
        ['B', 2],
        ['C', 3],
        ['D', 4],
        ['E', 5],
        ['F', 5],
      ]);
    expect(
      gridDraftProblem(
        bars([
          ['Bananen', 5],
          ['Birne', 3],
        ]),
      ),
    ).toBeNull();
    expect(gridDraftProblem(six('Banane'))).toBeNull();
    expect(gridDraftProblem(six('Bananen'))).toBe('too_long');
    expect(
      gridDraftProblem(
        bars([
          ['Apfel', 5],
          ['apfel', 3],
        ]),
      ),
    ).toBe('duplicate');
    expect(
      gridDraftProblem(
        bars([
          ['Apfel', 2.5],
          ['Birne', 3],
        ]),
      ),
    ).toBe('scale');
    expect(
      gridDraftProblem(
        bars([
          ['Apfel', 13],
          ['Birne', 3],
        ]),
      ),
    ).toBe('scale');
  });

  it('names the wrong bar by its label; refuses a bar missing or off the scale', () => {
    const { task } = built(
      bars([
        ['Apfel', 20],
        ['Birne', 50],
        ['Kiwi', 30],
      ]),
    );
    const all = (a: number, b: number, c: number) => ({
      type: 'grid_draw' as const,
      points: [],
      bars: [
        { id: 'b1', value: a },
        { id: 'b2', value: b },
        { id: 'b3', value: c },
      ],
    });
    expect(checkGrid(task, all(20, 50, 30))?.correct).toBe(true);
    const wrong = checkGrid(task, all(20, 40, 30))!;
    expect(gridReply('de', wrong)).toBe('Noch nicht ganz: Die Säule für Birne stimmt noch nicht.');
    expect(gridReply('en', wrong)).toBe('Not quite yet: the bar for Birne is not right yet.');
    expect(checkGrid(task, all(20, 45, 30))).toBeNull();
    expect(checkGrid(task, all(20, 80, 30))).toBeNull();
    expect(checkGrid(task, { ...all(20, 50, 30), bars: all(20, 50, 30).bars.slice(1) })).toBeNull();
  });
});

describe('the stored task, read back (never trusted as it stands)', () => {
  it('refuses a stored key that disagrees with its own figure, function or scale', () => {
    const m = built(
      mirror(
        [
          [1, 1],
          [3, 1],
          [3, 3],
        ],
        'vertical',
        4,
      ),
    ).task;
    if (m.sheet.mode !== 'mirror') throw new Error('mirror');
    expect(gridProblem({ ...m, sheet: { ...m.sheet, key: pts([7, 1], [5, 1], [5, 2]) } })).toBe(
      'off_grid',
    );
    const g = built(graph('2*x - 1', 2)).task;
    if (g.sheet.mode !== 'graph') throw new Error('graph');
    expect(gridProblem({ ...g, sheet: { ...g.sheet, fn: '2*x + 1' } })).toBe('off_grid');
    expect(gridProblem({ ...g, frame: { ...g.frame, x_max: GRID_SPAN_MAX } })).toBe('too_big');
    const b = built(
      bars([
        ['Apfel', 5],
        ['Birne', 3],
      ]),
    ).task;
    if (b.sheet.mode !== 'bars') throw new Error('bars');
    expect(gridProblem({ ...b, sheet: { ...b.sheet, values: [5, 9] } })).toBe('scale');
  });
});

describe('as a structured question', () => {
  it('becomes a grid_draw item whose view never carries the key, the values or the function', () => {
    const item = structuredItem({
      ...graph('2*x - 1', 2),
      topic: 'Lineare Funktionen',
      difficulty: 2,
      prompt_lang: 'de',
    });
    expect(item).toMatchObject({ kind: 'grid_draw', prompt: 'Zeichne den Graphen: $y = 2x - 1$' });
    expect(item?.hints).toEqual([]);
    const view = viewOf(item!.task);
    expect(view).toEqual({
      type: 'grid_draw',
      frame: { x_min: -4, x_max: 4, y_min: -3, y_max: 3 },
      sheet: { mode: 'graph', count: 2, line: true },
    });
    expect(JSON.stringify(view)).not.toContain('2*x');
  });

  it('is never read off a photo', () => {
    expect(SHEET_STRUCTURED.has('grid_draw')).toBe(false);
    expect(SHEET_STRUCTURED.has('mark')).toBe(true);
  });

  it('writes her drawing in words with the one notation', () => {
    const { task } = built(
      points([
        [2, 3],
        [-1, 4],
      ]),
    );
    expect(gridDrawnText(gridView(task).sheet, drawn([2, 3], [-1, 1]))).toBe('A(2|3), B(−1|1)');
    expect(checkGrid(task, drawn([2, 3], [-1, 1]))?.wrong).toEqual(['B']);
    // A point below the paper (it starts at y = 0 here) is no answer to this task.
    expect(checkGrid(task, drawn([2, 3], [-1, -4]))).toBeNull();
  });
});
