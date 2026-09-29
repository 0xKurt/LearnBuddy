// What every Buddy signature is drawn on (docs/DESIGN-BRIEF.md §Buddy's signature): the
// pastel glass orb (blue → lilac → pink, lit from the upper left), its white halo, its soft
// violet shadow and the sparkle shower of "happy" — exactly as the prototype's shared `Orb`
// class draws them. A signature (MondSignature.tsx, RingSignature.tsx, …) hands its own
// parts to OrbStage in four layers, as the prototype's SVG groups:
//   back       behind the glass;
//   inside     in the glass, under its shine (clipped to the sphere, breathes with it);
//   overGlass  on the glass (breathes with it), e.g. a reflection;
//   front      in front of the glass, and the sparkle shower on top.
// A signature can also deform the glass itself (`shape`, the prototype's Tropfen): its
// outline, squash and lift per frame. Without `shape` the glass is the round sphere, drawn
// exactly as before.
import type { ReactNode } from 'react';
import { useState } from 'react';
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
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  Filter,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import {
  BURST_COLS,
  ORB_R,
  burstPose,
  sparkles,
  starPath,
  type BasePose,
  type BurstSpot,
  type OrbState,
  type Sparkle,
} from '../../../lib/buddy/signatures/core.js';
import { LB } from '../../../lib/theme/colors.js';
import { useSvgId } from '../../../lib/theme/svgId.js';

/** The orb's radius as a share of its box (a thin margin for the rim). */
export const FILL = 0.48;
/** Half the glass's viewBox, in signature units. */
const VIEW = ORB_R / (2 * FILL);

/** What BuddyOrb hands every signature. */
export type SignatureProps = {
  /** What Buddy is doing (lib/buddy/signatures/core.ts). */
  state: OrbState;
  /** How loud she is (0…1). */
  level: number;
  /** Moving (off: reduce motion or an older avatar — still poses, cross-faded). */
  live: boolean;
  size: number;
  /** Pixels per signature unit. */
  u: number;
  /** The gentle bob of a tapped orb (scales the glass). */
  bob: SharedValue<number>;
  /** The white halo (undefined: large orbs, as the prototype). */
  halo: boolean | undefined;
};

/** An absolutely placed box of `w` × `h` px, centred on the orb. */
export function centered(size: number, w: number, h: number = w) {
  return {
    position: 'absolute' as const,
    left: (size - w) / 2,
    top: (size - h) / 2,
    width: w,
    height: h,
  };
}

export const LAYER = { position: 'absolute' as const, left: 0, top: 0 };

/** A Gaussian blur filter (stdDeviation in the drawing's units), as the prototype's. */
export function Blur({ id, sd }: { id: string; sd: number }) {
  return (
    <Filter id={id} x="-80%" y="-80%" width="260%" height="260%">
      <FeGaussianBlur stdDeviation={sd} />
    </Filter>
  );
}

/** The prototype's glow: a soft blur under the sharp shape. */
export function GlowFilter({ id, sd = 0.35 }: { id: string; sd?: number }) {
  return (
    <Filter id={id} x="-100%" y="-100%" width="300%" height="300%">
      <FeGaussianBlur in="SourceGraphic" stdDeviation={sd} result="b" />
      <FeMerge>
        <FeMergeNode in="b" />
        <FeMergeNode in="SourceGraphic" />
      </FeMerge>
    </Filter>
  );
}

/**
 * A glass that is not a rigid sphere (the prototype's Tropfen: `bodyXf`, the clip path and
 * the three body circles ×1.35, no depth, edge and rim on the outline).
 */
export type GlassShape = {
  /** Its outline (SVG path, signature units round the orb's centre). */
  outline: string;
  /** Squash: horizontal and vertical scale round the orb's centre. */
  sx: number;
  sy: number;
  /** How far it is moved down (units; up is negative), before the squash. */
  y: number;
  /** The shadow's horizontal scale (it narrows while the glass is in the air). */
  shadowX: number;
};

/** A signature's own parts inside the round glass, or a glass of its own shape (not both). */
type GlassLayers =
  | { shape?: undefined; inside?: ReactNode }
  | { shape: SharedValue<GlassShape>; inside?: undefined };

/**
 * The shared orb: halo, shadow, the signature's back layer, the breathing glass (with the
 * signature's inside and on-glass layers, or deformed by `shape`), the front layer.
 */
export function OrbStage<P extends BasePose>({
  size,
  u,
  base,
  bob,
  halo,
  shadow,
  highlight = true,
  back,
  inside,
  overGlass,
  front,
  shape,
}: GlassLayers & {
  size: number;
  u: number;
  base: SharedValue<P>;
  bob: SharedValue<number>;
  halo: boolean;
  shadow: boolean;
  /** The glass's white highlight at the upper left (a signature can take its place). */
  highlight?: boolean;
  back?: ReactNode;
  overGlass?: ReactNode;
  front?: ReactNode;
}) {
  const bodyStyle = useAnimatedStyle(() => {
    const scale = base.value.orb * bob.value;
    const g = shape?.value;
    if (!g) return { transform: [{ scale }] };
    // The prototype's `translate(0 y) scale(sx sy) scale(orb)` round the orb's centre.
    return {
      transform: [{ translateY: g.y * u }, { scaleX: g.sx }, { scaleY: g.sy }, { scale }],
    };
  });
  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: shape?.value.shadowX ?? 1 }],
  }));
  const haloStyle = useAnimatedStyle(() => {
    const h = base.value.halo;
    return { opacity: Math.min(1, h), transform: [{ scale: 0.92 + h * 0.1 }] };
  });
  const haloSize = ORB_R * 1.36 * 2 * u;
  return (
    <View style={{ width: size, height: size }}>
      {halo ? (
        <Animated.View pointerEvents="none" style={[centered(size, haloSize), haloStyle]}>
          <Halo size={haloSize} />
        </Animated.View>
      ) : null}
      {shadow && shape ? (
        <Animated.View
          pointerEvents="none"
          style={[LAYER, { width: size, height: size }, shadowStyle]}
        >
          <Shadow size={size} u={u} />
        </Animated.View>
      ) : shadow ? (
        <Shadow size={size} u={u} />
      ) : null}
      {back}
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        {shape ? (
          <ShapedGlass size={size} u={u} shape={shape} highlight={highlight} />
        ) : (
          <Glass size={size} u={u} inside={inside} highlight={highlight} />
        )}
        {overGlass}
      </Animated.View>
      {front}
    </View>
  );
}

/** Clips its children to the glass sphere (a circle of the orb's radius). */
export function InSphere({ size, u, children }: { size: number; u: number; children: ReactNode }) {
  const r = ORB_R * u;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: size / 2 - r,
        top: size / 2 - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

/**
 * The glass sphere, as the prototype's Orb draws it. A signature's `inside` lies between
 * the glass's colour and its shine (the prototype's `inside` group): then the glass is
 * drawn in two parts around it.
 */
function Glass({
  size,
  u,
  inside,
  highlight,
}: {
  size: number;
  u: number;
  inside: ReactNode;
  highlight: boolean;
}) {
  const id = useSvgId('orb');
  const R = ORB_R;
  const hx = -R * 0.36;
  const hy = -R * 0.46;
  const viewBox = `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`;
  const defs = (
    <Defs>
      <LinearGradient id={`${id}body`} x1="0.12" y1="0.08" x2="0.9" y2="0.95">
        <Stop offset="0" stopColor="#a9bfff" />
        <Stop offset="0.42" stopColor="#bba6fb" />
        <Stop offset="0.78" stopColor="#eaa6d6" />
        <Stop offset="1" stopColor="#f7bcdc" />
      </LinearGradient>
      <RadialGradient id={`${id}depth`} cx="0.42" cy="0.34" r="0.74">
        <Stop offset="0.6" stopColor={LB.primary} stopOpacity={0} />
        <Stop offset="0.9" stopColor={LB.primary} stopOpacity={0.24} />
        <Stop offset="1" stopColor={LB.primary} stopOpacity={0.4} />
      </RadialGradient>
      <RadialGradient id={`${id}shine`} cx="0.36" cy="0.28" r="0.52">
        <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
        <Stop offset="0.45" stopColor="#ffffff" stopOpacity={0.34} />
        <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={`${id}bounce`} cx="0.66" cy="0.86" r="0.34">
        <Stop offset="0" stopColor="#fff4fb" stopOpacity={0.8} />
        <Stop offset="1" stopColor="#fff4fb" stopOpacity={0} />
      </RadialGradient>
      <LinearGradient id={`${id}rim`} x1="0.25" y1="0" x2="0.75" y2="1">
        <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
        <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.25} />
        <Stop offset="1" stopColor="#ffffff" stopOpacity={0.9} />
      </LinearGradient>
      <ClipPath id={`${id}sphere`}>
        <Circle r={R} />
      </ClipPath>
      <Blur id={`${id}b05`} sd={0.5} />
      <Blur id={`${id}b15`} sd={1.5} />
    </Defs>
  );
  const colour = (
    <>
      <Circle r={R} fill={`url(#${id}body)`} />
      <Circle r={R} fill={`url(#${id}depth)`} />
    </>
  );
  const light = (
    <>
      <Circle r={R} fill={`url(#${id}shine)`} />
      <Circle r={R} fill={`url(#${id}bounce)`} />
      {/* The soft white inner edge of the glass. */}
      <Circle
        r={R - 0.7}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.7}
        strokeWidth={2.6}
        filter={`url(#${id}b15)`}
      />
      {highlight ? (
        <Ellipse
          cx={hx}
          cy={hy}
          rx={R * 0.17}
          ry={R * 0.085}
          transform={`rotate(-36 ${hx} ${hy})`}
          fill="#ffffff"
          fillOpacity={0.92}
          filter={`url(#${id}b05)`}
        />
      ) : null}
    </>
  );
  const rim = <Circle r={R - 0.4} fill="none" stroke={`url(#${id}rim)`} strokeWidth={0.9} />;
  if (!inside)
    return (
      <Svg width={size} height={size} viewBox={viewBox}>
        {defs}
        <G clipPath={`url(#${id}sphere)`}>
          {colour}
          {light}
        </G>
        {rim}
      </Svg>
    );
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={viewBox} style={LAYER}>
        {defs}
        <G clipPath={`url(#${id}sphere)`}>{colour}</G>
      </Svg>
      <InSphere size={size} u={u}>
        {inside}
      </InSphere>
      <Svg width={size} height={size} viewBox={viewBox} style={LAYER}>
        {defs}
        <G clipPath={`url(#${id}sphere)`}>{light}</G>
        {rim}
      </Svg>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Half the shaped glass's box (units): room for an outline up to 1.33 × the orb's radius. */
const SHAPED = 72;

/**
 * The glass in the shape a signature gives it (the prototype's Tropfen): the same body,
 * shine and bounce (circles of 1.35 × the radius, so their gradients are that much wider),
 * clipped to the outline; instead of the round glass's depth, a soft violet vignette along
 * the outline; the soft white edge and the rim follow the outline too.
 */
function ShapedGlass({
  size,
  u,
  shape,
  highlight,
}: {
  size: number;
  u: number;
  shape: SharedValue<GlassShape>;
  highlight: boolean;
}) {
  const id = useSvgId('orb');
  const R = ORB_R;
  const hx = -R * 0.36;
  const hy = -R * 0.46;
  const box = SHAPED * 2 * u;
  // One set of animated props per path (reanimated binds each to one view).
  const clip = useAnimatedProps(() => ({ d: shape.value.outline }));
  const vignette = useAnimatedProps(() => ({ d: shape.value.outline }));
  const edge = useAnimatedProps(() => ({ d: shape.value.outline }));
  const rim = useAnimatedProps(() => ({ d: shape.value.outline }));
  return (
    <View pointerEvents="none" style={centered(size, box)}>
      <Svg width={box} height={box} viewBox={`${-SHAPED} ${-SHAPED} ${SHAPED * 2} ${SHAPED * 2}`}>
        <Defs>
          <LinearGradient id={`${id}body`} x1="0.12" y1="0.08" x2="0.9" y2="0.95">
            <Stop offset="0" stopColor="#a9bfff" />
            <Stop offset="0.42" stopColor="#bba6fb" />
            <Stop offset="0.78" stopColor="#eaa6d6" />
            <Stop offset="1" stopColor="#f7bcdc" />
          </LinearGradient>
          <RadialGradient id={`${id}shine`} cx="0.36" cy="0.28" r="0.52">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
            <Stop offset="0.45" stopColor="#ffffff" stopOpacity={0.34} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}bounce`} cx="0.66" cy="0.86" r="0.34">
            <Stop offset="0" stopColor="#fff4fb" stopOpacity={0.8} />
            <Stop offset="1" stopColor="#fff4fb" stopOpacity={0} />
          </RadialGradient>
          <ClipPath id={`${id}shape`}>
            <AnimatedPath animatedProps={clip} />
          </ClipPath>
          <Blur id={`${id}b05`} sd={0.5} />
          <Blur id={`${id}b15`} sd={1.5} />
          <Blur id={`${id}b4`} sd={4} />
        </Defs>
        <G clipPath={`url(#${id}shape)`}>
          <Circle r={R * 1.35} fill={`url(#${id}body)`} />
          <AnimatedPath
            fill="none"
            stroke={LB.primary}
            strokeOpacity={0.3}
            strokeWidth={14}
            filter={`url(#${id}b4)`}
            animatedProps={vignette}
          />
          <Circle r={R * 1.35} fill={`url(#${id}shine)`} />
          <Circle r={R * 1.35} fill={`url(#${id}bounce)`} />
          {highlight ? (
            <Ellipse
              cx={hx}
              cy={hy}
              rx={R * 0.17}
              ry={R * 0.085}
              transform={`rotate(-36 ${hx} ${hy})`}
              fill="#ffffff"
              fillOpacity={0.92}
              filter={`url(#${id}b05)`}
            />
          ) : null}
          <AnimatedPath
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.7}
            strokeWidth={2.6}
            filter={`url(#${id}b15)`}
            animatedProps={edge}
          />
        </G>
        <AnimatedPath
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.85}
          strokeWidth={0.9}
          animatedProps={rim}
        />
      </Svg>
    </View>
  );
}

/** The soft violet shadow under a large orb (it does not breathe with the glass). */
function Shadow({ size, u }: { size: number; u: number }) {
  const id = useSvgId('sh');
  // Room for the blurred ellipse (its lower edge plus three deviations is 73 units down).
  const E = 76;
  const R = ORB_R;
  return (
    <View pointerEvents="none" style={centered(size, E * 2 * u)}>
      <Svg width={E * 2 * u} height={E * 2 * u} viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}>
        <Defs>
          <Blur id={id} sd={4} />
        </Defs>
        <Ellipse
          cx={2}
          cy={R * 0.98}
          rx={R * 0.72}
          ry={R * 0.15}
          fill={LB.primary}
          fillOpacity={0.2}
          filter={`url(#${id})`}
        />
      </Svg>
    </View>
  );
}

/** The white halo behind the glass (the prototype's, on its pastel stage). */
function Halo({ size }: { size: number }) {
  const id = useSvgId('halo');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.95} />
          <Stop offset="0.76" stopColor="#ffffff" stopOpacity={0.4} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** A pose that carries a sparkle shower: its progress (0…1) and strength. */
export type BurstPose = BasePose & { burstU: number; burstGate: number };

/** The prototype's shower of sparkles (makeBurst): `count` of them, spread from `spot`. */
export function Burst<P extends BurstPose>({
  pose,
  u,
  size,
  count,
  seed,
  spot,
}: {
  pose: SharedValue<P>;
  u: number;
  size: number;
  count: number;
  seed: number;
  spot: BurstSpot;
}) {
  const [parts] = useState(() => sparkles(count, seed));
  return (
    <View pointerEvents="none" style={[LAYER, { width: size, height: size }]}>
      {parts.map((q, i) => (
        <SparkleView
          key={i}
          q={q}
          color={BURST_COLS[i % BURST_COLS.length] ?? '#ffffff'}
          pose={pose}
          u={u}
          size={size}
          spot={spot}
        />
      ))}
    </View>
  );
}

function SparkleView<P extends BurstPose>({
  q,
  color,
  pose,
  u,
  size,
  spot,
}: {
  q: Sparkle;
  color: string;
  pose: SharedValue<P>;
  u: number;
  size: number;
  spot: BurstSpot;
}) {
  const id = useSvgId('spk');
  // viewBox -2…2 around a unit sparkle: one unit is 7 signature units at scale 1.
  const d = 28 * u;
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const s = burstPose(q, p.burstU, spot);
    return {
      opacity: p.burstGate > 0.02 ? s.op * p.burstGate : 0,
      transform: [
        { translateX: s.x * u },
        { translateY: s.y * u },
        { rotate: `${s.rot}deg` },
        { scale: s.scale / 7 },
      ],
    };
  });
  return (
    <Animated.View style={[centered(size, d), style]}>
      <Svg width={d} height={d} viewBox="-2 -2 4 4">
        <Defs>
          <GlowFilter id={id} />
        </Defs>
        <Path d={starPath(1, 0.2)} fill={color} filter={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
