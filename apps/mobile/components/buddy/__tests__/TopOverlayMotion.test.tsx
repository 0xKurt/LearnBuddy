import type * as Motion from '../../../lib/theme/motion.js';
import { Animated, PanResponder, Text } from 'react-native';
import { vi, describe, it, expect } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { TopOverlay } from '../TopOverlay.js';

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../lib/theme/motion.js', async (original) => ({
  ...(await original<typeof Motion>()),
  useMotionReduced: () => preference.reduced,
}));

describe('overlay dismissal with a live motion preference', () => {
  it('finishes an in-flight dismissal once when reduced motion is enabled', () => {
    preference.reduced = false;
    const close = vi.fn();
    const latestClose = vi.fn();
    const create = vi.spyOn(PanResponder, 'create');
    let completion: ((result: { finished: boolean }) => void) | undefined;
    vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (callback) => {
        completion = callback;
      },
      stop: vi.fn(),
      reset: vi.fn(),
    }));
    const view = renderInApp(
      <TopOverlay id="reading" closeLabel="Close" onClose={close}>
        <Text>Reading</Text>
      </TopOverlay>,
    );
    const handlers = create.mock.calls.at(-1)![0];
    handlers.onPanResponderRelease!({} as never, { dy: -60, vy: -1 } as never);
    expect(close).not.toHaveBeenCalled();
    preference.reduced = true;
    view.rerender(
      <TopOverlay id="reading" closeLabel="Close" onClose={latestClose}>
        <Text>Reading</Text>
      </TopOverlay>,
    );
    expect(latestClose).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    completion?.({ finished: false });
    completion?.({ finished: true });
    expect(latestClose).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

it('does not dismiss replacement content when id and reduction change together', () => {
  preference.reduced = false;
  const oldClose = vi.fn(),
    newClose = vi.fn();
  const create = vi.spyOn(PanResponder, 'create');
  vi.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }));
  const view = renderInApp(
    <TopOverlay id="old" closeLabel="Close" onClose={oldClose}>
      <Text>Old</Text>
    </TopOverlay>,
  );
  create.mock.calls.at(-1)![0].onPanResponderRelease!({} as never, { dy: -60, vy: -1 } as never);
  preference.reduced = true;
  view.rerender(
    <TopOverlay id="new" closeLabel="Close" onClose={newClose}>
      <Text>New</Text>
    </TopOverlay>,
  );
  expect(newClose).not.toHaveBeenCalled();
  expect(oldClose).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

it('ignores a cancelled dismissal completion after replacement and unmount', () => {
  preference.reduced = false;
  const oldClose = vi.fn(),
    newClose = vi.fn();
  const create = vi.spyOn(PanResponder, 'create');
  const completions: Array<(result: { finished: boolean }) => void> = [];
  vi.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (callback) => {
      if (callback) completions.push(callback);
    },
    stop: vi.fn(),
    reset: vi.fn(),
  }));
  const view = renderInApp(
    <TopOverlay id="old" closeLabel="Close" onClose={oldClose}>
      <Text>Old</Text>
    </TopOverlay>,
  );
  const release = () =>
    create.mock.calls.at(-1)![0].onPanResponderRelease!({} as never, { dy: -60, vy: -1 } as never);
  release();
  view.rerender(
    <TopOverlay id="new" closeLabel="Close" onClose={newClose}>
      <Text>New</Text>
    </TopOverlay>,
  );
  release();
  completions[0]!({ finished: true });
  expect(newClose).not.toHaveBeenCalled();
  view.unmount();
  completions[1]!({ finished: true });
  expect(oldClose).not.toHaveBeenCalled();
  expect(newClose).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
