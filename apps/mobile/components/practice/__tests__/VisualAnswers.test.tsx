// The coins she lays (issue #254) and the geometry a solid is drawn with (issue #255). What is
// held here is what the browser cannot measure: a laid coin is taken back by a tap, no running sum
// gives the count away, and a cube shows three faces and hides three edges. (A clock she SETS is
// #248's `figure_tap`, tested there.)

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import {
  coneTangents,
  edgesOf,
  hull,
  polyhedronOf,
  visibleFaces,
} from '../../../lib/math/solid.js';
import { CoinAnswer, laidWords } from '../CoinAnswer.js';

describe('the coins she lays', () => {
  it('lays a piece with a tap and takes it back with another', () => {
    const onChange = vi.fn();
    const { rerender } = renderInApp(
      <CoinAnswer
        offer={[1, 2, 5, 10, 20, 50, 100, 200]}
        value=""
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Hier liegt dein Geld.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '2 € hinlegen' }));
    expect(onChange).toHaveBeenLastCalledWith('200');
    rerender(
      <CoinAnswer
        offer={[1, 2, 5, 10, 20, 50, 100, 200]}
        value="200 50 20"
        disabled={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '50 ct wegnehmen' }));
    expect(onChange).toHaveBeenLastCalledWith('200 20');
    // No running sum anywhere: adding up is the exercise.
    expect(screen.queryByText(/2,70/)).toBeNull();
    expect(laidWords([20, 200, 5])).toBe('2 € + 20 ct + 5 ct');
  });
});

describe('a solid drawn obliquely', () => {
  it('a cube shows its front, top and right face and hides three edges', () => {
    const cube = polyhedronOf('cube', { a: 1 });
    expect(cube).not.toBeNull();
    if (!cube) return;
    expect(visibleFaces(cube).filter(Boolean)).toHaveLength(3);
    const edges = edgesOf(cube);
    expect(edges).toHaveLength(12);
    expect(edges.filter((e) => e.hidden)).toHaveLength(3);
  });

  it('every prism and pyramid has as many edges as Euler says, some of them hidden', () => {
    for (const [solid, n] of [
      ['prism_3', 9],
      ['prism_6', 18],
      ['pyramid_4', 8],
      ['pyramid_6', 12],
    ] as const) {
      const p = polyhedronOf(solid, { a: 1, h: 1.3 });
      expect(p && edgesOf(p).length, solid).toBe(n);
      expect(p && edgesOf(p).some((e) => e.hidden), solid).toBe(true);
    }
  });

  it('a cone has two outline lines, and the hull of a square is its four corners', () => {
    expect(coneTangents(0.8, 1.5)).not.toBeNull();
    expect(
      hull([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0.5, 0.5],
      ]),
    ).toHaveLength(4);
  });
});
