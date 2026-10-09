// Buddy is looking at her answer: the small orb and three soft dots that rise and fall
// in turn (a real state: shown only while the request runs), with the words beside them
// for everyone who does not see the dots. Reduce motion: the dots stand still.

import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAnnounce } from '../../lib/announce.js';
import { TAIL } from '../../lib/theme/bubble.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { EASE } from '../../lib/theme/motion.js';
import { circle } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Rise } from '../lb/Motion.js';

/** The small bubble around the dots: a pill with a bubble's tail. */
const PILL = 32;

export function Thinking({ label }: { label: string }) {
  const { palette } = useTheme();
  // iOS has no live regions: the waiting state says itself (lib/announce.ts).
  useAnnounce(label);
  return (
    <Rise delay={120} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <BuddyOrb size={26} state="think" />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5, // token-exempt: the dots' drawing, three 6-point dots 5 apart
          backgroundColor: palette.paper,
          borderRadius: circle(PILL),
          borderBottomLeftRadius: TAIL,
          paddingHorizontal: SPACE.md,
          height: PILL,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Dot key={i} index={i} />
        ))}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[TYPE.small, { color: palette.ink2, flexShrink: 1 }]}
      >
        {label}
      </Text>
    </Rise>
  );
}

const STEP_MS = 300;
const DOT = 6;

function Dot({ index }: { index: number }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(1, { duration: STEP_MS, easing: EASE.breathe }),
          withTiming(0, { duration: STEP_MS, easing: EASE.breathe }),
          withTiming(0, { duration: STEP_MS }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(v);
  }, [reduced, index, v]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + v.value * 0.6,
    transform: [{ translateY: -3 * v.value }],
  }));
  return (
    <Animated.View
      style={[
        { width: DOT, height: DOT, borderRadius: circle(DOT), backgroundColor: palette.ink3 },
        style,
      ]}
    />
  );
}
