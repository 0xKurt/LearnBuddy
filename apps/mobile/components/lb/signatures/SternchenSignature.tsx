// Signatures "sternchen" and "nurstern" (prototype round 2 variant A "Sternchen", round 3 A1
// "Nur der große Stern"; maths: lib/buddy/signatures/sternchen.ts): a soft, round
// five-pointed star (cream → pink → lilac, a white edge and a small shine) with its warm
// light flies round Buddy, in front of and behind the glass, and leaves a warm reflection on
// it. "sternchen" adds its colourful tail, the pastel sparkles round Buddy and confetti;
// "nurstern" is the star alone, with rings of light at the top of "happy". Which part lies
// on top follows the prototype's node order (core.ts placeNodes).
import { useMemo, type ComponentType } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import {
  SPARK_COLS,
  starPath,
  star5Path,
  type NodeOrder,
  type SignatureMaths,
} from '../../../lib/buddy/signatures/core.js';
import {
  NURSTERN,
  STAR_FIELD,
  STERNCHEN,
  STERNCHEN_BURST,
  nursternDetail,
  sternchenDetail,
  type SternchenPose,
  type SternchenSim,
  type StarDetail,
} from '../../../lib/buddy/signatures/sternchen.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import {
  Blur,
  Burst,
  GlowFilter,
  InSphere,
  LAYER,
  OrbStage,
  centered,
  type SignatureProps,
} from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The star and its light are drawn at twice their size and only ever scaled down. */
const HI = 2;

function starSignature(
  maths: SignatureMaths<SternchenSim, SternchenPose, StarDetail>,
  detailFor: (size: number) => StarDetail,
  cheer: boolean,
): ComponentType<SignatureProps> {
  return function StarSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
    const detail = useMemo(() => detailFor(size), [size]);
    const { pose, fade, order } = useSignature(maths, state, level, live, detail);
    const burst = useBurst(state, live && detail.confetti > 0, maths.settle);
    const parts = { pose, fade, order, u, size, detail };
    return (
      <OrbStage
        size={size}
        u={u}
        base={pose}
        bob={bob}
        halo={halo ?? detail.halo}
        shadow={detail.shadow}
        back={detail.star ? <Side {...parts} front={false} /> : null}
        overGlass={
          detail.reflection ? <Reflection pose={pose} fade={fade} u={u} size={size} /> : null
        }
        front={
          <>
            {detail.star ? <Side {...parts} front /> : null}
            {detail.star && cheer ? <Rings pose={pose} fade={fade} u={u} size={size} /> : null}
            {burst ? (
              <Burst
                pose={pose}
                u={u}
                size={size}
                count={detail.confetti}
                seed={9}
                spot={STERNCHEN_BURST}
              />
            ) : null}
          </>
        }
      />
    );
  };
}

export const SternchenSignature = starSignature(STERNCHEN, sternchenDetail, false);
export const NursternSignature = starSignature(NURSTERN, nursternDetail, true);

type PartProps = {
  pose: SharedValue<SternchenPose>;
  fade: SharedValue<number>;
  order: SharedValue<NodeOrder>;
  u: number;
  size: number;
  /** Which side of the glass this layer is. */
  front: boolean;
};

/** Everything of the star on one side of the glass: the star, its tail, the field. */
function Side({ detail, ...part }: PartProps & { detail: StarDetail }) {
  return (
    <View pointerEvents="none" style={[LAYER, { width: part.size, height: part.size }]}>
      <Star {...part} />
      {Array.from({ length: detail.ghosts }, (_, i) => (
        <Bit
          key={`g${i}`}
          {...part}
          list="ghosts"
          index={i}
          node={1 + i}
          shape={i % 2 ? starPath(1, 0.22) : star5Path(1, 0.5, 0.2)}
          color={SPARK_COLS[(i * 3) % SPARK_COLS.length] ?? '#ffffff'}
        />
      ))}
      {STAR_FIELD.slice(0, detail.sparks).map((q, i) => (
        <Bit
          key={`f${i}`}
          {...part}
          list="field"
          index={i}
          node={1 + detail.ghosts + i}
          shape={q.kind === 0 ? null : q.kind === 1 ? starPath(1, 0.22) : star5Path(1, 0.5, 0.2)}
          color={q.color}
        />
      ))}
    </View>
  );
}

function Star({ pose, fade, order, u, size, front }: PartProps) {
  const id = useSvgId('star');
  const body = 15;
  const light = 27;
  const place = useAnimatedStyle(() => {
    const p = pose.value;
    const here = front ? p.z >= 0 : p.z < 0;
    return {
      opacity: here ? fade.value : 0,
      zIndex: order.value.seq[0] ?? 0,
      transform: [{ translateX: p.x * u }, { translateY: p.y * u }],
    };
  });
  const glow = useAnimatedStyle(() => ({
    opacity: pose.value.glowOp,
    transform: [{ scale: pose.value.glowScale / HI }],
  }));
  const turn = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pose.value.rot}deg` }, { scale: pose.value.scale / HI }],
  }));
  const L = light * 2 * u * HI;
  const B = body * 2 * u * HI;
  return (
    <Animated.View style={[centered(size, L), place]}>
      <Animated.View style={[LAYER, { width: L, height: L }, glow]}>
        <Svg width={L} height={L} viewBox={`${-light} ${-light} ${light * 2} ${light * 2}`}>
          <Defs>
            <RadialGradient id={`${id}glow`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#fffaf0" stopOpacity={1} />
              <Stop offset="0.3" stopColor="#ffe6f1" stopOpacity={0.7} />
              <Stop offset="0.65" stopColor="#e9d4ff" stopOpacity={0.3} />
              <Stop offset="1" stopColor="#dcc6ff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle r={light} fill={`url(#${id}glow)`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[centered(L, B), turn]}>
        <Svg width={B} height={B} viewBox={`${-body} ${-body} ${body * 2} ${body * 2}`}>
          <Defs>
            <LinearGradient id={`${id}fill`} x1="0.15" y1="0" x2="0.85" y2="1">
              <Stop offset="0" stopColor="#fff5d6" />
              <Stop offset="0.45" stopColor="#ffc7e0" />
              <Stop offset="1" stopColor="#b99dff" />
            </LinearGradient>
            <Blur id={`${id}b`} sd={0.5} />
          </Defs>
          <Path
            d={star5Path(13.5, 0.52, 0.22)}
            fill={`url(#${id}fill)`}
            stroke="#ffffff"
            strokeOpacity={0.85}
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
          <Path
            d={star5Path(6.4, 0.5, 0.25)}
            transform="translate(-2 -2.7)"
            fill="#ffffff"
            fillOpacity={0.6}
            filter={`url(#${id}b)`}
          />
          <Circle cx={-3.9} cy={-5.6} r={1.7} fill="#ffffff" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * One small sparkle of the tail or the field (the prototype's unit shape with its glow; a
 * null shape is a dot of radius 0.55).
 */
function Bit({
  pose,
  fade,
  order,
  u,
  size,
  front,
  list,
  index,
  node,
  shape,
  color,
}: PartProps & {
  list: 'ghosts' | 'field';
  index: number;
  /** Its place in the stacking order. */
  node: number;
  shape: string | null;
  color: string;
}) {
  const id = useSvgId('bit');
  // viewBox -2…2 around a unit shape: one unit is 7 signature units at scale 1.
  const box = 28 * u;
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const g = list === 'ghosts' ? p.ghosts : p.field;
    const o = index * 6;
    const z = g[o + 2] ?? 0;
    const here = front ? z >= 0 : z < 0;
    return {
      opacity: here ? (g[o + 5] ?? 0) * fade.value : 0,
      zIndex: order.value.seq[node] ?? 0,
      transform: [
        { translateX: (g[o] ?? 0) * u },
        { translateY: (g[o + 1] ?? 0) * u },
        { rotate: `${g[o + 3] ?? 0}deg` },
        { scale: Math.max(0, g[o + 4] ?? 0) / 7 },
      ],
    };
  });
  return (
    <Animated.View style={[centered(size, box), style]}>
      <Svg width={box} height={box} viewBox="-2 -2 4 4">
        <Defs>
          <GlowFilter id={id} />
        </Defs>
        {shape ? (
          <Path d={shape} fill={color} filter={`url(#${id})`} />
        ) : (
          <Circle r={0.55} fill={color} filter={`url(#${id})`} />
        )}
      </Svg>
    </Animated.View>
  );
}

/** The star's warm light on the glass when it passes close (large orbs). */
function Reflection({
  pose,
  fade,
  u,
  size,
}: {
  pose: SharedValue<SternchenPose>;
  fade: SharedValue<number>;
  u: number;
  size: number;
}) {
  const id = useSvgId('srefl');
  const r = 54 * u;
  const E = 14;
  const box = E * 2 * u;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pose.value.reflOp) * fade.value,
    transform: [{ translateX: pose.value.reflX * u }, { translateY: pose.value.reflY * u }],
  }));
  return (
    <InSphere size={size} u={u}>
      <Animated.View style={[centered(r * 2, box), style]}>
        <Svg width={box} height={box} viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}>
          <Defs>
            <Blur id={id} sd={2.2} />
          </Defs>
          <Ellipse rx={6} ry={4} fill="#fff4dc" filter={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </InSphere>
  );
}

const RING_COLS = ['#ffd9ec', '#e4d6ff', '#fff3d6'] as const;

/** "nurstern"'s soft rings of light that leave the star at the top of "happy". */
function Rings({
  pose,
  fade,
  u,
  size,
}: {
  pose: SharedValue<SternchenPose>;
  fade: SharedValue<number>;
  u: number;
  size: number;
}) {
  const E = 60;
  const box = E * 2 * u;
  const place = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: pose.value.x * u }, { translateY: pose.value.y * u }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[centered(size, box), place]}>
      <Svg width={box} height={box} viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}>
        {RING_COLS.map((c, i) => (
          <LightRing key={c} pose={pose} index={i} color={c} />
        ))}
      </Svg>
    </Animated.View>
  );
}

function LightRing({
  pose,
  index,
  color,
}: {
  pose: SharedValue<SternchenPose>;
  index: number;
  color: string;
}) {
  const id = useSvgId('lring');
  const props = useAnimatedProps(() => {
    const g = pose.value.rings;
    const o = index * 3;
    return {
      r: g[o] ?? 0,
      strokeWidth: Math.max(0, g[o + 1] ?? 0),
      opacity: g[o + 2] ?? 0,
    };
  });
  return (
    <>
      <Defs>
        <Blur id={id} sd={0.5} />
      </Defs>
      <AnimatedCircle fill="none" stroke={color} filter={`url(#${id})`} animatedProps={props} />
    </>
  );
}
