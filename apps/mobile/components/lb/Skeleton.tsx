// Skeleton loading: soft placeholders shaped like what is coming (a card, a few lines,
// a bubble), with a slow light sweeping across them, instead of a spinner in an empty
// screen. Every block in one <SkeletonGroup> sweeps in step. Purely decorative: the
// group is one element for a screen reader that says what is loading (`label`).
// Reduce motion: the blocks stand still (no sweep).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { Appear } from './Motion.js';

/** One sweep across a block, then a short rest: slow enough to feel calm. */
const SWEEP_MS = 1400;
/** How wide the light is, relative to the block. */
const LIGHT = 0.7;

const Sweep = createContext<SharedValue<number> | null>(null);

type GroupProps = {
  /** What is loading, for a screen reader ("Ich hole deine Fragen …"). */
  label: string;
  children: ReactNode;
  style?: ViewStyle;
};

export function SkeletonGroup({ label, children, style }: GroupProps) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [reduced, progress]);
  return (
    <Sweep.Provider value={reduced ? null : progress}>
      <Appear
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        style={style}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {children}
        </View>
      </Appear>
    </Sweep.Provider>
  );
}

type BoneProps = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  /** A darker or lighter base (on a pastel card, a white bone reads better). */
  tone?: 'lilac' | 'white';
  style?: ViewStyle;
};

/** One placeholder block. */
export function Bone({ width = '100%', height, radius = 10, tone = 'lilac', style }: BoneProps) {
  const progress = useContext(Sweep);
  const [w, setW] = useState(0);
  const id = useSvgId('sk');
  const light = w * LIGHT;
  const sweep = useAnimatedStyle(() => {
    if (!progress) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [{ translateX: interpolate(progress.value, [0, 1], [-light, w]) }],
    };
  }, [progress, w, light]);
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: tone === 'white' ? 'rgba(255,255,255,0.75)' : BONE,
        },
        style,
      ]}
    >
      {w > 0 && progress ? (
        <Animated.View
          style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: light }, sweep]}
        >
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.7} />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A few lines of text, the last one shorter. */
export function BoneLines({
  lines = 3,
  height = 12,
  gap = 9,
  last = '62%',
  tone,
}: {
  lines?: number;
  height?: number;
  gap?: number;
  last?: DimensionValue;
  tone?: BoneProps['tone'];
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Bone
          key={i}
          height={height}
          radius={height / 2}
          tone={tone}
          width={i === lines - 1 ? last : '100%'}
        />
      ))}
    </View>
  );
}

/** A white card on the page (the shape of a library or memory row). */
export function BoneCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: LB.paper,
          borderRadius: 22,
          padding: 18,
          gap: 12,
          borderWidth: 1,
          borderColor: LB.hairline,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The pale lilac of a placeholder: visible on white and on the page, never loud. */
const BONE = '#ece7f6';
