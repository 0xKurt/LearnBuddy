// Skeleton loading (design components/core/States.jsx `Skel`): quiet shapes in the real layout
// instead of a spinner in an empty screen — canvas-coloured bones that pulse softly, all in one
// <SkeletonGroup> in step. Purely decorative: the group is one element for a screen reader that
// says what is loading (`label`). Reduce motion: the bones stand still.

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { View, type DimensionValue, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { read } from '../../lib/sharedRead.js';
import { UI } from '../../lib/theme/components.js';
import { ACTIVE_MOTION, useMotionReduced } from '../../lib/theme/motion.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { CARD_PAD } from '../../lib/theme/space.js';
import { SKELETON } from '../../lib/theme/states.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Appear } from './Motion.js';

/** 0 at rest, 1 at the pulse's low point; null while nothing moves. */
const Pulse = createContext<SharedValue<number> | null>(null);

type GroupProps = {
  /** What is loading, for a screen reader ("Ich hole deine Fragen …"). */
  label: string;
  children: ReactNode;
  style?: ViewStyle;
};

export function SkeletonGroup({ label, children, style }: GroupProps) {
  const pulse = useSharedValue(0);
  const reduced = useMotionReduced();
  useEffect(() => {
    if (reduced) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    // `lb-pulse`: down in half the time, back up in the other half, for as long as it loads.
    pulse.value = withRepeat(
      withTiming(1, {
        duration: SKELETON.pulseMs / 2,
        easing: Easing.bezier(...SKELETON.pulseEase),
        ...ACTIVE_MOTION,
      }),
      -1,
      true,
      undefined,
      ACTIVE_MOTION.reduceMotion,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  return (
    <Pulse.Provider value={reduced ? null : pulse}>
      <Appear
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        style={{ flex: style?.flex }}
      >
        {/* The layout belongs to the element that holds the bones: its gap and its room reach
            them (on the element around it they reached one child, and nothing stood apart). */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={style}
        >
          {children}
        </View>
      </Appear>
    </Pulse.Provider>
  );
}

type BoneProps = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  /**
   * `canvas` is a bone (States.jsx:9). `selected` stands for a bubble of hers (:21), `paper` for
   * an answer she can pick (:27) or the input bar: paper with a hairline.
   */
  tone?: 'canvas' | 'selected' | 'paper';
  style?: ViewStyle;
};

/** One placeholder block. */
export function Bone({
  width = '100%',
  height,
  radius = SKELETON.radius,
  tone = 'canvas',
  style,
}: BoneProps) {
  const { palette } = useTheme();
  const pulse = useContext(Pulse);
  const beat = useAnimatedStyle(
    // The pulse starts at 0: no blocking read across threads while the bones mount (#637).
    () => ({ opacity: pulse ? 1 - read(pulse, 0) * (1 - SKELETON.pulseLow) : 1 }),
    [pulse],
  );
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius },
        tone === 'paper'
          ? {
              backgroundColor: palette.paper,
              borderWidth: UI.border,
              borderColor: palette.hairline,
            }
          : { backgroundColor: tone === 'selected' ? palette.primaryLt : palette.canvas },
        style,
        beat,
      ]}
    />
  );
}

/**
 * A bone in the box of the line of text it stands for: as tall as that text's line, the bone in
 * its middle — so what loads takes the room the words will take, and nothing jumps.
 */
export function BoneText({
  type,
  width,
  height = SKELETON.line.row,
}: {
  /** The type role the loaded text has (`TYPE.option`, `TYPE.meta` …). */
  type: TextStyle;
  width: DimensionValue;
  height?: number;
}) {
  return (
    <View style={{ height: type.lineHeight, justifyContent: 'center' }}>
      <Bone width={width} height={height} />
    </View>
  );
}

/** A few lines of text, the last one shorter. */
export function BoneLines({
  lines = 3,
  height = SKELETON.line.row,
  gap = SKELETON.lineGap,
  last = SKELETON.width.short,
}: {
  lines?: number;
  height?: number;
  gap?: number;
  last?: DimensionValue;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} height={height} width={i === lines - 1 ? last : '100%'} />
      ))}
    </View>
  );
}

/**
 * The paper card bones stand on (States.jsx:14): the app's card — paper, its corner, the soft
 * shadow, no line around it. `padding` 0 for a card of rows, which bring their own.
 */
export function BoneCard({
  children,
  padding = CARD_PAD.card,
  gap = SKELETON.cardGap,
  style,
}: {
  children: ReactNode;
  padding?: number;
  gap?: number;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: palette.paper, borderRadius: RADIUS.lg, padding, gap, ...SHADOW.soft },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The line between two rows of one card, as `ListGroup` draws it. */
export function BoneRule() {
  const { palette } = useTheme();
  return <View style={{ height: UI.border, backgroundColor: palette.hairline }} />;
}
