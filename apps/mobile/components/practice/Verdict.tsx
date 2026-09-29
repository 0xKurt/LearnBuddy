// How a judgement arrives. The chip always carries the word (never colour alone); the
// movement only says "this just happened":
// - right: the chip pops in, its check draws itself, a soft mint glow breathes out behind
//   it and a few tiny pastel dots drift away — calm, over in well under a second;
// - "Fast" / "Noch nicht ganz": the chip fades in and her answer gives a small, gentle
//   shake (a nudge, never an alarm).
// Only a judgement that arrives while the screen is open moves (`fresh`); one that was
// already there when the question opened just stands. Reduce motion: no movement at all.

import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';
import { DURATION, EASE } from '../../lib/theme/motion.js';

export type VerdictKey = 'correct' | 'partially_correct' | 'incorrect' | 'unchecked';

// Soft pastel chips with dark text; the word carries the meaning (a small check for "right").
// Read at render time: module-scope maps froze the start palette (issue #84).
const verdictBg = (): Record<VerdictKey, string> => ({
  correct: LB.mint,
  partially_correct: LB.butter,
  incorrect: LB.canvas,
  unchecked: LB.canvas,
});
const verdictText = (): Record<VerdictKey, string> => ({
  correct: LB.successText,
  partially_correct: LB.warningText,
  incorrect: LB.ink2,
  unchecked: LB.ink2,
});

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The check's path ("M5 12l5 5 9-10") is about 20.5 units long. */
const CHECK_LENGTH = 21;

type Spark = { angle: number; distance: number; color: string; size: number };

/** Tiny dots around a right answer: direction (degrees), distance, colour (render-time). */
const sparks = (): readonly Spark[] => [
  { angle: -168, distance: 58, color: LB.skyDeep, size: 6 },
  { angle: -140, distance: 46, color: LB.peachDeep, size: 7 },
  { angle: -110, distance: 30, color: LB.lavenderDeep, size: 6 },
  { angle: -72, distance: 28, color: LB.mintDeep, size: 7 },
  { angle: -40, distance: 40, color: LB.blushDeep, size: 5 },
  { angle: 160, distance: 52, color: LB.lavenderDeep, size: 5 },
  { angle: 120, distance: 26, color: LB.peachDeep, size: 5 },
];

type Props = {
  verdict: VerdictKey;
  label: string;
  /** It arrived just now: animate it. */
  fresh: boolean;
};

export function VerdictTag({ verdict, label, fresh }: Props) {
  const reduced = useReducedMotion();
  const animate = fresh && !reduced;
  const right = verdict === 'correct';
  const shown = useSharedValue(animate ? 0 : 1);
  const drawn = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    shown.value = withTiming(1, {
      duration: right ? DURATION.gentle : DURATION.base,
      easing: right ? EASE.celebrate : EASE.standard,
    });
    if (right)
      drawn.value = withDelay(
        DURATION.quick,
        withTiming(1, { duration: DURATION.base, easing: EASE.standard }),
      );
  }, [animate, right, shown, drawn]);

  const chip = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.4),
    transform: [{ scale: right ? 0.7 + shown.value * 0.3 : 0.94 + shown.value * 0.06 }],
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - drawn.value),
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {right && animate ? <Celebration /> : null}
      <Animated.View
        accessibilityRole="text"
        accessibilityLabel={label}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: verdictBg()[verdict],
            borderRadius: 999,
            paddingLeft: right ? 10 : 14,
            paddingRight: 14,
            paddingVertical: 5,
          },
          chip,
        ]}
      >
        {right ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Svg width={15} height={15} viewBox="0 0 24 24">
              <AnimatedPath
                d="M5 12l5 5 9-10"
                fill="none"
                stroke={verdictText().correct}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${CHECK_LENGTH} ${CHECK_LENGTH}`}
                animatedProps={checkProps}
              />
            </Svg>
          </View>
        ) : null}
        <Text
          style={{
            color: verdictText()[verdict],
            fontSize: 14,
            lineHeight: 19,
            fontWeight: '600',
            letterSpacing: 0.1,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

/** The soft glow and the few drifting dots behind a right answer (decorative). */
function Celebration() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) });
  }, [t]);
  // A soft mint light that swells and fades, and a thin ring that breathes outwards.
  const glow = useAnimatedStyle(() => ({
    opacity: t.value < 0.2 ? t.value * 2 : Math.max(0, 0.4 * (1 - (t.value - 0.2) / 0.8)),
    transform: [{ scaleX: 0.9 + t.value * 0.12 }, { scaleY: 0.9 + t.value * 0.35 }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: Math.max(0, 0.7 * (1 - t.value)),
    transform: [{ scaleX: 1 + t.value * 0.14 }, { scaleY: 1 + t.value * 0.6 }],
  }));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -3,
            bottom: -3,
            left: -6,
            right: -6,
            borderRadius: 999,
            backgroundColor: LB.mintDeep,
          },
          glow,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: LB.success,
          },
          ring,
        ]}
      />
      {sparks().map((s, i) => (
        <Spark key={i} {...s} progress={t} />
      ))}
    </View>
  );
}

function Spark({
  angle,
  distance,
  color,
  size,
  progress,
}: Spark & { progress: { value: number } }) {
  const rad = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85),
      transform: [
        { translateX: Math.cos(rad) * distance * p },
        { translateY: Math.sin(rad) * distance * p },
        { scale: 1 - p * 0.4 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** Her answer that was not right yet: one small, soft shake when the judgement arrives. */
export function Nudge({ active, children }: { active: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) return;
    const step = { duration: 70, easing: EASE.standard };
    // Only towards the middle of the screen: her bubble sits at the right edge.
    x.value = withSequence(
      withTiming(-7, step),
      withTiming(0, step),
      withTiming(-4, step),
      withTiming(0, step),
      withTiming(-2, step),
      withTiming(0, step),
    );
  }, [active, reduced, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[{ maxWidth: '86%' }, style]}>{children}</Animated.View>;
}
