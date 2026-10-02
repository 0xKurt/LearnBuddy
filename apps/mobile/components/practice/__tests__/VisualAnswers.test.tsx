// The clock she sets and the coins she lays (issue #254), and the geometry a solid is drawn with
// (issue #255). What is held here is what the browser cannot measure: every number on the dial is
// a named button, the hour hand lands where it lies closest to the number tapped, a laid coin is
// taken back by a tap, and a cube shows three faces and hides three edges.

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
import { ClockAnswer, setHand } from '../ClockAnswer.js';
import { CoinAnswer, laidWords } from '../CoinAnswer.js';

describe('the clock she sets', () => {
  it('turns the minute hand in five-minute steps and the hour hand to its nearest place', () => {
    expect(setHand({ hour: 12, minute: 0 }, 'minute', 9)).toEqual({ hour: 12, minute: 45 });
    expect(setHand({ hour: 12, minute: 0 }, 'minute', 12)).toEqual({ hour: 12, minute: 0 });
    // At 45 minutes the short hand stands just BEFORE a number: the 8 means 7:45 …
    expect(setHand({ hour: 12, minute: 45 }, 'hour', 8)).toEqual({ hour: 7, minute: 45 });
    // … and the 7 means 6:45.
    expect(setHand({ hour: 12, minute: 45 }, 'hour', 7)).toEqual({ hour: 6, minute: 45 });
    // On the full hour it stands on the number; 1 after 12 wraps round.
    expect(setHand({ hour: 5, minute: 0 }, 'hour', 7)).toEqual({ hour: 7, minute: 0 });
    expect(setHand({ hour: 5, minute: 45 }, 'hour', 1)).toEqual({ hour: 12, minute: 45 });
  });

  it('offers twelve named buttons and writes the time it shows', () => {
    const onChange = vi.fn();
    renderInApp(<ClockAnswer value="" disabled={false} onChange={onChange} />);
    const numbers = screen.getAllByRole('button');
    expect(numbers).toHaveLength(12);
    expect(numbers[6]?.getAttribute('aria-label')).toBe('Stundenzeiger zur 7');
    fireEvent.click(screen.getByRole('button', { name: 'Stundenzeiger zur 7' }));
    expect(onChange).toHaveBeenLastCalledWith('7:00');
    fireEvent.click(screen.getByRole('radio', { name: 'Minuten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Minutenzeiger auf die 3' }));
    expect(onChange).toHaveBeenLastCalledWith('12:15');
  });
});

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
