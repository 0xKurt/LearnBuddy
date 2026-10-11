// Reanimated web treats duration(0) as its default; explicit Always skips the animation (#548).
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ reduced: false, listeners: [] as Array<() => void> }));
vi.mock('../../../lib/theme/motion.js', () => ({
  DURATION: { quick: 140, base: 220 },
  EASE: { standard: () => 0 },
  REDUCE: 'system',
  onReducedMotionChange: (listener: () => void) => {
    state.listeners.push(listener);
    return () => {};
  },
  RISE: 6,
  STAGGER: 45,
  reducedMotionValue: { value: false },
  motionIsReduced: () => state.reduced,
}));
vi.mock('react-native-reanimated', () => {
  function builder() {
    return {
      policy: '',
      durationMs: -1,
      delayMs: -1,
      duration(value: number) {
        return { ...this, durationMs: value };
      },
      easing() {
        return this;
      },
      delay(value: number) {
        return { ...this, delayMs: value };
      },
      reduceMotion(value: string) {
        this.policy = value;
        return this;
      },
      withInitialValues() {
        return this;
      },
      build() {
        return () => ({});
      },
    };
  }
  return {
    FadeIn: builder(),
    FadeOut: builder(),
    FadeInDown: builder(),
    LinearTransition: builder(),
    ReduceMotion: { Always: 'always', Never: 'never' },
  };
});
import { fadeIn, fadeOut, riseIn, glide } from '../../../lib/theme/enter.js';

describe('live reduced layout entrances', () => {
  it('updates the web layout builder after each live toggle', () => {
    state.reduced = true;
    state.listeners.forEach((listener) => listener());
    expect((glide as unknown as { policy: string }).policy).toBe('always');
    state.reduced = false;
    state.listeners.forEach((listener) => listener());
    expect((glide as unknown as { policy: string }).policy).toBe('never');
  });
  it('explicitly skips fades and stagger after reduced motion turns on', () => {
    state.reduced = true;
    for (const build of [fadeIn, fadeOut, () => riseIn(3)]) {
      const result = build() as unknown as { policy: string; durationMs: number };
      expect(result.policy).toBe('always');
      expect(result.durationMs).toBe(0);
    }
    expect((riseIn(3) as unknown as { delayMs: number }).delayMs).toBe(0);
  });
  it('allows the requested fade duration when motion turns off again', () => {
    state.reduced = false;
    const result = fadeIn(140) as unknown as { policy: string; durationMs: number };
    expect(result.policy).toBe('never');
    expect(result.durationMs).toBe(140);
  });
});
