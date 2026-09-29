// Signature "punkte" (prototype round 1, variant 4 "Drei Punkte"; maths:
// lib/buddy/signatures/punkte.ts): three small violet pearls, each with its soft white light
// and a glint, that circle, gather, line up and speak. A dot passes behind the glass and in
// front of it; which one lies on top follows the prototype's node order (core.ts
// placeNodes). Drawn with the prototype's colours; a chat avatar draws the same dots at the
// same scale with fewer sparkles, the smallest orb none (punkteDetail).
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import type { NodeOrder } from '../../../lib/buddy/signatures/core.js';
import {
  PUNKTE,
  PUNKTE_BURST,
  PUNKTE_DOTS,
  punkteDetail,
  type PunktePose,
} from '../../../lib/buddy/signatures/punkte.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { Burst, LAYER, OrbStage, centered, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

/** A dot is drawn at twice its size (its light: radius 11) and only ever scaled down. */
const MAX = 2;
const LIGHT = 11;

export function PunkteSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => punkteDetail(size), [size]);
  const { pose, fade, order } = useSignature(PUNKTE, state, level, live, detail);
  const burst = useBurst(state, live && detail.sparkles > 0, PUNKTE.settle);
  const layer = { pose, fade, order, u, size };
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      back={detail.dots ? <Dots side="back" {...layer} /> : null}
      front={
        <>
          {detail.dots ? <Dots side="front" {...layer} /> : null}
          {burst ? (
            <Burst
              pose={pose}
              u={u}
              size={size}
              count={detail.sparkles}
              seed={41}
              spot={PUNKTE_BURST}
            />
          ) : null}
        </>
      }
    />
  );
}

type LayerProps = {
  side: 'front' | 'back';
  pose: SharedValue<PunktePose>;
  fade: SharedValue<number>;
  /** Which dot lies on top (the prototype's node order). */
  order: SharedValue<NodeOrder>;
  /** Pixels per signature unit. */
  u: number;
  size: number;
};

/** The dots on one side of the glass. */
function Dots(layer: LayerProps) {
  return (
    <View pointerEvents="none" style={[LAYER, { width: layer.size, height: layer.size }]}>
      {Array.from({ length: PUNKTE_DOTS }, (_, i) => (
        <Dot key={i} index={i} {...layer} />
      ))}
    </View>
  );
}

function Dot({ index, side, pose, fade, order, u, size }: LayerProps & { index: number }) {
  const id = useSvgId('dot');
  const box = LIGHT * 2 * MAX * u;
  const front = side === 'front';
  const style = useAnimatedStyle(() => {
    const d = pose.value.dots;
    const o = index * 5;
    const z = d[o + 2] ?? 0;
    const here = d.length > o && (front ? z >= 0 : z < 0);
    return {
      opacity: here ? fade.value : 0,
      zIndex: order.value.seq[index] ?? 0,
      transform: [
        { translateX: (d[o] ?? 0) * u },
        { translateY: (d[o + 1] ?? 0) * u },
        { scale: Math.max(0, d[o + 3] ?? 0) / MAX },
      ],
    };
  });
  const light = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, pose.value.dots[index * 5 + 4] ?? 0)),
  }));
  const view = `${-LIGHT} ${-LIGHT} ${LIGHT * 2} ${LIGHT * 2}`;
  return (
    <Animated.View style={[centered(size, box), style]}>
      <Animated.View style={[LAYER, { width: box, height: box }, light]}>
        <Svg width={box} height={box} viewBox={view}>
          <Defs>
            <RadialGradient id={`${id}light`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle r={LIGHT} fill={`url(#${id}light)`} />
        </Svg>
      </Animated.View>
      <Svg width={box} height={box} viewBox={view} style={LAYER}>
        <Defs>
          <RadialGradient id={`${id}pearl`} cx="0.36" cy="0.32" r="0.75">
            <Stop offset="0" stopColor="#d9ccff" />
            <Stop offset="0.55" stopColor="#9a80f2" />
            <Stop offset="1" stopColor="#6a48d7" />
          </RadialGradient>
        </Defs>
        <Circle r={5.6} fill={`url(#${id}pearl)`} />
        <Circle cx={-1.8} cy={-1.9} r={1.5} fill="#ffffff" fillOpacity={0.9} />
      </Svg>
    </Animated.View>
  );
}
