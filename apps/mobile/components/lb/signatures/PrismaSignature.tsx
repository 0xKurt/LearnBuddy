// Signature "prisma" (prototype round 2, variant E "Prisma"; maths:
// lib/buddy/signatures/prisma.ts): Buddy breaks light like a prism. Behind the glass a
// bright beam comes in from the upper left and a fan of six pastel rays (pink, apricot,
// yellow, mint, blue, lilac) leaves at the lower right, its light fading out along the rays;
// at "happy" two more fans join and they all turn, with a shower of sparkles. On the glass,
// under its shine, lies a small caustic rainbow. The prototype's colours and blurs.
//
// A fan is drawn in its own frame, in units of its length (so its fading light is a fixed
// gradient), at its largest size, and turned, moved out to the glass's edge and scaled down
// as a whole; only its rays' corners are animated.
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import {
  BEAM_ENTRY,
  BEAM_START,
  FAN_EXIT,
  FAN_MAX,
  PRISMA,
  PRISMA_BURST,
  PRISMA_COLS,
  beamPath,
  prismaDetail,
  wedgePath,
  type PrismaPose,
} from '../../../lib/buddy/signatures/prisma.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { Blur, Burst, LAYER, OrbStage, centered, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** A fan's box in its own frame (units of its length): its rays reach 1, their roots −0.24. */
const FAN_BOX = 1.1;
/** A fan's usual length: its blur (0.5 units in the prototype) is set for it. */
const FAN_TYPICAL = 70;

export function PrismaSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => prismaDetail(size), [size]);
  const { pose, fade } = useSignature(PRISMA, state, level, live, detail);
  // The shower also shows in the still "happy" (the prototype's still is 0.9 s into it).
  const burst = useBurst(state, detail.sparkles > 0, PRISMA.settle);
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
        detail.prism ? (
          <View pointerEvents="none" style={[LAYER, { width: size, height: size }]}>
            <Fan {...parts} index={0} />
            <Fan {...parts} index={1} />
            <Fan {...parts} index={2} />
            <Beam {...parts} />
          </View>
        ) : null
      }
      inside={detail.prism ? <Caustic pose={pose} fade={fade} u={u} /> : null}
      front={
        burst ? (
          <Burst
            pose={pose}
            u={u}
            size={size}
            count={detail.sparkles}
            seed={91}
            spot={PRISMA_BURST}
          />
        ) : null
      }
    />
  );
}

type PartProps = {
  pose: SharedValue<PrismaPose>;
  fade: SharedValue<number>;
  u: number;
  size: number;
};

/** One fan of six rays leaving the glass, its light fading out towards the ends. */
function Fan({ pose, fade, u, size, index }: PartProps & { index: number }) {
  const id = useSvgId('fan');
  const box = FAN_BOX * 2 * FAN_MAX * u;
  const style = useAnimatedStyle(() => {
    const f = pose.value.fans;
    const o = index * 4;
    return {
      opacity: (f[o + 3] ?? 0) * fade.value,
      transform: [
        { rotate: `${f[o] ?? 0}deg` },
        { translateX: FAN_EXIT * u },
        { scale: (f[o + 2] ?? 0) / FAN_MAX },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[centered(size, box), style]}>
      <Svg
        width={box}
        height={box}
        viewBox={`${-FAN_BOX} ${-FAN_BOX} ${FAN_BOX * 2} ${FAN_BOX * 2}`}
      >
        <Defs>
          {PRISMA_COLS.map((c, i) => (
            <RadialGradient
              key={c}
              id={`${id}c${i}`}
              gradientUnits="userSpaceOnUse"
              cx={0}
              cy={0}
              r={1}
            >
              <Stop offset="0" stopColor={c} stopOpacity={1} />
              <Stop offset="0.55" stopColor={c} stopOpacity={0.85} />
              <Stop offset="1" stopColor={c} stopOpacity={0} />
            </RadialGradient>
          ))}
          <Blur id={`${id}b`} sd={0.5 / FAN_TYPICAL} />
        </Defs>
        <G filter={`url(#${id}b)`}>
          {PRISMA_COLS.map((c, i) => (
            <Ray key={c} pose={pose} fan={index} ray={i} fill={`url(#${id}c${i})`} />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}

function Ray({
  pose,
  fan,
  ray,
  fill,
}: {
  pose: SharedValue<PrismaPose>;
  fan: number;
  ray: number;
  fill: string;
}) {
  const props = useAnimatedProps(() => {
    const f = pose.value.fans;
    const o = fan * 4;
    return { d: wedgePath(ray, f[o + 1] ?? 0, f[o + 2] ?? 1) };
  });
  return <AnimatedPath fill={fill} animatedProps={props} />;
}

/** Half the beam's box across (units): its widest (6 units) and its blur. */
const BEAM_HALF = 12;

/** The bright beam coming in from the upper left, fading in towards the glass. */
function Beam({ pose, fade, u, size }: PartProps) {
  const id = useSvgId('beam');
  const w = BEAM_START * 2 + 12;
  const style = useAnimatedStyle(() => ({
    opacity: pose.value.beamOp * fade.value,
    transform: [{ rotate: `${pose.value.beamAng}deg` }],
  }));
  const props = useAnimatedProps(() => ({ d: beamPath(pose.value.beamW) }));
  return (
    <Animated.View pointerEvents="none" style={[centered(size, w * u, BEAM_HALF * 2 * u), style]}>
      <Svg
        width={w * u}
        height={BEAM_HALF * 2 * u}
        viewBox={`${-w / 2} ${-BEAM_HALF} ${w} ${BEAM_HALF * 2}`}
      >
        <Defs>
          <LinearGradient
            id={`${id}g`}
            gradientUnits="userSpaceOnUse"
            x1={BEAM_START}
            y1={0}
            x2={BEAM_ENTRY}
            y2={0}
          >
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="0.6" stopColor="#ffffff" stopOpacity={0.85} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={1} />
          </LinearGradient>
          <Blur id={`${id}b`} sd={1} />
        </Defs>
        <AnimatedPath fill={`url(#${id}g)`} filter={`url(#${id}b)`} animatedProps={props} />
      </Svg>
    </Animated.View>
  );
}

/** Half the caustic's box (units): its widest arc (r 43) with its line and blur. */
const CAUS = 50;

/** The caustic's six short arcs (the prototype's dashes: 26 units long, each 0.6 further on). */
const ARCS = PRISMA_COLS.map((c, i) => {
  const r = 30 + i * 2.6;
  const a0 = (i * 0.6) / r;
  const a1 = (26 + i * 0.6) / r;
  const pt = (a: number) => `${r * Math.cos(a)} ${r * Math.sin(a)}`;
  return { color: c, d: `M${pt(a0)}A${r} ${r} 0 0 1 ${pt(a1)}` };
});

/** A small rainbow of light on the glass, under its shine; it turns with the fan. */
function Caustic({
  pose,
  fade,
  u,
}: {
  pose: SharedValue<PrismaPose>;
  fade: SharedValue<number>;
  u: number;
}) {
  const id = useSvgId('caus');
  const box = CAUS * 2 * u;
  const r = 54 * u;
  const style = useAnimatedStyle(() => ({
    opacity: pose.value.causOp * fade.value,
    transform: [{ rotate: `${pose.value.causRot}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[centered(r * 2, box), style]}>
      <Svg width={box} height={box} viewBox={`${-CAUS} ${-CAUS} ${CAUS * 2} ${CAUS * 2}`}>
        <Defs>
          <Blur id={`${id}b`} sd={1.5} />
        </Defs>
        <G filter={`url(#${id}b)`}>
          {ARCS.map((a) => (
            <Path
              key={a.color}
              d={a.d}
              fill="none"
              stroke={a.color}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}
