// Buddy's face: a soft pastel orb (blue → lilac → pink, like light through
// glass) with a white glow. With `listening`, sound bars appear in it (the
// voice-first look). The same Buddy at every size; decorative for screen readers.
// Alive at rest (gap 18): it breathes slowly, and a tap makes it bob gently —
// nothing happens because of the tap, it only answers the touch. With reduce
// motion it stands still.
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useSvgId } from '../../lib/theme/svgId.js';
import { barHeights } from '../../lib/speech/level.js';
import { LB } from '../../lib/theme/colors.js';
import { DURATION, EASE, SPRING } from '../../lib/theme/motion.js';

const BAR_X = [33, 41, 49, 57, 65];
/** The tallest bar at full voice (in the 100-unit viewBox). */
const BAR_MAX = 44;
/** One slow breath (in and out), like someone calm at rest. */
export const BREATH_MS = 4200;

export function BuddyOrb({
  size = 32,
  listening = false,
  level = 0.5,
  breathe = true,
  reactToTap = size >= 48,
}: {
  size?: number;
  listening?: boolean;
  /** How loud she is (0…1): the sound bars follow it while listening. */
  level?: number;
  /** Breathe slowly at rest (off where another motion drives it, or many orbs stand together). */
  breathe?: boolean;
  /** Bob gently when touched (decorative: the tap starts nothing); default for a large orb. */
  reactToTap?: boolean;
}) {
  const reduce = useReducedMotion();
  const breath = useSharedValue(0);
  const bob = useSharedValue(1);
  useEffect(() => {
    if (!breathe || reduce) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS / 2, easing: EASE.breathe }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [breathe, reduce, breath]);
  const style = useAnimatedStyle(() => ({
    // A breath is barely a size change: 4 % in.
    transform: [{ scale: (1 + breath.value * 0.04) * bob.value }],
  }));

  const heights = barHeights(level).map((h) => h * BAR_MAX);
  const base = useSvgId('g');
  const ids = { orbBody: `${base}orbBody`, orbShine: `${base}orbShine` };
  const orb = (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={ids.orbBody} cx="30%" cy="55%" r="80%">
            <Stop offset="0" stopColor="#b9c9ff" />
            <Stop offset="0.45" stopColor="#d7c4ff" />
            <Stop offset="0.8" stopColor="#f9c6e1" />
            <Stop offset="1" stopColor="#fbe3f0" />
          </RadialGradient>
          <RadialGradient id={ids.orbShine} cx="40%" cy="30%" r="45%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.85} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="48" fill={`url(#${ids.orbBody})`} />
        <Circle cx="50" cy="50" r="47" fill={`url(#${ids.orbShine})`} />
        <Circle
          cx="50"
          cy="50"
          r="47.5"
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.9}
          strokeWidth={1.5}
        />
        {listening
          ? BAR_X.map((x, i) => (
              <Rect
                key={x}
                x={x - 1.8}
                y={50 - (heights[i] ?? 0) / 2}
                width={3.6}
                height={heights[i] ?? 0}
                rx={1.8}
                fill={LB.primary}
              />
            ))
          : null}
      </Svg>
    </Animated.View>
  );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {reactToTap ? (
        <Pressable
          accessible={false}
          onPressIn={() => {
            if (reduce) return;
            bob.value = withSequence(
              withTiming(0.92, { duration: DURATION.quick, easing: EASE.standard }),
              withSpring(1, SPRING),
            );
          }}
        >
          {orb}
        </Pressable>
      ) : (
        orb
      )}
    </View>
  );
}
