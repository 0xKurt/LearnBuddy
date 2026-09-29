// Signature "stern" (prototype round 1, variant 5 "Funkelstern"; maths:
// lib/buddy/signatures/stern.ts): a white four-pointed star takes the place of the glass's
// highlight, with its soft light and a small diagonal cross; little stars trail it while
// thinking and leave it while speaking; a shimmer sweeps the glass while waiting. Drawn with
// the prototype's shapes and blurs. Everything lies in front of the glass, except the
// shimmer, which is in it.
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { starPath } from '../../../lib/buddy/signatures/core.js';
import {
  STERN,
  STERN_BURST,
  STERN_GHOSTS,
  STERN_MINIS,
  sternDetail,
  type SternPose,
} from '../../../lib/buddy/signatures/stern.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import {
  Blur,
  Burst,
  GlowFilter,
  LAYER,
  OrbStage,
  centered,
  type SignatureProps,
} from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

/** The star is drawn at its largest (rays 30 units) and only ever scaled down. */
const RAYS = 30;

export function SternSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => sternDetail(size), [size]);
  const { pose, fade } = useSignature(STERN, state, level, live, detail);
  const burst = useBurst(state, live && detail.sparkles > 0, STERN.settle);
  const parts = { pose, fade, u, size };
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      highlight={!detail.star}
      inside={detail.star ? <Sweep {...parts} /> : null}
      front={
        <>
          {detail.star ? (
            <View pointerEvents="none" style={[LAYER, { width: size, height: size }]}>
              {Array.from({ length: STERN_GHOSTS }, (_, i) => (
                <Ghost key={i} index={i} {...parts} />
              ))}
              {Array.from({ length: STERN_MINIS }, (_, i) => (
                <Mini key={i} index={i} {...parts} />
              ))}
              <Star {...parts} />
            </View>
          ) : null}
          {burst ? (
            <Burst
              pose={pose}
              u={u}
              size={size}
              count={detail.sparkles}
              seed={57}
              spot={STERN_BURST}
            />
          ) : null}
        </>
      }
    />
  );
}

type PartProps = {
  pose: SharedValue<SternPose>;
  fade: SharedValue<number>;
  u: number;
  size: number;
};

function Star({ pose, fade, u, size }: PartProps) {
  const id = useSvgId('stern');
  const box = RAYS * 2 * 1.05 * u;
  const place = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: pose.value.x * u }, { translateY: pose.value.y * u }],
  }));
  const light = useAnimatedStyle(() => {
    const p = pose.value;
    return { opacity: p.glowOp, transform: [{ scale: p.glowR / (RAYS * 1.05) }] };
  });
  const rays = useAnimatedStyle(() => {
    const p = pose.value;
    return { transform: [{ rotate: `${p.rot}deg` }, { scale: p.r / RAYS }] };
  });
  const cross = useAnimatedStyle(() => ({ opacity: pose.value.crossOp }));
  const view = `${-RAYS * 1.05} ${-RAYS * 1.05} ${RAYS * 2.1} ${RAYS * 2.1}`;
  return (
    <Animated.View style={[centered(size, box), place]}>
      <Animated.View style={[LAYER, { width: box, height: box }, light]}>
        <Svg width={box} height={box} viewBox={view}>
          <Defs>
            <RadialGradient id={`${id}glow`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
              <Stop offset="0.4" stopColor="#ffffff" stopOpacity={0.35} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle r={RAYS * 1.05} fill={`url(#${id}glow)`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[LAYER, { width: box, height: box }, rays]}>
        <Svg width={box} height={box} viewBox={view}>
          <Path d={starPath(RAYS, 0.13)} fill="#ffffff" />
        </Svg>
        <Animated.View style={[LAYER, { width: box, height: box }, cross]}>
          <Svg width={box} height={box} viewBox={view}>
            <G transform="rotate(45)">
              <Path d={starPath(RAYS * 0.42, 0.2)} fill="#ffffff" />
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** A little white star of the thinking trail (drawn at its largest, 6.5 units). */
function Ghost({ pose, fade, u, size, index }: PartProps & { index: number }) {
  const R = 6.5;
  const box = R * 2 * u;
  const style = useAnimatedStyle(() => {
    const g = pose.value.ghosts;
    const o = index * 5;
    return {
      opacity: (g[o + 4] ?? 0) * fade.value,
      transform: [
        { translateX: (g[o] ?? 0) * u },
        { translateY: (g[o + 1] ?? 0) * u },
        { rotate: `${g[o + 2] ?? 0}deg` },
        { scale: (g[o + 3] ?? 0) / R },
      ],
    };
  });
  return (
    <Animated.View style={[centered(size, box), style]}>
      <Svg width={box} height={box} viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}>
        <Path d={starPath(R, 0.2)} fill="#ffffff" />
      </Svg>
    </Animated.View>
  );
}

/** A little glowing star that leaves the speaking star (the prototype's unit star, glow .35). */
function Mini({ pose, fade, u, size, index }: PartProps & { index: number }) {
  const id = useSvgId('mini');
  // viewBox -2…2 around a unit star: one unit is 7 signature units at scale 1.
  const box = 28 * u;
  const style = useAnimatedStyle(() => {
    const m = pose.value.minis;
    const o = index * 4;
    return {
      opacity: fade.value,
      transform: [
        { translateX: (m[o] ?? 0) * u },
        { translateY: (m[o + 1] ?? 0) * u },
        { rotate: `${m[o + 2] ?? 0}deg` },
        { scale: (m[o + 3] ?? 0) / 7 },
      ],
    };
  });
  return (
    <Animated.View style={[centered(size, box), style]}>
      <Svg width={box} height={box} viewBox="-2 -2 4 4">
        <Defs>
          <GlowFilter id={id} />
        </Defs>
        <Path d={starPath(1, 0.2)} fill="#ffffff" filter={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** The waiting shimmer: a soft band of light that sweeps over the glass at 28°. */
function Sweep({ pose, fade, u }: PartProps) {
  const id = useSvgId('sweep');
  const r = 54 * u;
  // The band (52 × 160 units) and room for its blur.
  const W = 52 + 26;
  const H = 160 + 26;
  const style = useAnimatedStyle(() => ({
    opacity: pose.value.sweepOp * fade.value,
    transform: [{ rotate: '28deg' }, { translateX: pose.value.sweepX * u }],
  }));
  return (
    <Animated.View style={[centered(r * 2, W * u, H * u), style]}>
      <Svg width={W * u} height={H * u} viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}>
        <Defs>
          <LinearGradient id={`${id}fill`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
          <Blur id={`${id}b`} sd={4} />
        </Defs>
        <Rect
          x={-26}
          y={-80}
          width={52}
          height={160}
          fill={`url(#${id}fill)`}
          filter={`url(#${id}b)`}
        />
      </Svg>
    </Animated.View>
  );
}
