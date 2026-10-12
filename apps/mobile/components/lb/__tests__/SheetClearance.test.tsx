import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type * as Clearance from '../FormFrameClearance.js';
import {
  FormFrameContext,
  createFrameClearance,
  useFormFrameClearance,
} from '../FormFrameClearance.js';
import { renderInApp } from '../../../testing/render.js';
import { Sheet } from '../Sheet.js';
const modal = vi.hoisted(() => ({ height: 300, scrollTo: vi.fn() }));
beforeEach(() => {
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

it('does not carry an old scroll offset into a newly mounted modal viewport', () => {
  const props = { title: 'Editor', closeLabel: 'Schließen', onClose: vi.fn() };
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
  view.rerender(
    <Sheet visible {...props}>
      <FocusProbe />
    </Sheet>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Focus field' }));
  expect(modal.scrollTo).toHaveBeenLastCalledWith({ y: 5, animated: false });
});
