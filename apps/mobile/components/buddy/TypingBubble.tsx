// Buddy is thinking: his bubble with three softly pulsing dots, the small orb's
// moon racing round beside it — so a wait never looks like nothing is happening.
// Screen readers hear "Buddy schreibt …" (a polite live region); the dots are
// decorative. With reduce motion the dots stand still at a soft tone.

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useAnnounce } from '../../lib/announce.js';
import { BUBBLE, TAIL } from '../../lib/theme/bubble.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { riseIn } from '../../lib/theme/enter.js';
import { EASE } from '../../lib/theme/motion.js';
import { circle } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';

/** One dot's rise and fall; the three follow each other like a soft wave. */
const DOT_MS = 420;
const DOT_GAP_MS = 160;
const DOT = 8;

export function TypingBubble({ label }: { label: string }) {
  const { palette } = useTheme();
  // iOS has no live regions: "Buddy schreibt" says itself (lib/announce.ts).
  useAnnounce(label);
  const reduce = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const c = useSharedValue(0);
  useEffect(() => {
    const dots = [a, b, c];
    if (reduce) return;
    dots.forEach((d, i) => {
      d.value = withDelay(
        i * DOT_GAP_MS,
        withRepeat(
          withSequence(
            withTiming(1, { duration: DOT_MS, easing: EASE.breathe }),
            withTiming(0, { duration: DOT_MS, easing: EASE.breathe }),
            // A short rest after each wave, so it reads as calm, not as a spinner.
            withTiming(0, { duration: DOT_GAP_MS * 2 }),
          ),
          -1,
        ),
      );
    });
    return () => dots.forEach((d) => cancelAnimation(d));
  }, [reduce, a, b, c]);
  return (
    <Animated.View
      entering={riseIn()}
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}
    >
      <BuddyOrb size={26} state="think" />
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            // token-exempt: the dots' drawing, not layout: three 8-point dots 6 apart
            gap: 6,
            backgroundColor: palette.paper,
            borderRadius: BUBBLE.borderRadius,
            borderBottomLeftRadius: TAIL,
            // token-exempt: inset 18 from the ends, so the dots sit where a short word would
            paddingHorizontal: 18,
            height: 44,
          },
          SHADOW.soft,
        ]}
      >
        <Dot v={a} />
        <Dot v={b} />
        <Dot v={c} />
      </View>
    </Animated.View>
  );
}

function Dot({ v }: { v: SharedValue<number> }) {
  const { palette } = useTheme();
  const style = useAnimatedStyle(() => ({
    opacity: 0.28 + v.value * 0.5,
    transform: [{ translateY: -v.value * 3 }, { scale: 0.9 + v.value * 0.15 }],
  }));
  return (
    <Animated.View
      style={[
        { width: DOT, height: DOT, borderRadius: circle(DOT), backgroundColor: palette.primary },
        style,
      ]}
    />
  );
}
