import type * as Motion from '../../../lib/theme/motion.js';
import type * as Reanimated from 'react-native-reanimated';
import { act, fireEvent, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type * as Clearance from '../FormFrameClearance.js';
import {
  FormFrameContext,
  createFrameClearance,
  useFormFrameClearance,
} from '../FormFrameClearance.js';
import { renderInApp } from '../../../testing/render.js';
import { Sheet } from '../Sheet.js';
// requires live verification in Claude Code session — controllable OS preference and worklet completion boundaries.
const motion = vi.hoisted(() => ({
  reduced: false,
  hold: false,
  callbacks: [] as ((finished: boolean) => void)[],
  listeners: new Set<() => void>(),
  cancel: vi.fn(),
}));
vi.mock('../../../lib/theme/motion.js', async (load) => ({
  ...(await load<typeof Motion>()),
  useMotionReduced: () =>
    useSyncExternalStore(
      (listener) => {
        motion.listeners.add(listener);
        return () => {
          motion.listeners.delete(listener);
        };
      },
      () => motion.reduced,
    ),
}));
vi.mock('react-native-reanimated', async (load) => {
  const actual = await load<typeof Reanimated>();
  return {
    ...actual,
    cancelAnimation: motion.cancel,
    withTiming: (value: number, config: unknown, done?: (finished: boolean) => void) => {
      if (motion.hold && done) {
        motion.callbacks.push(done);
        return value;
      }
      done?.(true);
      return actual.withTiming(value, config as Parameters<typeof actual.withTiming>[1]);
    },
  };
});
const modal = vi.hoisted(() => ({ height: 300, scrollTo: vi.fn() }));
beforeEach(() => {
  motion.reduced = false;
  motion.hold = false;
  motion.callbacks = [];
  motion.cancel.mockClear();
  modal.height = 300;
  modal.scrollTo.mockClear();
});
vi.mock('../FormFrameClearance.js', async (load) => {
  const actual = await load<typeof Clearance>();
  return {
    ...actual,
    useFormViewport: () => {
      const form = actual.useFormViewport();
      // Native geometry boundary: jsdom cannot measure a real modal viewport.
      Object.defineProperty(form.scroll, 'current', {
        configurable: true,
        get: () => ({
          getNativeScrollRef: () => ({
            measureInWindow: (done: (...args: number[]) => void) => done(0, 100, 300, modal.height),
          }),
          getScrollableNode: () => null,
          scrollTo: modal.scrollTo,
        }),
        set: () => {},
      });
      return form;
    },
  };
});
function FocusProbe() {
  const clearance = useFormFrameClearance();
  return (
    <button onClick={() => clearance?.focus({ measureInWindow: (done) => done(0, 349, 100, 52) })}>
      Focus field
    </button>
  );
}
it('reveals a modal field within its own footer-bounded viewport, never the underlying parent', () => {
  const parentScroll = vi.fn();
  const parent = createFrameClearance(
    () => ({ measureInWindow: (done) => done(0, 0, 300, 200) }),
    parentScroll,
  );
  renderInApp(
    <FormFrameContext.Provider value={parent}>
      <Sheet visible title="Editor" closeLabel="Schließen" onClose={vi.fn()}>
        <FocusProbe />
      </Sheet>
    </FormFrameContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Focus field' }));
  expect(modal.scrollTo).toHaveBeenCalledWith({ y: 5, animated: false });
  expect(parentScroll).not.toHaveBeenCalled();
});

it('does not carry an old scroll offset into a newly mounted modal viewport', async () => {
  const closed = vi.fn();
  const props = { title: 'Editor', closeLabel: 'Schließen', onClose: vi.fn(), onClosed: closed };
  const view = renderInApp(
    <Sheet visible {...props}>
      <FocusProbe />
    </Sheet>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Focus field' }));
  expect(modal.scrollTo).toHaveBeenLastCalledWith({ y: 5, animated: false });
  view.rerender(
    <Sheet visible={false} {...props}>
      <FocusProbe />
    </Sheet>,
  );
  await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  view.rerender(
    <Sheet visible {...props}>
      <FocusProbe />
    </Sheet>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Focus field' }));
  expect(modal.scrollTo).toHaveBeenLastCalledWith({ y: 5, animated: false });
});

it('dispatches close completion exactly once after the real web Modal has dismissed', async () => {
  const closed = vi.fn();
  const props = { title: 'Editor', closeLabel: 'Schließen', onClose: vi.fn(), onClosed: closed };
  const view = renderInApp(
    <Sheet visible {...props}>
      <FocusProbe />
    </Sheet>,
  );
  view.rerender(
    <Sheet visible={false} {...props}>
      <FocusProbe />
    </Sheet>,
  );
  await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  view.rerender(
    <Sheet visible={false} {...props}>
      <FocusProbe />
    </Sheet>,
  );
  expect(closed).toHaveBeenCalledTimes(1);
});

it('settles a closing sheet on a live preference change, then ignores the late worklet completion', async () => {
  const closed = vi.fn();
  const props = { title: 'Editor', closeLabel: 'Schließen', onClose: vi.fn(), onClosed: closed };
  const view = renderInApp(
    <Sheet visible {...props}>
      <FocusProbe />
    </Sheet>,
  );
  motion.hold = true;
  view.rerender(
    <Sheet visible={false} {...props}>
      <FocusProbe />
    </Sheet>,
  );
  const old = motion.callbacks[0];
  if (!old) throw new Error('The actual close callback was not registered');
  expect(old).toBeTruthy();
  expect(closed).not.toHaveBeenCalled();
  act(() => {
    motion.reduced = true;
    for (const changed of motion.listeners) changed();
  });
  await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  act(() => old(true));
  expect(closed).toHaveBeenCalledTimes(1);
  expect(motion.cancel).toHaveBeenCalled();
});
it('rejects a stale closing completion after the same sheet has reopened', () => {
  const closed = vi.fn();
  const props = { title: 'Editor', closeLabel: 'Schließen', onClose: vi.fn(), onClosed: closed };
  const view = renderInApp(
    <Sheet visible {...props}>
      <FocusProbe />
    </Sheet>,
  );
  motion.hold = true;
  view.rerender(
    <Sheet visible={false} {...props}>
      <FocusProbe />
    </Sheet>,
  );
  const old = motion.callbacks[0];
  if (!old) throw new Error('The actual close callback was not registered');
  view.rerender(
    <Sheet visible {...props}>
      <FocusProbe />
    </Sheet>,
  );
  act(() => old(true));
  expect(closed).not.toHaveBeenCalled();
  expect(screen.getByText('Editor')).toBeTruthy();
});
