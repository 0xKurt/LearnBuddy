// requires live verification in Claude Code session — native AccessibilityInfo and worklets mocked.
import { beforeEach, expect, it, vi } from 'vitest';

const os = vi.hoisted(() => ({
  changed: (_on: boolean) => {},
  remove: vi.fn(),
  notify: vi.fn(),
  unsubscribe: () => {},
  initial: () => Promise.resolve(false),
}));
vi.mock('react', () => ({
  useSyncExternalStore: (
    subscribe: (listener: () => void) => () => void,
    snapshot: () => boolean,
  ) => {
    os.unsubscribe = subscribe(os.notify);
    return snapshot();
  },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => os.initial(),
    addEventListener: (_event: string, callback: (on: boolean) => void) => {
      os.changed = callback;
      return { remove: os.remove };
    },
  },
}));
vi.mock('react-native-reanimated', () => {
  const builder = {
    duration: vi.fn().mockReturnThis(),
    easing: vi.fn().mockReturnThis(),
    delay: vi.fn().mockReturnThis(),
    reduceMotion: vi.fn().mockReturnThis(),
    withInitialValues: vi.fn().mockReturnThis(),
    build: () => () => ({ initialValues: {}, animations: { width: 'animated' } }),
  };
  return {
    makeMutable: (value: boolean) => ({ value }),
    Easing: { bezier: () => () => 0, inOut: () => () => 0, sin: () => 0 },
    ReduceMotion: { System: 'system', Never: 'never' },
    FadeIn: builder,
    FadeInDown: builder,
    FadeOut: builder,
    LinearTransition: builder,
  };
});

import { glide } from '../enter.js';
import { motionIsReduced, useMotionReduced, watchReducedMotion } from '../motion.js';

beforeEach(() => {
  os.initial = () => Promise.resolve(false);
  vi.clearAllMocks();
});

it('updates already-mounted layout animations and subscribers when the OS toggles motion', async () => {
  const offWatch = watchReducedMotion();
  await Promise.resolve();
  expect(useMotionReduced()).toBe(false);
  if (typeof glide !== 'function') throw new Error('native layout must use the live worklet');
  const values = {
    currentBorderRadius: 0,
    targetBorderRadius: 0,
    currentOriginX: 0,
    currentOriginY: 0,
    currentWidth: 10,
    currentHeight: 10,
    targetOriginX: 20,
    targetOriginY: 30,
    targetWidth: 40,
    targetHeight: 50,
    currentGlobalOriginX: 0,
    currentGlobalOriginY: 0,
    targetGlobalOriginX: 20,
    targetGlobalOriginY: 30,
    windowWidth: 390,
    windowHeight: 844,
  };
  expect(glide(values).animations.width).toBe('animated');
  os.changed(true);
  expect(motionIsReduced()).toBe(true);
  expect(os.notify).toHaveBeenCalledOnce();
  expect(glide(values)).toEqual({
    initialValues: { originX: 20, originY: 30, width: 40, height: 50 },
    animations: {},
  });
  os.changed(false);
  expect(glide(values).animations.width).toBe('animated');
  os.unsubscribe();
  offWatch();
  expect(os.remove).toHaveBeenCalledOnce();
});

it('does not let a stale startup read undo a newer live reduced-motion setting', async () => {
  let resolveRead: (on: boolean) => void = () => {};
  os.initial = () =>
    new Promise<boolean>((resolve) => {
      resolveRead = resolve;
    });
  const off = watchReducedMotion();
  os.changed(true);
  resolveRead(false);
  await Promise.resolve();
  expect(motionIsReduced()).toBe(true);
  off();
});

it('ignores an initial OS read after the watcher was disposed', async () => {
  let resolveRead: (on: boolean) => void = () => {};
  os.initial = () =>
    new Promise<boolean>((resolve) => {
      resolveRead = resolve;
    });
  const off = watchReducedMotion();
  os.changed(true);
  off();
  resolveRead(false);
  await Promise.resolve();
  expect(motionIsReduced()).toBe(true);
});
