// Entrances in the shared motion language (lib/theme/motion.ts), driven by shared values
// instead of layout animations, so they behave the same on phones and in the web build
// (react-native-web's layout animations misplace views inside scroll views):
// - <Rise>: something new rises a few pixels and fades in (a bubble, a card, a row);
// - <SlideIn>: the next question comes in softly from the right;
// - <Appear>: a plain fade (a button that replaces another in place).
// Each runs once, when it mounts; `index` staggers a group. Reduce motion: no movement,
// the content is simply there.

import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { DURATION, EASE, RISE, STAGGER } from '../../lib/theme/motion.js';

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
  const reduced = useReducedMotion();
  const run = animate && !reduced;
  const p = useSharedValue(run ? 0 : 1);
  useEffect(() => {
    if (!run) return;
    p.value = withDelay(delay, withTiming(1, { duration, easing: EASE.standard }));
    // Once, on mount (a later change of the props does not replay it).
  }, []);
  return p;
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
  const p = useEntrance(animate, delay + index * STAGGER, slow ? DURATION.gentle : DURATION.base);
  const distance = slow ? RISE * 2 : RISE;
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * distance }],
  }));
  return (
    <Animated.View {...rest} style={[style, a]}>
      {children}
    </Animated.View>
  );
}

export function SlideIn({ children, delay = 0, animate = true, style, ...rest }: Props) {
  const p = useEntrance(animate, delay, DURATION.gentle);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateX: (1 - p.value) * 28 }],
  }));
  return (
    <Animated.View {...rest} style={[style, a]}>
      {children}
    </Animated.View>
  );
}

export function Appear({ children, delay = 0, animate = true, style, ...rest }: Props) {
  const p = useEntrance(animate, delay, DURATION.base);
  const a = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Animated.View {...rest} style={[style, a]}>
      {children}
    </Animated.View>
  );
}
