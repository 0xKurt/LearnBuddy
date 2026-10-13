import { describe, expect, it, vi } from 'vitest';
import { createFrameClearance, frameScrollDelta, type Frame } from '../../lb/FormFrameClearance.js';

type Measure = Parameters<Frame['measureInWindow']>[0];
function measured(top: number, height: number): Frame {
  return { measureInWindow: (done) => done(0, top, 100, height) };
}

describe('form frame clearance', () => {
  it('reveals border and halo even when the inner input already fits', () => {
    // Native input ends at 400; surrounding frame ends at 401 and halo at 405.
    expect(frameScrollDelta(349, 52, { top: 100, height: 300 }, 4)).toBe(5);
    expect(frameScrollDelta(200, 52, { top: 100, height: 300 }, 4)).toBe(0);
    expect(frameScrollDelta(100, 52, { top: 100, height: 300 }, 4)).toBe(-4);
  });
  it('recomputes the actual footer-bounded viewport after keyboard layout', () => {
    let height = 500;
    const scroll = vi.fn();
    const controller = createFrameClearance(() => measured(100, height), scroll);
    controller.focus(measured(349, 52));
    expect(scroll).not.toHaveBeenCalled();
    height = 300;
    controller.refresh();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(5);
  });
  it.each(['blur', 'dispose', 'replace'] as const)(
    'ignores pending measurements after %s',
    (operation) => {
      let done: Measure | undefined;
      const field: Frame = {
        measureInWindow: (callback) => {
          done = callback;
        },
      };
      const scroll = vi.fn();
      const controller = createFrameClearance(() => measured(100, 300), scroll);
      controller.focus(field);
      if (operation === 'blur') controller.blur(field);
      if (operation === 'dispose') controller.dispose();
      if (operation === 'replace') controller.focus(measured(200, 52));
      done?.(0, 349, 100, 52);
      expect(scroll).not.toHaveBeenCalled();
    },
  );
  it('ignores stale viewport measurements before a newer focus', () => {
    const callbacks: Measure[] = [];
    const scroll = vi.fn();
    const controller = createFrameClearance(
      () => ({ measureInWindow: (cb) => callbacks.push(cb) }),
      scroll,
    );
    controller.focus(measured(349, 52));
    controller.focus(measured(200, 52));
    callbacks[0]!(0, 100, 100, 300);
    callbacks[1]!(0, 100, 100, 300);
    expect(scroll).not.toHaveBeenCalled();
  });
});

import { createRef } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderInApp } from '../../../testing/render.js';
import { LbTextInput, type LbTextInputRef } from '../../lb/LbTextInput.js';
import { FormFrameContext } from '../../lb/FormFrameClearance.js';

it.each(['field', 'cell'] as const)(
  'preserves %s input focus/ref callbacks and releases its frame on blur/unmount',
  (variant) => {
    const ref = createRef<LbTextInputRef>();
    const focus = vi.fn();
    const blur = vi.fn();
    const controller = { focus, blur, refresh: vi.fn(), dispose: vi.fn() };
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { unmount } = renderInApp(
      <FormFrameContext.Provider value={controller}>
        <LbTextInput variant={variant} ref={ref} label="Year" onFocus={onFocus} onBlur={onBlur} />
      </FormFrameContext.Provider>,
    );
    const input = screen.getByRole('textbox', { name: 'Year' });
    expect(ref.current).toBe(input);
    expect(typeof ref.current?.focus).toBe('function');
    fireEvent.focus(input);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    const frame = focus.mock.calls[0]![0];
    expect(frame).not.toBe(ref.current);
    expect(frame.contains(input)).toBe(true);
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledWith(frame);
    fireEvent.focus(input);
    unmount();
    expect(blur).toHaveBeenLastCalledWith(frame);
  },
);

// Sign-up at 360×440: "Die beiden Passwörter sind noch nicht gleich." ended 9.5 pt under the
// pinned CTA, because only the box was kept in view and the note stands under it (#599).
it('keeps a form field whole with the note under it; a cell stays its own frame', () => {
  const focus = vi.fn();
  const controller = { focus, blur: vi.fn(), refresh: vi.fn(), dispose: vi.fn() };
  renderInApp(
    <FormFrameContext.Provider value={controller}>
      <LbTextInput label="Passwort wiederholen" error errorMessage="Noch nicht gleich." />
      <LbTextInput variant="cell" accessibilityLabel="Zelle" />
    </FormFrameContext.Provider>,
  );
  fireEvent.focus(screen.getByRole('textbox', { name: 'Passwort wiederholen' }));
  const field = focus.mock.calls[0]![0] as HTMLElement;
  expect(field.contains(screen.getByText('Noch nicht gleich.'))).toBe(true);
  fireEvent.focus(screen.getByRole('textbox', { name: 'Zelle' }));
  const cell = focus.mock.calls[1]![0] as HTMLElement;
  expect(cell.getAttribute('data-testid')).toBe('answer-cell-frame');
});

it('does not enroll the pinned bar in form scrolling', () => {
  const focus = vi.fn();
  const controller = { focus, blur: vi.fn(), refresh: vi.fn(), dispose: vi.fn() };
  renderInApp(
    <FormFrameContext.Provider value={controller}>
      <LbTextInput variant="bar" accessibilityLabel="Answer" />
    </FormFrameContext.Provider>,
  );
  fireEvent.focus(screen.getByRole('textbox', { name: 'Answer' }));
  expect(focus).not.toHaveBeenCalled();
});

import { act, renderHook } from '@testing-library/react';
import type { ScrollView } from 'react-native';
import { useFormViewport } from '../../lb/FormFrameClearance.js';

it('scrolls minimally without animation using the real viewport host ref', () => {
  const scrollTo = vi.fn();
  const { result, unmount } = renderHook(() => useFormViewport());
  result.current.scroll.current = {
    getNativeScrollRef: () => measured(100, 300),
    getScrollableNode: () => 42,
    scrollTo,
  } as unknown as ScrollView;
  result.current.offset.current = 20;
  act(() => result.current.controller.focus(measured(349, 52)));
  expect(scrollTo).toHaveBeenCalledWith({ y: 25, animated: false });
  expect(result.current.offset.current).toBe(25);
  unmount();
  act(() => result.current.controller.refresh());
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

it('corrects from the live web viewport after native focus scroll precedes its event', () => {
  const host = document.createElement('div');
  host.scrollTop = 116;
  const scrollTo = vi.fn();
  const { result } = renderHook(() => useFormViewport());
  result.current.scroll.current = {
    getNativeScrollRef: () => measured(100, 300),
    getScrollableNode: () => host,
    scrollTo,
  } as unknown as ScrollView;
  result.current.offset.current = 15;
  act(() => result.current.controller.focus(measured(349, 52)));
  expect(scrollTo).toHaveBeenCalledWith({ y: 121, animated: false });
  expect(result.current.offset.current).toBe(121);
});

it('corrects horizontal focus from the live web offset before its scroll event', () => {
  const host = document.createElement('div');
  host.scrollLeft = 116;
  const scrollTo = vi.fn();
  const { result } = renderHook(() => useFormViewport('horizontal'));
  result.current.scroll.current = {
    getNativeScrollRef: () => ({ measureInWindow: (done: Measure) => done(100, 100, 300, 300) }),
    getScrollableNode: () => host,
    scrollTo,
  } as unknown as ScrollView;
  result.current.offset.current = 15;
  act(() => result.current.controller.focus({ measureInWindow: (done) => done(349, 200, 52, 44) }));
  expect(scrollTo).toHaveBeenCalledWith({ x: 121, animated: false });
  expect(result.current.offset.current).toBe(121);
});

it('retains event offsets for a horizontal native host without a DOM offset', () => {
  const scrollTo = vi.fn();
  const { result } = renderHook(() => useFormViewport('horizontal'));
  result.current.scroll.current = {
    getNativeScrollRef: () => ({ measureInWindow: (done: Measure) => done(100, 100, 300, 300) }),
    getScrollableNode: () => 42,
    scrollTo,
  } as unknown as ScrollView;
  result.current.offset.current = 20;
  act(() => result.current.controller.focus({ measureInWindow: (done) => done(349, 200, 52, 44) }));
  expect(scrollTo).toHaveBeenCalledWith({ x: 25, animated: false });
});
