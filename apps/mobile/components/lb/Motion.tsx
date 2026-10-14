// Entrances in the shared motion language (lib/theme/motion.ts), driven by shared values
// instead of layout animations, so they behave the same on phones and in the web build
// (react-native-web's layout animations misplace views inside scroll views):
// - <Rise>: something new rises a few pixels and fades in (a bubble, a card, a row);
// - <SlideIn>: the next question comes in softly from the right;
// - <Appear>: a plain fade (a button that replaces another in place).
// Each runs once, when it mounts; `index` staggers a group. Reduce motion: no movement,
// the content is simply there.

import { useEffect, useRef, type ReactNode } from 'react';
import type { StyleProp, TextProps, TextStyle, ViewProps, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  cancelAnimation,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { read } from '../../lib/sharedRead.js';
import { UI } from '../../lib/theme/components.js';
import {
  ACTIVE_MOTION,
  DURATION,
  EASE,
  RISE,
  STAGGER,
  useMotionReduced,
} from '../../lib/theme/motion.js';

type Props = Omit<ViewProps, 'style'> & {
  children: ReactNode;
  /** Wait this long first (ms). */
  delay?: number;
  /** Position in a group that enters together (adds a small stagger). */
  index?: number;
  /** false: no entrance (it was there already). */
  animate?: boolean;
  /** Slower and a little further, for a moment that deserves a beat. */
  slow?: boolean;
  style?: StyleProp<ViewStyle>;
};

function useEntrance(animate: boolean, delay: number, duration: number) {
  const reduced = useMotionReduced();
  const run = animate && !reduced;
  const from = run ? 0 : 1;
  const p = useSharedValue(from);
  const started = useRef(false);
  useEffect(() => {
    if (reduced) {
      started.current = true;
      cancelAnimation(p);
      p.value = 1;
      return;
    }
    if (started.current) return;
    // An initially skipped entrance is consumed too; later prop changes do not replay it.
    if (!run) {
      started.current = true;
      return;
    }
    started.current = true;
    p.value = withDelay(
      delay,
      withTiming(1, { duration, easing: EASE.standard, ...ACTIVE_MOTION }),
      ACTIVE_MOTION.reduceMotion,
    );
    // Once, on mount (a later change of the props does not replay it).
  }, [reduced, run, p, delay, duration]);
  // What `p` starts at: a style's first run at mount takes it without a blocking read (#637).
  return { p, from };
}

export function Rise({
  children,
  delay = 0,
  index = 0,
  animate = true,
  slow = false,
  style,
  ...rest
}: Props) {
  const { p, from } = useEntrance(
    animate,
    delay + index * STAGGER,
    slow ? DURATION.gentle : DURATION.base,
  );
  const distance = slow ? RISE * UI.entrance.slowMultiplier : RISE;
  const a = useAnimatedStyle(() => ({
    opacity: read(p, from),
    transform: [{ translateY: (1 - read(p, from)) * distance }],
  }));
  return (
    <Animated.View {...rest} style={[style, a]}>
      {children}
    </Animated.View>
  );
}

export function SlideIn({ children, delay = 0, animate = true, style, ...rest }: Props) {
  const { p, from } = useEntrance(animate, delay, DURATION.gentle);
  const a = useAnimatedStyle(() => ({
    opacity: read(p, from),
    transform: [{ translateX: (1 - read(p, from)) * UI.entrance.slide }],
  }));
  return (
    <Animated.View {...rest} style={[style, a]}>
      {children}
    </Animated.View>
  );
}

export function Appear({
  children,
  delay = 0,
  index = 0,
  duration = DURATION.base,
  animate = true,
  style,
  ...rest
}: Props & { duration?: number }) {
  const { p, from } = useEntrance(animate, delay + index * STAGGER, duration);
  const a = useAnimatedStyle(() => ({ opacity: read(p, from) }));
  return (
    <Animated.View {...rest} style={[style, a]}>
      {children}
    </Animated.View>
  );
}

/**
 * For lists: the rows that are there when the list first shows rise in one after the other;
 * rows that come later (scrolling, a refresh, a recycled row) just stand. Returns whether the
 * row at `index` should animate. `ready`: the list's data has arrived.
 */
export function useListEntrance(
  ready: boolean,
  max = UI.entrance.maxRows,
  windowMs = UI.entrance.windowMs,
) {
  const since = useRef<number | null>(null);
  if (ready && since.current === null) since.current = Date.now();
  return (index: number) =>
    since.current !== null && index < max && Date.now() - since.current < windowMs;
}

export function AppearText({
  children,
  delay = 0,
  index = 0,
  duration = DURATION.base,
  animate = true,
  style,
  ...rest
}: Omit<TextProps, 'style'> & {
  children: ReactNode;
  delay?: number;
  index?: number;
  duration?: number;
  animate?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { p, from } = useEntrance(animate, delay + index * STAGGER, duration);
  const a = useAnimatedStyle(() => ({ opacity: read(p, from) }));
  return (
    <Animated.Text {...rest} style={[style, a]}>
      {children}
    </Animated.Text>
  );
}
