// Signature "mond" (the default, owner decision 2026-09-27; docs/DESIGN-BRIEF.md §Buddy's
// moon): a small pearl moon on a tilted orbit that passes in front of and behind the glass,
// with its white trail, the waiting ping, its reflection on the glass and the sparkle
// shower of "happy" — drawn with the prototype's colours and blurs (maths:
// lib/buddy/signatures/mond.ts). A chat avatar draws the same moon at the same scale with
// fewer trail dots and sparkles and no reflection; the smallest orb none (moonDetail).
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, RadialGradient, Stop } from 'react-native-svg';

import type { NodeOrder } from '../../../lib/buddy/signatures/core.js';
import {
  MOND,
  MOON_BURST,
  moonDetail,
  type MoonDetail,
  type MoonPose,
} from '../../../lib/buddy/signatures/mond.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { Blur, Burst, LAYER, OrbStage, centered, InSphere, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

// The prototype's colours: white light (trail, ping) — it reads on the pastel light behind
// Buddy and on his white halo, as on the prototype's stage.
const TRAIL = '#ffffff';
const PING = '#ffffff';

export function MondSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => moonDetail(size), [size]);
  const { pose, fade, order } = useSignature(MOND, state, level, live, detail);
  const burst = useBurst(state, live && detail.sparkles > 0, MOND.settle);
  const layer = { pose, fade, order, u, size };
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      back={detail.moon ? <MoonLayer side="back" {...layer} detail={detail} /> : null}
      overGlass={
        detail.reflection ? <Reflection pose={pose} fade={fade} u={u} size={size} /> : null
      }
      front={
        <>
          {detail.moon ? <MoonLayer side="front" {...layer} detail={detail} /> : null}
          {burst ? (
            <Burst
              pose={pose}
              u={u}
              size={size}
              count={detail.sparkles}
              seed={3}
              spot={MOON_BURST}
            />
          ) : null}
        </>
      }
    />
  );
}

type LayerProps = {
  side: 'front' | 'back';
  pose: SharedValue<MoonPose>;
  fade: SharedValue<number>;
  /** Which part lies on top (the prototype's node order). */
  order: SharedValue<NodeOrder>;
  /** Pixels per moon unit. */
  u: number;
  size: number;
};

/**
 * Everything of the moon on one side of the glass; which part lies on top follows the
 * prototype's node order (placeOrder).
 */
function MoonLayer({ detail, ...layer }: LayerProps & { detail: MoonDetail }) {
  const ghosts = Array.from({ length: detail.ghosts }, (_, i) => i);
  return (
    <View pointerEvents="none" style={[LAYER, { width: layer.size, height: layer.size }]}>
      <Moon {...layer} />
      {detail.ping ? <Ping {...layer} /> : null}
      {ghosts.map((i) => (
        <Ghost key={i} index={i} {...layer} />
      ))}
    </View>
  );
}

function Moon({ side, pose, fade, order, u, size }: LayerProps) {
  const id = useSvgId('moon');
  const m = 44 * u;
  const front = side === 'front';
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const here = front ? p.z >= 0 : p.z < 0;
    return {
      opacity: here ? fade.value : 0,
      zIndex: order.value.seq[0] ?? 0,
      transform: [{ translateX: p.x * u }, { translateY: p.y * u }, { scale: p.scale }],
    };
  });
  const glowStyle = useAnimatedStyle(() => {
    const g = pose.value.glow;
    return {
      opacity: Math.min(1, Math.max(0, g)),
      transform: [{ scale: 0.8 + Math.min(1.3, Math.max(0, g)) * 0.4 }],
    };
  });
  return (
    <Animated.View style={[centered(size, m), style]}>
      <Animated.View style={[LAYER, { width: m, height: m }, glowStyle]}>
        <Svg width={m} height={m} viewBox="-22 -22 44 44">
          <Defs>
            <RadialGradient id={`${id}glow`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
              <Stop offset="0.3" stopColor="#fbeaff" stopOpacity={0.75} />
              <Stop offset="0.62" stopColor="#e6c9ff" stopOpacity={0.32} />
              <Stop offset="1" stopColor="#dcc4ff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle r={21} fill={`url(#${id}glow)`} />
        </Svg>
      </Animated.View>
      <Svg width={m} height={m} viewBox="-22 -22 44 44" style={LAYER}>
        <Defs>
          <RadialGradient id={`${id}pearl`} cx="0.36" cy="0.32" r="0.75">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="0.55" stopColor="#fdf0fa" />
            <Stop offset="1" stopColor="#d9c3fa" />
          </RadialGradient>
          <ClipPath id={`${id}clip`}>
            <Circle r={8.6} />
          </ClipPath>
          <Blur id={`${id}b1`} sd={1} />
        </Defs>
        <Circle r={8.6} fill={`url(#${id}pearl)`} />
        {/* The soft terminator: lit from the upper left like Buddy, so it reads as a moon. */}
        <G clipPath={`url(#${id}clip)`}>
          <Circle
            cx={5.2}
            cy={4.2}
            r={8.2}
            fill="#a98cf0"
            fillOpacity={0.5}
            filter={`url(#${id}b1)`}
          />
        </G>
        <Circle r={8.6} fill="none" stroke="#b89ff2" strokeOpacity={0.55} strokeWidth={0.8} />
        <Circle cx={-2.8} cy={-3} r={2.3} fill="#ffffff" fillOpacity={0.95} />
      </Svg>
    </Animated.View>
  );
}

function Ghost({ index, side, pose, fade, order, u, size }: LayerProps & { index: number }) {
  const d = 8.4 * u;
  const front = side === 'front';
  const style = useAnimatedStyle(() => {
    const g = pose.value.ghosts;
    const o = index * 5;
    const z = g[o + 2] ?? 0;
    const here = front ? z >= 0 : z < 0;
    return {
      opacity: here ? (g[o + 4] ?? 0) * fade.value : 0,
      zIndex: order.value.seq[index + 2] ?? 0,
      transform: [
        { translateX: (g[o] ?? 0) * u },
        { translateY: (g[o + 1] ?? 0) * u },
        { scale: (g[o + 3] ?? 0) / 4.2 },
      ],
    };
  });
  return (
    <Animated.View
      style={[centered(size, d), { borderRadius: d / 2, backgroundColor: TRAIL }, style]}
    />
  );
}

/** "Your turn": a thin white ring that leaves the waiting moon (a 1.6-unit line). */
function Ping({ side, pose, order, u, size }: LayerProps) {
  const line = 1.6;
  const front = side === 'front';
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const here = front ? p.z >= 0 : p.z < 0;
    // The ring grows; its line stays thin (the box grows, not a scale).
    const r = (p.pingR + line / 2) * u;
    return {
      opacity: here ? p.pingOp : 0,
      zIndex: order.value.seq[1] ?? 0,
      left: size / 2 + p.x * u - r,
      top: size / 2 + p.y * u - r,
      width: r * 2,
      height: r * 2,
      borderRadius: r,
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', borderWidth: line * u, borderColor: PING }, style]}
    />
  );
}

/** The moon's light on the glass when it passes close (large orbs). */
function Reflection({ pose, fade, u, size }: Omit<LayerProps, 'side' | 'order'>) {
  const id = useSvgId('refl');
  const r = 54 * u;
  const E = 14;
  const box = E * 2 * u;
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    return {
      opacity: Math.min(1, p.reflOp) * fade.value,
      transform: [
        { translateX: p.reflX * u },
        { translateY: p.reflY * u },
        { rotate: `${p.reflRot}deg` },
      ],
    };
  });
  return (
    <InSphere size={size} u={u}>
      <Animated.View style={[centered(r * 2, box), style]}>
        <Svg width={box} height={box} viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}>
          <Defs>
            <Blur id={id} sd={2.2} />
          </Defs>
          <Ellipse rx={6} ry={4} fill="#ffffff" filter={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </InSphere>
  );
}
