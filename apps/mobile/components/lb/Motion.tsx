// Entrances in the shared motion language (lib/theme/motion.ts), driven by shared values
// instead of layout animations, so they behave the same on phones and in the web build
// (react-native-web's layout animations misplace views inside scroll views):
// - <Rise>: something new rises a few pixels and fades in (a bubble, a card, a row);
// - <SlideIn>: the next question comes in softly from the right;
// - <Appear>: a plain fade (a button that replaces another in place).
// Each runs once, when it mounts; `index` staggers a group. Reduce motion: no movement,
// and the fade stays — the same cross-fade, in place (issue #126). It used to be "the
// content is simply there", and `withTiming`'s default (`ReduceMotion.System`) would have
// skipped the fade anyway: every card and row popped in one frame.

import { useEffect, useRef, type ReactNode } from 'react';
import { Platform, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { DURATION, fadeTiming, RISE, STAGGER } from '../../lib/theme/motion.js';
import { sharedEntrance } from '../../lib/theme/reduceMotion.js';

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

/** `p` runs 0 → 1 once; `moves` is false when the system asks for less motion. */
function useEntrance(animate: boolean, delay: number, duration: number) {
  const { moves } = sharedEntrance(useReducedMotion(), Platform.OS);
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    p.value = withDelay(delay, withTiming(1, fadeTiming(duration)));
    // Once, on mount (a later change of the props does not replay it).
  }, []);
  return { p, moves };
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
  const { p, moves } = useEntrance(
    animate,
    delay + index * STAGGER,
    slow ? DURATION.gentle : DURATION.base,
  );
  const distance = moves ? (slow ? RISE * 2 : RISE) : 0;
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
  const { p, moves } = useEntrance(animate, delay, DURATION.gentle);
  const distance = moves ? 28 : 0;
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateX: (1 - p.value) * distance }],
  }));
  return (
    <Animated.View {...rest} style={[style, a]}>
      {children}
    </Animated.View>
  );
}

export function Appear({ children, delay = 0, animate = true, style, ...rest }: Props) {
  const { p } = useEntrance(animate, delay, DURATION.base);
  const a = useAnimatedStyle(() => ({ opacity: p.value }));
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
export function useListEntrance(ready: boolean, max = 8, windowMs = 900) {
  const since = useRef<number | null>(null);
  if (ready && since.current === null) since.current = Date.now();
  return (index: number) =>
    since.current !== null && index < max && Date.now() - since.current < windowMs;
}
