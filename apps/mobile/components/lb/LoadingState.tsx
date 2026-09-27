// Shared full-screen loading state for the few places without a content shape to hint at
// (starting the app, checking a link): Buddy's orb breathing slowly and, when there is
// one, a short line of what is loading. It appears only after a moment, so a quick load
// shows nothing at all instead of a flash. Screens with content use a skeleton
// (components/lb/Skeletons.tsx). Reduce motion: the orb stands still.

import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { TYPE } from '../../lib/theme/type.js';
import { EASE } from '../../lib/theme/motion.js';
import { BuddyOrb } from './BuddyOrb.js';
import { Appear } from './Motion.js';

/** A quick load is over before anything shows. */
const SHOW_AFTER_MS = 250;
const BREATH_MS = 1600;

export function LoadingState({ label }: { label?: string }) {
  const reduced = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: EASE.breathe }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [reduced, breath]);
  const orb = useAnimatedStyle(() => ({
    opacity: 0.75 + breath.value * 0.25,
    transform: [{ scale: 0.94 + breath.value * 0.08 }],
  }));
  return (
    <Appear
      delay={SHOW_AFTER_MS}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        gap: 16,
      }}
    >
      <Animated.View style={orb}>
        <BuddyOrb size={56} />
      </Animated.View>
      {label ? <Text style={[TYPE.small, { textAlign: 'center' }]}>{label}</Text> : null}
    </Appear>
  );
}
