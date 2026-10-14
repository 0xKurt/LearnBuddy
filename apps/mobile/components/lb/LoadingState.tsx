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

import { read } from '../../lib/sharedRead.js';
import { TYPE } from '../../lib/theme/type.js';
import { EASE } from '../../lib/theme/motion.js';
import { SPACE } from '../../lib/theme/space.js';
import { LOADING_STATE } from '../../lib/theme/states.js';
import { BuddyOrb } from './BuddyOrb.js';
import { Appear } from './Motion.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export function LoadingState({
  label,
  orb: withOrb = true,
}: {
  label?: string;
  /** False under a head whose orb already shows Buddy thinking: one Buddy per screen (#599). */
  orb?: boolean;
}) {
  useTheme();
  const reduced = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    // No orb, nothing breathes: a loop with nothing to move still runs every frame (#637).
    if (reduced || !withOrb) return;
    breath.value = withRepeat(
      withTiming(1, { duration: LOADING_STATE.breathMs, easing: EASE.breathe }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [reduced, withOrb, breath]);
  const orb = useAnimatedStyle(() => ({
    opacity: LOADING_STATE.dim + read(breath, 0) * LOADING_STATE.dimSpan,
    transform: [{ scale: LOADING_STATE.scale + read(breath, 0) * LOADING_STATE.scaleSpan }],
  }));
  return (
    <Appear
      delay={LOADING_STATE.showAfterMs}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: LOADING_STATE.padX,
        gap: SPACE.lg,
      }}
    >
      {withOrb ? (
        <Animated.View style={orb}>
          <BuddyOrb size={LOADING_STATE.orb} />
        </Animated.View>
      ) : null}
      {label ? <Text style={[TYPE.small, { textAlign: 'center' }]}>{label}</Text> : null}
    </Appear>
  );
}
