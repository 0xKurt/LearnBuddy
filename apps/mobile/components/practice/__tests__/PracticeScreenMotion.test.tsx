import { useEffect, useRef, type ReactNode } from 'react';
import type { GestureDetector } from 'react-native-gesture-handler';
import type * as Reanimated from 'react-native-reanimated';
import type * as Motion from '../../../lib/theme/motion.js';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { Text, View } from 'react-native';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { DOUBLE_TAP_SCALE, MAX_SCALE } from '../../../lib/gestures.js';
import { StimulusImage } from '../StimulusImage.js';
import { ZoomViewer, Zoomable } from '../../lb/ZoomViewer.js';
import { Nudge, VerdictTag } from '../Verdict.js';
import { Thinking } from '../Thinking.js';
import { ItemThread } from '../ItemThread.js';

const state = vi.hoisted(() => ({
  reduced: false,
  timing: vi.fn(),
  cancel: vi.fn(),
  spring: vi.fn(),
  gesture: null as unknown,
  images: [] as { transition?: number; source: unknown }[],
  imageUnmount: vi.fn(),
  orb: vi.fn(),
  values: [] as { value: unknown }[],
  exits: [] as ((done: boolean) => void)[],
}));
vi.mock('../../../lib/theme/motion.js', async (load) => {
  const actual = await load<typeof Motion>();
  return {
    ...actual,
    useMotionReduced: () => state.reduced,
    reducedMotionValue: {
      get value() {
        return state.reduced;
      },
    },
  };
});
vi.mock('react-native-reanimated', async (load) => {
  const actual = await load<typeof Reanimated>();
  return {
    ...actual,
    useSharedValue: <T,>(initial: T) => {
      const ref = useRef({ value: initial });
      if (!state.values.includes(ref.current)) state.values.push(ref.current);
      return ref.current;
    },
    withTiming: (value: number, config: unknown, done?: (finished: boolean) => void) => {
      state.timing(value, config);
      if (done) state.exits.push(done);
      return value;
    },
    withSpring: (value: number, config: unknown) => {
      state.spring(value, config);
      return value;
    },
    cancelAnimation: state.cancel,
  };
});
vi.mock('react-native-gesture-handler', async (load) => {
  const actual = await load<{ GestureDetector: typeof GestureDetector }>();
  return {
    ...actual,
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: ReactNode }) => {
      state.gesture = gesture;
      return <View>{children}</View>;
    },
  };
});
vi.mock('expo-image', () => ({
  Image: (props: { transition?: number; source: unknown }) => {
    state.images.push(props);
    useEffect(() => () => state.imageUnmount(), []);
    return null;
  },
}));
vi.mock('../../lb/BuddyOrb.js', () => ({
  BuddyOrb: () => {
    state.orb();
    return null;
  },
}));

beforeEach(() => {
  state.reduced = false;
  state.timing.mockClear();
  state.cancel.mockClear();
  state.orb.mockClear();
  state.values = [];
  state.exits = [];
  state.spring.mockClear();
  state.images = [];
  state.imageUnmount.mockClear();
});

it('cancels fresh judgement and nudge on a live preference change without replaying the result', () => {
  const content = () => (
    <>
      <VerdictTag verdict="correct" label="Stimmt" fresh />
      <Nudge active>
        <Text>Antwort</Text>
      </Nudge>
    </>
  );
  const view = renderInApp(content());
  expect(state.timing).toHaveBeenCalled();
  state.reduced = true;
  state.timing.mockClear();
  state.cancel.mockClear();
  view.rerender(content());
  expect(state.cancel).toHaveBeenCalled();
  expect(state.timing).not.toHaveBeenCalled();
  expect(state.values.map((v) => v.value)).toEqual([1, 0]);
  state.reduced = false;
  view.rerender(content());
  expect(state.timing).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Stimmt')).toBeDefined();
});

it('announces pending status with no content Orb or repeating animation', () => {
  renderInApp(<Thinking label="Buddy schaut nach …" />);
  expect(screen.getByText('Buddy schaut nach …').getAttribute('aria-live')).toBe('polite');
  expect(state.orb).not.toHaveBeenCalled();
});

it('preserves current zoom when live reduction cancels its ongoing transition', () => {
  const props = { visible: true, onClose: vi.fn(), label: 'Abbildung' };
  const view = renderInApp(
    <ZoomViewer {...props}>
      <Text>Inhalt</Text>
    </ZoomViewer>,
  );
  // Viewer owns shown/scale/x/y/pull, in that order. Simulate an intermediate gesture spring.
  state.values[1]!.value = 2.2;
  state.values[2]!.value = 35;
  state.values[3]!.value = -18;
  state.reduced = true;
  state.timing.mockClear();
  state.cancel.mockClear();
  view.rerender(
    <ZoomViewer {...props}>
      <Text>Inhalt</Text>
    </ZoomViewer>,
  );
  expect(state.values.slice(1, 4).map((v) => v.value)).toEqual([2.2, 35, -18]);
  expect(state.cancel).toHaveBeenCalled();
  expect(state.timing).not.toHaveBeenCalled();
});

it('dismisses once and rejects a stale exit completion after reduced closure and reopening', () => {
  const onClose = vi.fn();
  const content = (visible: boolean) => (
    <ZoomViewer visible={visible} onClose={onClose} label="Abbildung">
      <Text>Inhalt</Text>
    </ZoomViewer>
  );
  const view = renderInApp(content(true));
  const close = screen.getByRole('button', { name: 'Schließen' });
  fireEvent.click(close);
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledTimes(1);
  view.rerender(content(false));
  const lateExit = state.exits.at(-1)!;
  state.reduced = true;
  view.rerender(content(false));
  expect(screen.queryByText('Inhalt')).toBeNull();
  view.rerender(content(true));
  lateExit(true);
  expect(screen.getByText('Inhalt')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('keeps actual pinch bounds and double-tap zoom while reduced motion skips gesture springs', () => {
  state.reduced = true;
  renderInApp(
    <ZoomViewer visible onClose={vi.fn()} label="Abbildung">
      <Text>Inhalt</Text>
    </ZoomViewer>,
  );
  const gesture = state.gesture as {
    gestures: {
      handlers: {
        onStart?: (event: { focalX: number; focalY: number }) => void;
        onUpdate?: (event: { scale: number }) => void;
        onEnd?: (event: { x: number; y: number }, success: boolean) => void;
      };
    }[];
  };
  gesture.gestures[2]!.handlers.onEnd!({ x: 0.5, y: 0.5 }, true);
  expect(state.values[1]!.value).toBe(DOUBLE_TAP_SCALE);
  gesture.gestures[0]!.handlers.onStart!({ focalX: 0.5, focalY: 0.5 });
  gesture.gestures[0]!.handlers.onUpdate!({ scale: 100 });
  gesture.gestures[0]!.handlers.onEnd!({ x: 0, y: 0 }, true);
  expect(state.values[1]!.value).toBe(MAX_SCALE);
  expect(state.spring).not.toHaveBeenCalled();
});

it('replaces an active image fade with an immediate cached image on live reduction', () => {
  const image = {
    url: 'https://fixture.invalid/crop',
    width: 300,
    height: 200,
    label: 'Abbildung',
  };
  const view = renderInApp(<StimulusImage image={image} cacheKey="item.crop" />);
  expect(state.images.at(-1)!.transition).toBe(90);
  state.reduced = true;
  view.rerender(<StimulusImage image={image} cacheKey="item.crop" />);
  expect(state.images.at(-1)!.transition).toBe(0);
  expect(state.images.at(-1)!.source).toEqual({ uri: image.url, cacheKey: 'item.crop' });
  expect(state.imageUnmount).toHaveBeenCalledTimes(1);
});

it('keeps a small photo target at least44 on web without depending on native hit slop', () => {
  renderInApp(
    <Zoomable label="Foto">
      <View style={{ width: 30, height: 40 }} />
    </Zoomable>,
  );
  const style = styleOf(screen.getByRole('button', { name: 'Foto' }));
  expect(style.minWidth).toBe('44px');
  expect(style.minHeight).toBe('44px');
});

it('renders tutor feedback as full-width plain text with its accessible speaker and no content Orb', () => {
  renderInApp(
    <ItemThread
      pending={null}
      turns={[
        {
          id: '00000000-0000-4000-8000-000000000002',
          item_id: '00000000-0000-4000-8000-000000000001',
          role: 'tutor',
          text: 'Bring beide auf Achtel.',
          verdict: null,
          pronunciation: null,
          reexplain: null,
          created_at: '2026-10-11T12:00:00.000Z',
        },
      ]}
    />,
  );
  const reply = screen.getByLabelText('Buddy: Bring beide auf Achtel.');
  const style = styleOf(reply);
  expect(parseFloat(style.paddingLeft || '0')).toBe(0);
  expect(parseFloat(style.paddingTop || '0')).toBe(0);
  expect(style.alignSelf).toBe('stretch');
  expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(state.orb).not.toHaveBeenCalled();
});
