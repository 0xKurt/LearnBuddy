// Signature "polarlicht" (prototype round 2, variant D "Polarlicht"; maths:
// lib/buddy/signatures/polarlicht.ts): a curtain of northern lights round the orb — thin rays
// of mint, sky blue, lilac and pink standing on a tilted ellipse, each fading upwards from a
// paler foot, softly blurred; the rays behind the orb lie behind the glass, the ones in front
// over it. Drawn with the prototype's rays, gradients and blur.
//
// Two differences in how it is drawn, not in what is seen: each ray keeps its colour and
// stands where the prototype's curtain has that colour (native gradients cannot change
// colour per frame; polarlicht.ts polarPose), and the rays on one side of the glass lie in a
// fixed order — the prototype put a ray that crossed sides on top of its new side.
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import {
  POLAR,
  POLAR_BURST,
  polarColour,
  polarDetail,
  type PolarPose,
} from '../../../lib/buddy/signatures/polarlicht.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { Blur, Burst, OrbStage, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The curtain's box (units): x −105…105; y from −170 (the tallest ray of a blazing "happy"
 * on the far side) to 75 (the ellipse's lowest point), plus its blur.
 */
const X = 105;
const TOP = -170;
const H = 245;

export function PolarlichtSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => polarDetail(size), [size]);
  const { pose, fade } = useSignature(POLAR, state, level, live, detail);
  const burst = useBurst(state, live && detail.sparkles > 0, POLAR.settle);
  const parts = { pose, fade, u, size, rays: detail.rays, width: detail.width };
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      back={detail.aurora ? <Curtain {...parts} front={false} /> : null}
      front={
        <>
          {detail.aurora ? <Curtain {...parts} front /> : null}
          {burst ? (
            <Burst
              pose={pose}
              u={u}
              size={size}
              count={detail.sparkles}
              seed={71}
              spot={POLAR_BURST}
            />
          ) : null}
        </>
      }
    />
  );
}

type CurtainProps = {
  pose: SharedValue<PolarPose>;
  fade: SharedValue<number>;
  u: number;
  size: number;
  rays: number;
  width: number;
  /** Which side of the glass this half of the curtain is. */
  front: boolean;
};

const rgb = (c: [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;

/** The rays on one side of the glass, each with its own gradient, blurred together. */
function Curtain({ pose, fade, u, size, rays, width, front }: CurtainProps) {
  const id = useSvgId(front ? 'auf' : 'aub');
  const paints = useMemo(
    () =>
      Array.from({ length: rays }, (_, m) => ({
        foot: rgb(polarColour(m / rays, 0.55)),
        col: rgb(polarColour(m / rays, 0)),
      })),
    [rays],
  );
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: size / 2 - X * u,
        top: size / 2 + TOP * u,
        width: X * 2 * u,
        height: H * u,
      }}
    >
      <Svg width={X * 2 * u} height={H * u} viewBox={`${-X} ${TOP} ${X * 2} ${H}`}>
        <Defs>
          {paints.map((p, m) => (
            <LinearGradient key={m} id={`${id}r${m}`} x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={p.foot} stopOpacity={1} />
              <Stop offset="0.18" stopColor={p.col} stopOpacity={1} />
              <Stop offset="1" stopColor={p.col} stopOpacity={0} />
            </LinearGradient>
          ))}
          <Blur id={`${id}b`} sd={1.5} />
        </Defs>
        <G filter={`url(#${id}b)`}>
          {paints.map((_, m) => (
            <Ray
              key={m}
              index={m}
              pose={pose}
              fade={fade}
              width={width}
              front={front}
              fill={`url(#${id}r${m})`}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}

/** One ray: a thin upright strip from its foot, shown on the side of the glass it is on. */
function Ray({
  index,
  pose,
  fade,
  width,
  front,
  fill,
}: {
  index: number;
  pose: SharedValue<PolarPose>;
  fade: SharedValue<number>;
  width: number;
  front: boolean;
  fill: string;
}) {
  const props = useAnimatedProps(() => {
    const p = pose.value;
    const o = index * 4;
    const z = p.rays[o + 3] ?? 0;
    if (front ? z < 0 : z >= 0) return { d: 'M0 0', opacity: 0 };
    const x = p.rays[o] ?? 0;
    const y = p.rays[o + 1] ?? 0;
    const h = p.rays[o + 2] ?? 0;
    const f = (n: number): number => Math.round(n * 100) / 100;
    const l = f(x - width / 2);
    const r = f(x + width / 2);
    return {
      d: `M${l} ${f(y)}L${r} ${f(y)}L${r} ${f(y - h)}L${l} ${f(y - h)}Z`,
      opacity: p.bright * fade.value,
    };
  });
  return <AnimatedPath fill={fill} animatedProps={props} />;
}
