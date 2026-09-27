// Buddy in talk mode: one orb, four clearly different states, and soft
// cross-fades between them (never a jump):
//   idle       it breathes slowly;
//   listening  it follows her voice (the sound bars inside, the halo swells);
//   thinking   a light ring swirls slowly around it, the orb shimmers;
//   speaking   it pulses in a speech-like rhythm and soft waves leave it.
// There is no audio level of Buddy's voice, so speaking is a calm rhythm, not
// lip sync. With reduce motion nothing moves: only the layers fade in and out.
// Tapping it (onPress) is how she interrupts him while he speaks.

import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';
import { DURATION, EASE } from '../../lib/theme/motion.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';

export type OrbMode = 'idle' | 'listening' | 'thinking' | 'speaking';
const MODES: readonly OrbMode[] = ['idle', 'listening', 'thinking', 'speaking'];

/** A spoken phrase: a few uneven beats, then a short rest (ms, scale). */
const RHYTHM: ReadonlyArray<[number, number]> = [
  [170, 1.05],
  [130, 1.015],
  [190, 1.06],
  [150, 1.02],
  [180, 1.045],
  [140, 1.01],
  [210, 1.05],
  [320, 1],
];

export function TalkOrb({
  mode,
  level,
  size = 200,
  onPress,
  pressLabel,
}: {
  mode: OrbMode;
  /** Her voice (0…1) while listening. */
  level: number;
  size?: number;
  /** Tapping Buddy (interrupts him while he speaks). */
  onPress?: () => void;
  pressLabel?: string;
}) {
  const reduce = useReducedMotion();
  const box = Math.round(size * 1.5);
  // How much of each state is on screen (0…1): the cross-fade between them.
  const w = {
    idle: useSharedValue(mode === 'idle' ? 1 : 0),
    listening: useSharedValue(mode === 'listening' ? 1 : 0),
    thinking: useSharedValue(mode === 'thinking' ? 1 : 0),
    speaking: useSharedValue(mode === 'speaking' ? 1 : 0),
  };
  useEffect(() => {
    for (const m of MODES)
      w[m].value = withTiming(m === mode ? 1 : 0, {
        duration: DURATION.gentle,
        easing: EASE.standard,
      });
    // The weights are stable shared values.
  }, [mode]);

  const breath = useLoop(reduce, (v) => {
    v.value = withRepeat(withTiming(1, { duration: 2100, easing: EASE.breathe }), -1, true);
  });
  const shimmer = useLoop(reduce, (v) => {
    v.value = withRepeat(withTiming(1, { duration: 800, easing: EASE.breathe }), -1, true);
  });
  const swirl = useLoop(reduce, (v) => {
    v.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.linear }), -1, false);
  });
  // How far above its size the orb is in the rhythm (0 = at rest).
  const rhythm = useLoop(reduce, (v) => {
    v.value = withRepeat(
      withSequence(
        ...RHYTHM.map(([ms, s]) => withTiming(s - 1, { duration: ms, easing: EASE.breathe })),
      ),
      -1,
    );
  });
  const waveA = useLoop(reduce, (v) => {
    v.value = withRepeat(withTiming(1, { duration: 2200, easing: EASE.standard }), -1, false);
  });
  const waveB = useLoop(reduce, (v) => {
    v.value = withDelay(
      1100,
      withRepeat(withTiming(1, { duration: 2200, easing: EASE.standard }), -1, false),
    );
  });
  const voice = useSharedValue(0);
  useEffect(() => {
    voice.value = reduce ? 0 : withSpring(level, { damping: 16, stiffness: 220 });
  }, [level, reduce, voice]);

  const orbStyle = useAnimatedStyle(() => {
    const scale =
      1 +
      w.idle.value * breath.value * 0.035 +
      w.listening.value * voice.value * 0.08 +
      w.thinking.value * (0.012 + shimmer.value * 0.022) +
      w.speaking.value * rhythm.value;
    return { transform: [{ scale }] };
  });
  const haloStyle = useAnimatedStyle(() => ({
    opacity:
      0.45 * w.idle.value +
      (0.55 + voice.value * 0.4) * w.listening.value +
      0.3 * w.thinking.value +
      0.6 * w.speaking.value,
    transform: [
      {
        scale:
          0.86 +
          w.idle.value * breath.value * 0.05 +
          w.listening.value * (0.04 + voice.value * 0.22) +
          w.speaking.value * rhythm.value * 1.6,
      },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: w.thinking.value,
    transform: [{ rotate: `${swirl.value * 360}deg` }],
  }));
  const wave = (v: SharedValue<number>) => () => {
    'worklet';
    return {
      opacity: w.speaking.value * (1 - v.value) * 0.5,
      transform: [{ scale: 1 + v.value * 0.45 }],
    };
  };
  const waveAStyle = useAnimatedStyle(wave(waveA));
  const waveBStyle = useAnimatedStyle(wave(waveB));

  const ids = useSvgId('t');
  const layer = {
    position: 'absolute' as const,
    left: (box - size) / 2,
    top: (box - size) / 2,
    width: size,
    height: size,
  };
  const orb = (
    <View style={{ width: box, height: box }}>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: 0, top: 0, width: box, height: box }, haloStyle]}
      >
        <Svg width={box} height={box}>
          <Defs>
            <RadialGradient id={`${ids}halo`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.45" stopColor={LB.lavenderDeep} stopOpacity={0.9} />
              <Stop offset="0.7" stopColor={LB.peachDeep} stopOpacity={0.35} />
              <Stop offset="1" stopColor={LB.skyDeep} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={box / 2} cy={box / 2} r={box / 2} fill={`url(#${ids}halo)`} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[layer, waveAStyle]}>
        <Ring size={size} color={LB.lavenderDeep} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[layer, waveBStyle]}>
        <Ring size={size} color={LB.peachDeep} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: (box - size) / 2 - 12,
            top: (box - size) / 2 - 12,
            width: size + 24,
            height: size + 24,
          },
          ringStyle,
        ]}
      >
        <Svg width={size + 24} height={size + 24}>
          <Defs>
            <LinearGradient id={`${ids}swirl`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={LB.primary} stopOpacity={0.75} />
              <Stop offset="0.6" stopColor={LB.peachDeep} stopOpacity={0.4} />
              <Stop offset="1" stopColor={LB.skyDeep} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={(size + 24) / 2}
            cy={(size + 24) / 2}
            r={size / 2 + 6}
            fill="none"
            stroke={`url(#${ids}swirl)`}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${Math.PI * (size + 12) * 0.42} ${Math.PI * (size + 12)}`}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[layer, orbStyle]}>
        <BuddyOrb
          size={size}
          listening={mode === 'listening'}
          level={level}
          breathe={false}
          reactToTap={false}
        />
      </Animated.View>
    </View>
  );
  if (!onPress) return orb;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={pressLabel} onPress={onPress}>
      {({ pressed }) => <View style={{ transform: [{ scale: pressed ? 0.97 : 1 }] }}>{orb}</View>}
    </Pressable>
  );
}

function Ring({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 2}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
    </Svg>
  );
}

/** A looping value (0…1) that runs unless reduce motion is on. */
function useLoop(reduce: boolean, start: (v: SharedValue<number>) => void): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(v);
      v.value = 0;
      return;
    }
    start(v);
    return () => cancelAnimation(v);
    // `start` is a fixed description of the loop.
  }, [reduce, v]);
  return v;
}
