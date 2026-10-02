// Zeichnen auf Raster (issue #249), Regel 0 in both directions: a task is stored only when it is
// solvable on its grid (a mirror image is computed by code), and every tool's drawing is
// checked by code with a reply that names the wrong point, the squares or the bar.

import type { GridDrawAnswer, GridDrawTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { gridDrawTaskFrom, type GridDrawDraft } from '../gridDraw.js';
import {
  checkStructured,
  solutionOf,
  structuredItem,
  structuredReply,
  viewOf,
} from '../structured.js';

const GRID = { x_min: -4, x_max: 4, y_min: -4, y_max: 4, step: 1, axes: true };
const EMPTY = {
  points: null,
  closed: false,
  cells: null,
  mirror: null,
  fn: null,
  count: null,
  bars: null,
};

function draft(over: Partial<GridDrawDraft>): GridDrawDraft {
  return { type: 'grid_draw', prompt: 'Zeichne.', grid: GRID, task: 'points', ...EMPTY, ...over };
}

function built(d: GridDrawDraft): GridDrawTask {
  const task = gridDrawTaskFrom(d);
  if (typeof task === 'string') throw new Error(`rejected: ${task}`);
  return task;
}

function drawn(over: Partial<GridDrawAnswer>): GridDrawAnswer {
  return { type: 'grid_draw', points: [], cells: [], bars: [], ...over };
}

const META = { topic: 'Geraden', difficulty: 2, prompt_lang: null } as const;

describe('grid_draw: "Zeichne y = 2x − 1" (acceptance of #249)', () => {
  const task = built(draft({ task: 'line', fn: '2x-1' }));

  it('any two right points are right', () => {
    for (const [a, b] of [
      [
        { x: 0, y: -1 },
        { x: 1, y: 1 },
      ],
      [
        { x: 2, y: 3 },
        { x: -1, y: -3 },
      ],
    ] as const) {
      expect(checkStructured(task, drawn({ points: [a, b] }))?.correct).toBe(true);
    }
  });

  it('says whether the slope or the y-intercept is right, or which point is off', () => {
    const shifted = checkStructured(
      task,
      drawn({
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 2 },
        ],
      }),
    )!;
    expect(structuredReply('de', shifted)).toContain('Die Steigung stimmt schon');
    const steep = checkStructured(
      task,
      drawn({
        points: [
          { x: 0, y: -1 },
          { x: 1, y: 2 },
        ],
      }),
    )!;
    expect(structuredReply('de', steep)).toContain('schneidet die y-Achse schon');
    const off = checkStructured(
      task,
      drawn({
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      }),
    )!;
    expect(structuredReply('de', off)).toBe('Der Punkt (2 | 2) liegt noch nicht auf der Geraden.');
    const up = checkStructured(
      task,
      drawn({
        points: [
          { x: 1, y: 0 },
          { x: 1, y: 3 },
        ],
      }),
    )!;
    expect(structuredReply('de', up)).toContain('übereinander');
  });

  it('is stored only for a straight line with two grid points in range', () => {
    expect(gridDrawTaskFrom(draft({ task: 'line', fn: 'x^2' }))).toBe('fn');
    // y = 10x + 30 does not touch the grid at two points.
    expect(gridDrawTaskFrom(draft({ task: 'line', fn: '10x+30' }))).toBe('unsolvable');
    expect(gridDrawTaskFrom(draft({ task: 'line' }))).toBe('draw_form');
    const item = structuredItem({ ...draft({ task: 'line', fn: '2x-1' }), ...META });
    expect(item?.answer).toBe('Die Gerade y = 2x − 1, zum Beispiel durch (−1 | −3), (0 | −1)');
    expect(viewOf(task)).toMatchObject({ tool: 'line', needs: 2, bars: [] });
  });

  it('a third point or a point between grid points is no drawing on this grid', () => {
    expect(
      checkStructured(
        task,
        drawn({
          points: [
            { x: 0, y: -1 },
            { x: 0.5, y: 0 },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      checkStructured(
        task,
        drawn({
          points: [
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: 2, y: 3 },
          ],
        }),
      ),
    ).toBeNull();
    expect(checkStructured(task, drawn({ cells: [{ x: 0, y: 0 }] }))).toBeNull();
  });
});

describe('grid_draw: points and their mirror image', () => {
  it('plot points: the same set in any order; the reply names a wrong one and what is missing', () => {
    const task = built(
      draft({
        points: [
          { x: 1, y: 2, label: 'A' },
          { x: -3, y: 0, label: 'B' },
        ],
      }),
    );
    expect(viewOf(task)).toMatchObject({ tool: 'points', needs: 2 });
    expect(JSON.stringify(viewOf(task))).not.toContain('"goal"');
    const right = drawn({
      points: [
        { x: -3, y: 0 },
        { x: 1, y: 2 },
      ],
    });
    expect(checkStructured(task, right)?.correct).toBe(true);
    const one = checkStructured(
      task,
      drawn({
        points: [
          { x: 1, y: 2 },
          { x: 2, y: 1 },
        ],
      }),
    )!;
    expect(structuredReply('de', one)).toBe(
      'Schau dir den Punkt (2 | 1) nochmal an. Es fehlt noch ein Punkt.',
    );
    expect(gridDrawTaskFrom(draft({ points: [{ x: 1.5, y: 2, label: null }] }))).toBe('off_grid');
  });

  it('mirror: code computes the image; she sets it', () => {
    const task = built(
      draft({
        task: 'mirror_points',
        points: [
          { x: -3, y: 1, label: 'A' },
          { x: -1, y: 1, label: 'B' },
          { x: -2, y: 3, label: 'C' },
        ],
        closed: true,
        mirror: { direction: 'vertical', at: 0 },
      }),
    );
    expect(task.goal).toEqual({
      check: 'points',
      points: [
        { x: 3, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 3 },
      ],
    });
    expect(task.given.closed).toBe(true);
    const wrong = checkStructured(
      task,
      drawn({
        points: [
          { x: 3, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      }),
    )!;
    expect(structuredReply('de', wrong)).toContain('(2 | 2)');
  });

  it('mirror: refused when the image leaves the grid, the line is off, or nothing moves', () => {
    const shape = [{ x: -3, y: 1, label: 'A' }];
    expect(
      gridDrawTaskFrom(
        draft({ task: 'mirror_points', points: shape, mirror: { direction: 'vertical', at: 2 } }),
      ),
    ).toBe('mirror_image');
    expect(
      gridDrawTaskFrom(
        draft({ task: 'mirror_points', points: shape, mirror: { direction: 'vertical', at: 0.3 } }),
      ),
    ).toBe('mirror_axis');
    expect(
      gridDrawTaskFrom(
        draft({ task: 'mirror_points', points: shape, mirror: { direction: 'vertical', at: -3 } }),
      ),
    ).toBe('mirror_image');
    expect(gridDrawTaskFrom(draft({ task: 'mirror_points', points: shape }))).toBe('draw_form');
  });
});

describe('grid_draw: a graph through points', () => {
  const task = built(draft({ task: 'on_graph', fn: 'x^2-2', count: 3 }));

  it('any three points on the parabola, with different x', () => {
    const ok = drawn({
      points: [
        { x: -1, y: -1 },
        { x: 0, y: -2 },
        { x: 2, y: 2 },
      ],
    });
    expect(checkStructured(task, ok)?.correct).toBe(true);
    const off = checkStructured(
      task,
      drawn({
        points: [
          { x: -1, y: -1 },
          { x: 0, y: -2 },
          { x: 1, y: 0 },
        ],
      }),
    )!;
    expect(structuredReply('de', off)).toBe('Der Punkt (1 | 0) liegt noch nicht auf dem Graphen.');
    const sameX = checkStructured(
      task,
      drawn({
        points: [
          { x: 0, y: -2 },
          { x: 0, y: 1 },
          { x: 2, y: 2 },
        ],
      }),
    )!;
    expect(structuredReply('de', sameX)).toContain('dieselbe x-Koordinate');
  });

  it('is stored only when the grid holds enough points of the graph', () => {
    expect(gridDrawTaskFrom(draft({ task: 'on_graph', fn: 'x^2-2', count: 6 }))).toBe('unsolvable');
    expect(gridDrawTaskFrom(draft({ task: 'on_graph', fn: 'x^^2', count: 2 }))).toBe('fn');
  });
});

describe('grid_draw: squares', () => {
  it('colour squares: missing and too many are counted', () => {
    const task = built(
      draft({
        task: 'cells',
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      }),
    );
    expect(viewOf(task)).toMatchObject({ tool: 'cells', needs: null });
    expect(
      checkStructured(
        task,
        drawn({
          cells: [
            { x: 1, y: 0 },
            { x: 0, y: 0 },
          ],
        }),
      )?.correct,
    ).toBe(true);
    const both = checkStructured(
      task,
      drawn({
        cells: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
      }),
    )!;
    expect(structuredReply('de', both)).toBe(
      'Noch nicht ganz – es fehlen Kästchen (1), und einige sind zu viel gefärbt (1).',
    );
    const short = checkStructured(task, drawn({ cells: [{ x: 0, y: 0 }] }))!;
    expect(structuredReply('de', short)).toBe('Fast – es fehlt noch ein Kästchen.');
    // The top-right square starts one step below the edge; one AT the edge is off the paper.
    expect(checkStructured(task, drawn({ cells: [{ x: 4, y: 0 }] }))).toBeNull();
  });

  it('mirror a coloured shape on squared paper: the given half stays, she colours the other', () => {
    const task = built(
      draft({
        grid: { ...GRID, axes: false },
        task: 'mirror_cells',
        cells: [
          { x: -2, y: 0 },
          { x: -1, y: 0 },
          { x: -1, y: 1 },
        ],
        mirror: { direction: 'vertical', at: 0 },
      }),
    );
    expect(task.given.cells).toHaveLength(3);
    expect(task.goal).toEqual({
      check: 'cells',
      cells: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
    });
  });
});

describe('grid_draw: bars', () => {
  const task = built(
    draft({
      task: 'bars',
      grid: { x_min: 0, x_max: 1, y_min: 0, y_max: 10, step: 1, axes: true },
      bars: [
        { label: 'Mo', value: 4 },
        { label: 'Di', value: 7 },
        { label: 'Mi', value: 2 },
      ],
    }),
  );

  it('the x axis is its bars; each bar at its height', () => {
    expect(task.grid.x_max).toBe(3);
    expect(viewOf(task)).toMatchObject({
      tool: 'bars',
      bars: [
        { id: 'a', label: 'Mo' },
        { id: 'b', label: 'Di' },
        { id: 'c', label: 'Mi' },
      ],
    });
    const bars = (b: number) =>
      drawn({
        bars: [
          { id: 'a', value: 4 },
          { id: 'b', value: b },
          { id: 'c', value: 2 },
        ],
      });
    expect(checkStructured(task, bars(7))?.correct).toBe(true);
    expect(structuredReply('de', checkStructured(task, bars(6))!)).toBe(
      'Die Säule „Di“ hat noch nicht die richtige Höhe.',
    );
    expect(checkStructured(task, bars(6.5))).toBeNull();
    expect(solutionOf(task, 'de')).toBe('Mo: 4, Di: 7, Mi: 2');
  });

  it('a bar between two grid lines, or a chart not starting at 0, is not stored', () => {
    const at = (value: number, y_min = 0) =>
      gridDrawTaskFrom(
        draft({
          task: 'bars',
          grid: { x_min: 0, x_max: 2, y_min, y_max: 10, step: 2, axes: true },
          bars: [
            { label: 'A', value: 4 },
            { label: 'B', value },
          ],
        }),
      );
    expect(at(5)).toBe('off_grid');
    expect(at(4, 2)).toBe('grid');
  });
});
