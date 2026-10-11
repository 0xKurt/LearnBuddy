import type * as Reanimated from 'react-native-reanimated';
import type * as MotionTokens from '../../../lib/theme/motion.js';
import { Text } from 'react-native';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { Appear } from '../Motion.js';
import { Sheet } from '../Sheet.js';

const state = vi.hoisted(() => ({
  reduced: false,
  timing: vi.fn(),
  delay: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../../../lib/theme/motion.js', async (load) => {
  const actual = await load<typeof MotionTokens>();
  return { ...actual, useMotionReduced: () => state.reduced };
});
vi.mock('react-native-reanimated', async (load) => {
  const actual = await load<typeof Reanimated>();
  return {
    ...actual,
    withDelay: (ms: number, value: number, policy: unknown) => {
      state.delay(ms, policy);
      return value;
    },
    withTiming: (value: number, config: unknown) => {
      state.timing(value, config);
      return value;
    },
    cancelAnimation: state.cancel,
  };
});

beforeEach(() => {
  state.reduced = false;
  state.timing.mockClear();
  state.cancel.mockClear();
  state.delay.mockClear();
});
describe('base live motion preference', () => {
  it('allows new transitions after reduced startup while keeping the mounted entrance still', () => {
    state.reduced = true;
    const view = renderInApp(
      <Appear key="original">
        <Text>Inhalt</Text>
      </Appear>,
    );
    expect(state.timing).not.toHaveBeenCalled();
    state.reduced = false;
    view.rerender(
      <Appear key="original">
        <Text>Inhalt</Text>
      </Appear>,
    );
    expect(state.timing).not.toHaveBeenCalled();
    view.rerender(
      <Appear key="new">
        <Text>Inhalt</Text>
      </Appear>,
    );
    expect(state.timing).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reduceMotion: 'never' }),
    );
    expect(state.delay).toHaveBeenCalledWith(0, 'never');
    state.timing.mockClear();
    const props = { title: 'Auswahl', closeLabel: 'Schließen', onClose: vi.fn() };
    state.reduced = true;
    view.rerender(
      <Sheet {...props} visible>
        <Text>Inhalt</Text>
      </Sheet>,
    );
    expect(state.timing).not.toHaveBeenCalled();
    state.reduced = false;
    view.rerender(
      <Sheet {...props} visible>
        <Text>Inhalt</Text>
      </Sheet>,
    );
    expect(state.timing).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reduceMotion: 'never' }),
    );
  });

  it('cancels an entrance when the setting turns on and does not replay it', () => {
    const view = renderInApp(
      <Appear>
        <Text>Inhalt</Text>
      </Appear>,
    );
    expect(state.timing).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reduceMotion: 'never' }),
    );
    state.timing.mockClear();
    state.reduced = true;
    act(() =>
      view.rerender(
        <Appear>
          <Text>Inhalt</Text>
        </Appear>,
      ),
    );
    expect(state.cancel).toHaveBeenCalled();
    expect(state.timing).not.toHaveBeenCalled();
    state.reduced = false;
    act(() =>
      view.rerender(
        <Appear>
          <Text>Inhalt</Text>
        </Appear>,
      ),
    );
    expect(state.timing).not.toHaveBeenCalled();
  });
  it('closes an open sheet immediately after the live setting turns on', () => {
    const props = { title: 'Auswahl', closeLabel: 'Schließen', onClose: vi.fn() };
    const view = renderInApp(
      <Sheet {...props} visible>
        <Text>Inhalt</Text>
      </Sheet>,
    );
    expect(state.timing).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reduceMotion: 'never' }),
    );
    state.timing.mockClear();
    state.reduced = true;
    act(() =>
      view.rerender(
        <Sheet {...props} visible>
          <Text>Inhalt</Text>
        </Sheet>,
      ),
    );
    expect(state.cancel).toHaveBeenCalled();
    act(() =>
      view.rerender(
        <Sheet {...props} visible={false}>
          <Text>Inhalt</Text>
        </Sheet>,
      ),
    );
    expect(screen.queryByText('Auswahl')).toBeNull();
    expect(state.timing).not.toHaveBeenCalled();
  });
});
