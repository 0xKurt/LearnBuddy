import { act, fireEvent, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { useEndScroll } from '../../../lib/useEndScroll.js';
import { CHAT } from '../../../lib/theme/chat.js';
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../lib/theme/motion.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useMotionReduced: () => motion.reduced,
}));
function Adapter({ capture }: { capture?: (follow: (animated: boolean) => void) => void }) {
  const ref = useRef<ScrollView>(null);
  const follow = useEndScroll(ref);
  useEffect(() => capture?.(follow.toEnd), [capture, follow.toEnd]);
  return (
    <>
      <button onClick={() => follow.toEnd(true)}>Follow</button>
      <ScrollView
        ref={ref}
        testID="viewport"
        scrollEventThrottle={CHAT.scrollThrottle}
        onScroll={follow.onScroll}
        {...follow.inputProps}
      >
        <button>Card action</button>
        <input aria-label="Draft" />
      </ScrollView>
    </>
  );
}
function mount() {
  const rendered = renderInApp(<Adapter />);
  const viewport = screen.getByTestId('viewport');
  const inner = viewport.firstElementChild!;
  for (const element of [viewport, inner])
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 900 });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 300 });
  Object.defineProperty(viewport, 'offsetHeight', { configurable: true, value: 300 });
  const scroll = vi.fn();
  Object.defineProperty(viewport, 'scroll', { configurable: true, value: scroll });
  return { rendered, viewport, scroll };
}
beforeEach(() => {
  motion.reduced = false;
});
it('settles an active real ScrollView adapter at its end once when reduction changes', () => {
  const { rendered, scroll } = mount();
  fireEvent.click(screen.getByText('Follow'));
  expect(scroll).toHaveBeenLastCalledWith({ top: 900, left: 0, behavior: 'smooth' });
  motion.reduced = true;
  rendered.rerender(<Adapter />);
  expect(scroll.mock.calls).toEqual([
    [{ top: 900, left: 0, behavior: 'smooth' }],
    [{ top: 900, left: 0, behavior: 'auto' }],
  ]);
  rendered.rerender(<Adapter />);
  expect(scroll).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText('Follow'));
  expect(scroll).toHaveBeenLastCalledWith({ top: 900, left: 0, behavior: 'auto' });
});
it('leaves a manually interrupted reader in place and allows future normal follow', () => {
  const { rendered, viewport, scroll } = mount();
  fireEvent.click(screen.getByText('Follow'));
  fireEvent.wheel(viewport, { deltaY: -100 });
  motion.reduced = true;
  rendered.rerender(<Adapter />);
  expect(scroll).toHaveBeenCalledTimes(1);
  motion.reduced = false;
  rendered.rerender(<Adapter />);
  fireEvent.click(screen.getByText('Follow'));
  expect(scroll).toHaveBeenLastCalledWith({ top: 900, left: 0, behavior: 'smooth' });
});
it('consumes endpoint completion and cleanup without restarting a settled follow', () => {
  const { rendered, viewport, scroll } = mount();
  fireEvent.click(screen.getByText('Follow'));
  Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 600 });
  fireEvent.scroll(viewport);
  motion.reduced = true;
  rendered.rerender(<Adapter />);
  expect(scroll).toHaveBeenCalledTimes(1);
  rendered.unmount();
  expect(scroll).toHaveBeenCalledTimes(1);
});
it('does not mistake text editing or ordinary action activation for reader scrolling', () => {
  const { rendered, scroll } = mount();
  fireEvent.click(screen.getByText('Follow'));
  fireEvent.keyDown(screen.getByLabelText('Draft'), { key: 'ArrowUp' });
  fireEvent.keyDown(screen.getByText('Card action'), { key: ' ' });
  motion.reduced = true;
  act(() => rendered.rerender(<Adapter />));
  expect(scroll).toHaveBeenCalledTimes(2);
});

it('does not issue stale follow commands after the real adapter unmounts', () => {
  let saved: ((animated: boolean) => void) | undefined;
  const rendered = renderInApp(
    <Adapter
      capture={(follow) => {
        saved = follow;
      }}
    />,
  );
  const viewport = screen.getByTestId('viewport');
  Object.defineProperty(viewport, 'scrollHeight', { value: 900 });
  const scroll = vi.fn();
  Object.defineProperty(viewport, 'scroll', { value: scroll });
  fireEvent.click(screen.getByText('Follow'));
  expect(scroll).toHaveBeenCalledTimes(1);
  rendered.unmount();
  motion.reduced = true;
  act(() => saved?.(true));
  expect(scroll).toHaveBeenCalledTimes(1);
});
