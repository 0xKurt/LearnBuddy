// A picture that gives way to the room the screen measured (#599, `usePictureCap`): four
// pictures under a drawing ran the bar 30 pt past 360×740, a skeleton under a two-line question
// made the body scroll 13 pt. Each measurement is answered once, so a render that brings the same
// measurement again never gives the room twice.

import { screen } from '@testing-library/react';
import { Text } from 'react-native';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { PictureRoom, usePictureCap } from '../../../lib/practice/screenRoom.js';

function Probe({ id, natural = 0 }: { id: string; natural?: number }) {
  return <Text testID="cap">{usePictureCap(id, 89, 2, natural)}</Text>;
}

const at = (spare: number | null, id = 'q1', natural = 0) => (
  <PictureRoom.Provider value={spare}>
    <Probe id={id} natural={natural} />
  </PictureRoom.Provider>
);

const cap = () => Number(screen.getByTestId('cap').textContent);

describe('a picture sized from the measured room', () => {
  it('stands at its share until the screen measures less room, then gives it once', () => {
    const view = renderInApp(at(null));
    expect(cap()).toBe(89);
    view.rerender(at(-30));
    expect(cap()).toBe(74);
    // The same measurement again (a render for something else): nothing more is given.
    view.rerender(at(-30));
    expect(cap()).toBe(74);
    // Fits now: it stays where it fits.
    view.rerender(at(0));
    expect(cap()).toBe(74);
    // Room comes free: it takes it back, up to its share.
    view.rerender(at(40));
    expect(cap()).toBe(89);
  });

  it('starts every question at its share', () => {
    const view = renderInApp(at(-30));
    view.rerender(at(-30, 'q2'));
    // The measurement it finds is the last question's.
    expect(cap()).toBe(89);
    view.rerender(at(-12, 'q2'));
    expect(cap()).toBe(83);
  });

  it('gives from the height the pictures stand at, not from a cap they stand under', () => {
    // The views of a cube building: 60 pt at full size under a cap of 89, the bar 30 pt past.
    const view = renderInApp(at(null, 'q3', 60));
    view.rerender(at(-30, 'q3', 60));
    expect(cap()).toBe(45);
    view.unmount();
    // Their full height reported after the measurement: taken from it then, once.
    const late = renderInApp(at(null, 'q4'));
    late.rerender(at(-30, 'q4'));
    expect(cap()).toBe(74);
    late.rerender(at(-30, 'q4', 60));
    expect(cap()).toBe(45);
    late.rerender(at(-30, 'q4', 60));
    expect(cap()).toBe(45);
  });
});
