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

import { LB } from '../../lib/theme/colors.js';
import { EASE } from '../../lib/theme/motion.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Rise } from '../lb/Motion.js';

export function Thinking({ label }: { label: string }) {
  return (
    <Rise delay={120} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <BuddyOrb size={26} state="think" />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: LB.paper,
          borderRadius: 16,
          borderBottomLeftRadius: 6,
          paddingHorizontal: 12,
          height: 32,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Dot key={i} index={i} />
        ))}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[TYPE.small, { color: LB.ink2, flexShrink: 1 }]}
      >
        {label}
      </Text>
    </Rise>
  );
}

const STEP_MS = 300;

function Dot({ index }: { index: number }) {
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
      style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: LB.ink3 }, style]}
    />
  );
}
