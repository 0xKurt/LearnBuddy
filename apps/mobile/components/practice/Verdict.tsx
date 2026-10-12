// Feedback carries its meaning in words. A fresh result may fade in; live reduced motion
// finishes that transition and cancels a finite answer nudge immediately.
import { useEffect, useRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { ACTIVE_MOTION, DURATION, EASE, useMotionReduced } from '../../lib/theme/motion.js';
import { PRACTICE_SCREEN } from '../../lib/theme/practiceScreen.js';
import { CHAT } from '../../lib/theme/chat.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';

export type VerdictKey = 'correct' | 'partially_correct' | 'incorrect' | 'unchecked';

export function VerdictTag({
  verdict,
  label,
  fresh,
}: {
  verdict: VerdictKey;
  label: string;
  fresh: boolean;
}) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  const played = useRef(false);
  const shown = useSharedValue(fresh && !reduced ? 0 : 1);
  useEffect(() => {
    cancelAnimation(shown);
    const animate = fresh && !reduced && !played.current;
    played.current = true;
    shown.value = animate
      ? withTiming(1, { duration: DURATION.base, easing: EASE.standard, ...ACTIVE_MOTION })
      : 1;
    return () => cancelAnimation(shown);
  }, [fresh, reduced, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  const right = verdict === 'correct';
  const partial = verdict === 'partially_correct';
  const color = right ? palette.successText : partial ? palette.warningText : palette.ink2;
  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs,
          backgroundColor: right ? palette.mint : partial ? palette.butter : palette.canvas,
          borderRadius: PRACTICE_SCREEN.verdictRadius,
          paddingHorizontal: PRACTICE_SCREEN.verdictPadding,
          paddingVertical: PRACTICE_SCREEN.verdictPaddingVertical,
        },
        style,
      ]}
    >
      {right ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="check" size={PRACTICE_SCREEN.verdictIcon} color={color} />
        </View>
      ) : null}
      <Text style={[TYPE.label, { color }]}>{label}</Text>
    </Animated.View>
  );
}

export function Nudge({ active, children }: { active: boolean; children: ReactNode }) {
  const reduced = useMotionReduced();
  const x = useSharedValue(0);
  const played = useRef(false);
  useEffect(() => {
    cancelAnimation(x);
    if (!active) played.current = false;
    if (!active || reduced || played.current) {
      if (active) played.current = true;
      x.value = 0;
      return;
    }
    played.current = true;
    const step = { duration: DURATION.verdictNudgeStep, easing: EASE.standard, ...ACTIVE_MOTION };
    x.value = withSequence(
      ...PRACTICE_SCREEN.nudgeOffsets.flatMap((offset) => [
        withTiming(offset, step),
        withTiming(0, step),
      ]),
    );
    return () => cancelAnimation(x);
  }, [active, reduced, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[{ maxWidth: CHAT.mineWidth }, style]}>{children}</Animated.View>;
}
