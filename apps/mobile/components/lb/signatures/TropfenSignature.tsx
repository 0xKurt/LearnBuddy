// Signature "tropfen" (prototype round 2, variant C "Tropfen"; maths:
// lib/buddy/signatures/tropfen.ts): the glass itself is a soft drop of jelly — its outline
// wobbles, leans, kneads and squashes (OrbStage's `shape`), it hops when something works and
// splashes colourful droplets on landing; while waiting a little drop of the same glass forms
// under it and falls. Drawn with the prototype's shapes, colours and blurs.
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Stop } from 'react-native-svg';

import { ORB_R, SPARK_COLS } from '../../../lib/buddy/signatures/core.js';
import {
  TROPFEN,
  TROPFEN_BURST,
  tropfenDetail,
  tropfenPath,
  type TropfenPose,
} from '../../../lib/buddy/signatures/tropfen.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { Burst, GlowFilter, OrbStage, type GlassShape, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export function TropfenSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => tropfenDetail(size), [size]);
  const { pose, fade } = useSignature(TROPFEN, state, level, live, detail);
  const burst = useBurst(state, live && detail.sparkles > 0, TROPFEN.settle);
  const shape = useDerivedValue<GlassShape>(() => {
    const p = pose.value;
    // The prototype lifts the squashed drop so that its bottom stays where it was.
    return {
      outline: tropfenPath(p.k),
      sx: p.sx,
      sy: p.sy,
      y: p.dy + (1 - p.sy) * ORB_R,
      shadowX: p.shadowX,
    };
  });
  const parts = { pose, fade, u, size };
  const front = burst ? (
    <>
      <Splash {...parts} count={detail.splash} />
      <Burst pose={pose} u={u} size={size} count={detail.sparkles} seed={31} spot={TROPFEN_BURST} />
    </>
  ) : null;
  if (!detail.jelly)
    return (
      <OrbStage
        size={size}
        u={u}
        base={pose}
        bob={bob}
        halo={halo ?? detail.halo}
        shadow={detail.shadow}
      />
    );
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      shape={shape}
      overGlass={<Drop {...parts} />}
      front={front}
    />
  );
}

type PartProps = {
  pose: SharedValue<TropfenPose>;
  fade: SharedValue<number>;
  u: number;
  size: number;
};

/** The drop's box (units): x −12…12, y 48…104 below the orb's centre (it falls to ≈ 96). */
const DROP_X = 12;
const DROP_TOP = 48;
const DROP_H = 56;

/** The little drop that forms under Buddy while waiting, drawn as the same glass. */
function Drop({ pose, fade, u, size }: PartProps) {
  const id = useSvgId('drop');
  const style = useAnimatedStyle(() => ({ opacity: pose.value.dropOp * fade.value }));
  const body = useAnimatedProps(() => {
    const p = pose.value;
    return { cy: p.dropY, rx: p.dropRx, ry: p.dropRy };
  });
  const shine = useAnimatedProps(() => {
    const p = pose.value;
    return { cx: p.hiX, cy: p.hiY, r: p.hiR };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: size / 2 - DROP_X * u,
          top: size / 2 + DROP_TOP * u,
          width: DROP_X * 2 * u,
          height: DROP_H * u,
        },
        style,
      ]}
    >
      <Svg
        width={DROP_X * 2 * u}
        height={DROP_H * u}
        viewBox={`${-DROP_X} ${DROP_TOP} ${DROP_X * 2} ${DROP_H}`}
      >
        <Defs>
          <LinearGradient id={`${id}fill`} x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#b5c7ff" />
            <Stop offset="0.5" stopColor="#cdb4fb" />
            <Stop offset="1" stopColor="#f2b6da" />
          </LinearGradient>
        </Defs>
        <AnimatedEllipse
          cx={0}
          fill={`url(#${id}fill)`}
          stroke="#ffffff"
          strokeOpacity={0.85}
          strokeWidth={0.6}
          animatedProps={body}
        />
        <AnimatedCircle fill="#ffffff" opacity={0.9} animatedProps={shine} />
      </Svg>
    </Animated.View>
  );
}

/** The splash's box (units): x −130…130, y −40…110 (the droplets fly up and out, then fall). */
const SPLASH_X = 130;
const SPLASH_TOP = -40;
const SPLASH_H = 150;

/** Colourful droplets that splash up and out when Buddy lands. */
function Splash({ pose, fade, u, size, count }: PartProps & { count: number }) {
  const id = useSvgId('splash');
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: size / 2 - SPLASH_X * u,
        top: size / 2 + SPLASH_TOP * u,
        width: SPLASH_X * 2 * u,
        height: SPLASH_H * u,
      }}
    >
      <Svg
        width={SPLASH_X * 2 * u}
        height={SPLASH_H * u}
        viewBox={`${-SPLASH_X} ${SPLASH_TOP} ${SPLASH_X * 2} ${SPLASH_H}`}
      >
        <Defs>
          <GlowFilter id={id} />
        </Defs>
        {Array.from({ length: count }, (_, i) => (
          <Droplet key={i} index={i} pose={pose} fade={fade} filter={`url(#${id})`} />
        ))}
      </Svg>
    </View>
  );
}

function Droplet({
  index,
  pose,
  fade,
  filter,
}: {
  index: number;
  pose: SharedValue<TropfenPose>;
  fade: SharedValue<number>;
  filter: string;
}) {
  const props = useAnimatedProps(() => {
    const s = pose.value.splash;
    const o = index * 4;
    const op = (s[o + 3] ?? 0) * fade.value;
    // Out of sight a droplet stays put (the maths lets it fall on without end).
    if (op <= 0) return { cx: 0, cy: 0, r: 0, opacity: 0 };
    return { cx: s[o] ?? 0, cy: s[o + 1] ?? 0, r: s[o + 2] ?? 0, opacity: op };
  });
  return (
    <AnimatedCircle
      fill={SPARK_COLS[index % 7] ?? '#ffffff'}
      filter={filter}
      animatedProps={props}
    />
  );
}
