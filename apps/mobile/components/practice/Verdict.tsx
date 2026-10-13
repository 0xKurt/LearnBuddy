// Feedback carries its meaning in a sign and a word. A fresh result may fade in; live reduced motion
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
  // Icon and word, never the colour alone (design components/buddy/Message.jsx:24–31): a check on
  // the "right" tint, a cross on the "wrong" tint for a miss and for "Fast" (ui_kits/app/Flows.jsx
  // :40, :113 — the words stay the kind ones). An answer nobody could judge is neither: it keeps
  // the quiet chip without a sign.
  const skin =
    verdict === 'correct'
      ? ({ icon: 'check', bg: palette.mint, color: palette.successText } as const)
      : verdict === 'unchecked'
        ? ({ icon: null, bg: palette.canvas, color: palette.ink2 } as const)
        : ({ icon: 'close', bg: palette.blush, color: palette.danger } as const);
  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: PRACTICE_SCREEN.verdictSignGap,
          backgroundColor: skin.bg,
          borderRadius: PRACTICE_SCREEN.verdictRadius,
          paddingHorizontal: PRACTICE_SCREEN.verdictPadding,
          paddingVertical: PRACTICE_SCREEN.verdictPaddingVertical,
        },
        style,
      ]}
    >
      {skin.icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={skin.icon} size={PRACTICE_SCREEN.verdictIcon} color={skin.color} />
        </View>
      ) : null}
      <Text style={[TYPE.label, { color: skin.color }]}>{label}</Text>
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
