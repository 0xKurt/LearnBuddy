// Signature "ring" (prototype round 1, variant 2 "Ring"; maths: lib/buddy/signatures/ring.ts):
// a narrow tilted band of light round the orb — white glow, a white → lilac → pink → white
// line, waves of light while speaking — its shadow on the glass, and one or two glints
// running along it. Drawn with the prototype's colours and blurs.
//
// Where the band passes the glass (fixed against the prototype, owner 2026-09-29: "der mit
// dem Saturnring hat einen Farbfehler … eine scharfe Kante links und rechts im Ring"): the
// prototype drew the whole band behind the glass and its near half a second time in front,
// cut straight along the band's axis. Outside the glass both copies lay on top of each other,
// so the near half shone brighter than the far half, with a hard step where the cut crossed
// the band at its left and right ends. Here the band is drawn once, behind the glass, and the
// near half again only where the glass covers it (clipped to the glass's outline, which
// breathes with it): the only seam is the glass's own edge.
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { starPath } from '../../../lib/buddy/signatures/core.js';
import { RING, RING_BURST, ringDetail, type RingPose } from '../../../lib/buddy/signatures/ring.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { Blur, Burst, InSphere, LAYER, OrbStage, centered, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** Half the band's box, in signature units: its widest wave (rx 91 × 1.32) plus its glow. */
const E = 136;

export function RingSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => ringDetail(size), [size]);
  const { pose, fade } = useSignature(RING, state, level, live, detail);
  const burst = useBurst(state, live && detail.sparkles > 0, RING.settle);
  const parts = { pose, fade, u, size };
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      back={
        detail.ring ? (
          <View pointerEvents="none" style={[LAYER, { width: size, height: size }]}>
            <Band {...parts} near={false} />
            <Glint {...parts} index={0} front={false} />
            <Glint {...parts} index={1} front={false} />
          </View>
        ) : null
      }
      inside={detail.ring ? <BandShadow {...parts} /> : null}
      overGlass={detail.ring ? <NearHalf {...parts} bob={bob} /> : null}
      front={
        <>
          {detail.ring ? (
            <View pointerEvents="none" style={[LAYER, { width: size, height: size }]}>
              <Glint {...parts} index={0} front />
              <Glint {...parts} index={1} front />
            </View>
          ) : null}
          {burst ? (
            <Burst
              pose={pose}
              u={u}
              size={size}
              count={detail.sparkles}
              seed={11}
              spot={RING_BURST}
            />
          ) : null}
        </>
      }
    />
  );
}

type PartProps = {
  pose: SharedValue<RingPose>;
  fade: SharedValue<number>;
  u: number;
  size: number;
};

/**
 * The band in its tilted frame: glow, line and the two speaking waves. `near` draws only
 * its near half (the prototype's clip: y ≥ 0 in the band's frame).
 */
function Band({ pose, fade, u, size, near }: PartProps & { near: boolean }) {
  const id = useSvgId('ring');
  const box = E * 2 * u;
  const frame = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ rotate: `${pose.value.tilt}deg` }],
  }));
  const glow = useAnimatedProps(() => {
    const p = pose.value;
    return { rx: p.rx, ry: p.ry, strokeWidth: p.sw * 2.6, opacity: p.bright * 0.55 };
  });
  const line = useAnimatedProps(() => {
    const p = pose.value;
    return { rx: p.rx, ry: p.ry, strokeWidth: p.sw, opacity: p.bright };
  });
  const wave0 = useAnimatedProps(() => {
    const e = pose.value.echoes;
    return { rx: e[0] ?? 0, ry: e[1] ?? 0, strokeWidth: e[2] ?? 0, opacity: e[3] ?? 0 };
  });
  const wave1 = useAnimatedProps(() => {
    const e = pose.value.echoes;
    return { rx: e[4] ?? 0, ry: e[5] ?? 0, strokeWidth: e[6] ?? 0, opacity: e[7] ?? 0 };
  });
  return (
    <Animated.View pointerEvents="none" style={[centered(size, box), frame]}>
      <Svg width={box} height={box} viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}>
        <Defs>
          <LinearGradient
            id={`${id}line`}
            gradientUnits="userSpaceOnUse"
            x1={-90}
            y1={0}
            x2={90}
            y2={0}
          >
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="0.3" stopColor="#d6c6ff" />
            <Stop offset="0.68" stopColor="#ffbfdf" />
            <Stop offset="1" stopColor="#ffffff" />
          </LinearGradient>
          <Blur id={`${id}b`} sd={2.2} />
          <ClipPath id={`${id}near`}>
            <Rect x={-140} y={0} width={280} height={140} />
          </ClipPath>
        </Defs>
        <G clipPath={near ? `url(#${id}near)` : undefined}>
          <AnimatedEllipse
            fill="none"
            stroke="#ffffff"
            filter={`url(#${id}b)`}
            animatedProps={glow}
          />
          <AnimatedEllipse fill="none" stroke={`url(#${id}line)`} animatedProps={line} />
          <AnimatedEllipse fill="none" stroke="#ffffff" animatedProps={wave0} />
          <AnimatedEllipse fill="none" stroke="#ffffff" animatedProps={wave1} />
        </G>
      </Svg>
    </Animated.View>
  );
}

/**
 * The near half of the band where it lies over the glass: clipped to the glass's outline
 * (this layer breathes with the glass), the band itself kept at its own size.
 */
function NearHalf({ bob, ...parts }: PartProps & { bob: SharedValue<number> }) {
  const { pose, size, u } = parts;
  const r = 54 * u;
  const steady = useAnimatedStyle(() => ({
    transform: [{ scale: 1 / (pose.value.orb * bob.value) }],
  }));
  return (
    <InSphere size={size} u={u}>
      <Animated.View
        style={[
          { position: 'absolute', left: r - size / 2, top: r - size / 2 },
          { width: size, height: size },
          steady,
        ]}
      >
        <Band {...parts} near />
      </Animated.View>
    </InSphere>
  );
}

/** The band's violet shadow on the glass (its near half, a little down and right). */
function BandShadow({ pose, fade, u }: Omit<PartProps, 'size'>) {
  const id = useSvgId('rsh');
  const box = E * 2 * u;
  const r = 54 * u;
  const frame = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: 3 * u }, { translateY: 5 * u }, { rotate: `${pose.value.tilt}deg` }],
  }));
  const shade = useAnimatedProps(() => {
    const p = pose.value;
    return { rx: p.rx, ry: p.ry, strokeWidth: p.sw * 1.4 };
  });
  return (
    <Animated.View pointerEvents="none" style={[centered(r * 2, box), frame]}>
      <Svg width={box} height={box} viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}>
        <Defs>
          <Blur id={`${id}b`} sd={2.2} />
          <ClipPath id={`${id}near`}>
            <Rect x={-140} y={0} width={280} height={140} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${id}near)`}>
          <AnimatedEllipse
            fill="none"
            stroke="#5a3cc0"
            strokeOpacity={0.22}
            filter={`url(#${id}b)`}
            animatedProps={shade}
          />
        </G>
      </Svg>
    </Animated.View>
  );
}

/** A glint on the band: a soft white light with a four-pointed star, on its side of the glass. */
function Glint({
  pose,
  fade,
  u,
  size,
  index,
  front,
}: PartProps & { index: number; front: boolean }) {
  const id = useSvgId('gl');
  const G2 = 15;
  const box = G2 * 2 * u;
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const o = index * 6;
    const g = p.glints;
    const x = g[o] ?? 0;
    const y = g[o + 1] ?? 0;
    const here = front ? (g[o + 2] ?? 0) >= 0 : (g[o + 2] ?? 0) < 0;
    const a = (p.tilt * Math.PI) / 180;
    return {
      opacity: here ? (g[o + 5] ?? 0) * fade.value : 0,
      transform: [
        // The glint rides in the band's tilted frame; its own turn undoes the tilt.
        { translateX: (x * Math.cos(a) - y * Math.sin(a)) * u },
        { translateY: (x * Math.sin(a) + y * Math.cos(a)) * u },
        { rotate: `${(g[o + 3] ?? 0) + p.tilt}deg` },
        { scale: Math.max(0, g[o + 4] ?? 0) },
      ],
    };
  });
  return (
    <Animated.View style={[centered(size, box), style]}>
      <Svg width={box} height={box} viewBox={`${-G2} ${-G2} ${G2 * 2} ${G2 * 2}`}>
        <Defs>
          <Blur id={id} sd={2.2} />
        </Defs>
        <Circle r={7} fill="#ffffff" opacity={0.55} filter={`url(#${id})`} />
        <Path d={starPath(6.5, 0.18)} fill="#ffffff" />
      </Svg>
    </Animated.View>
  );
}
