// A stand-in for react-native-reanimated, for the component project.
//
// requires live verification in Claude Code session — this replaces part of the outside
// world (CLAUDE.md rule 8): Reanimated 4 builds its animations as worklets, which only exist
// once its Babel plugin has rewritten both the app and the library itself. Under this runner
// there is no such pass, and importing the real package throws before any component renders
// ("Failed to create a worklet").
//
// So motion is NOT under test at this layer: an `Animated.View` is a `View`, an entering
// animation is a value nobody plays, and a shared value is a plain box. What is under test is
// everything around the motion — what renders, with which labels, styles and handlers.
// Whether the motion itself is right is decided elsewhere: the policy in
// lib/theme/__tests__/reduceMotion.test.ts, the look in tests/web, the feel on the device.

import { forwardRef, type ComponentType, type ReactNode } from 'react';
import {
  Image as ImageRN,
  ScrollView as ScrollViewRN,
  Text as TextRN,
  View as ViewRN,
} from 'react-native';

/** An entering/exiting/layout animation: every builder call returns the same inert value. */
class Inert {
  duration(): this {
    return this;
  }
  easing(): this {
    return this;
  }
  delay(): this {
    return this;
  }
  springify(): this {
    return this;
  }
  damping(): this {
    return this;
  }
  stiffness(): this {
    return this;
  }
  mass(): this {
    return this;
  }
  reduceMotion(): this {
    return this;
  }
  withInitialValues(): this {
    return this;
  }
  randomDelay(): this {
    return this;
  }
  build(): () => Record<string, never> {
    return () => ({});
  }
}

const inert = (): Inert => new Inert();

export const FadeIn = inert();
export const FadeInDown = inert();
export const FadeInUp = inert();
export const FadeOut = inert();
export const LinearTransition = inert();
export const ZoomIn = inert();
export const ZoomOut = inert();

export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' } as const;

type EasingFn = (t: number) => number;
const linear: EasingFn = (t) => t;
export const Easing = {
  linear,
  ease: linear,
  sin: Math.sin,
  bezier: (): EasingFn => linear,
  in: (fn: EasingFn = linear): EasingFn => fn,
  out: (fn: EasingFn = linear): EasingFn => fn,
  inOut: (fn: EasingFn = linear): EasingFn => fn,
};

export type SharedValue<T> = { value: T; get: () => T; set: (next: T) => void };

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const box = { value: initial } as SharedValue<T>;
  box.get = () => box.value;
  box.set = (next: T) => {
    box.value = next;
  };
  return box;
}

export function useAnimatedStyle<T>(build: () => T): T {
  return build();
}

export function useAnimatedProps<T>(build: () => T): T {
  return build();
}

export function useDerivedValue<T>(build: () => T): SharedValue<T> {
  return useSharedValue(build());
}

export function useAnimatedRef<T>(): { current: T | null } {
  return { current: null };
}

/** The app only ever asks "is less motion wanted?" — here the answer is no. */
export function useReducedMotion(): boolean {
  return false;
}

export function useFrameCallback(): { setActive: () => void; isActive: boolean } {
  return { setActive: () => undefined, isActive: false };
}

export const withTiming = <T,>(to: T): T => to;
export const withSpring = <T,>(to: T): T => to;
export const withDelay = <T,>(_ms: number, to: T): T => to;
export const withRepeat = <T,>(to: T): T => to;
export const withSequence = <T,>(...steps: T[]): T => steps[steps.length - 1] as T;
export const cancelAnimation = (): void => undefined;
export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args);
export const runOnUI =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args);

export function interpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
): number {
  const lo = input[0] ?? 0;
  const hi = input[input.length - 1] ?? 1;
  const a = output[0] ?? 0;
  const b = output[output.length - 1] ?? 0;
  if (hi === lo) return a;
  const share = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return a + (b - a) * share;
}

export const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' } as const;

/** Holds back its children's layout animations; nothing animates here, so it just renders. */
export function LayoutAnimationConfig({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/**
 * The animated props Reanimated adds are accepted and dropped: a component may keep passing
 * `entering`, `exiting` or `layout` and still render.
 */
type MotionProps = { entering?: unknown; exiting?: unknown; layout?: unknown };

function plain<P extends object>(Component: ComponentType<P>): ComponentType<P & MotionProps> {
  const Wrapped = forwardRef<unknown, P & MotionProps>(function Wrapped(props, ref) {
    const { entering: _e, exiting: _x, layout: _l, ...rest } = props;
    const Any = Component as ComponentType<Record<string, unknown>>;
    return <Any {...(rest as P)} ref={ref} />;
  });
  return Wrapped as unknown as ComponentType<P & MotionProps>;
}

const Animated = {
  View: plain(ViewRN),
  Text: plain(TextRN),
  ScrollView: plain(ScrollViewRN),
  Image: plain(ImageRN),
  createAnimatedComponent: plain,
};

export default Animated;
