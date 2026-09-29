// Signature "kern" (prototype round 1, variant 3 "Lichtkern"; maths:
// lib/buddy/signatures/kern.ts): a soft whirl of light in the glass — a violet depth, a blue
// and a pink cloud that circle, three arms of white light (sharp and glowing) round a
// bright core, and the flare of "happy". All of it lies in the glass under its shine, in
// the prototype's frame (moved a little up left, turned −18°, flattened to 0.8), drawn with
// its shapes and blurs; the paths and radii follow the pose on the UI thread.
import { useMemo } from 'react';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { ORB_R } from '../../../lib/buddy/signatures/core.js';
import { KERN, KERN_BURST, kernDetail, type KernPose } from '../../../lib/buddy/signatures/kern.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { Blur, Burst, OrbStage, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

export function KernSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => kernDetail(size), [size]);
  const { pose, fade } = useSignature(KERN, state, level, live, detail);
  const burst = useBurst(state, live && detail.sparkles > 0, KERN.settle);
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      inside={detail.whirl ? <Whirl pose={pose} fade={fade} u={u} /> : null}
      front={
        burst ? (
          <Burst
            pose={pose}
            u={u}
            size={size}
            count={detail.sparkles}
            seed={23}
            spot={KERN_BURST}
          />
        ) : null
      }
    />
  );
}

/** The whirl, the size of the glass (InSphere clips it to the sphere). */
function Whirl({
  pose,
  fade,
  u,
}: {
  pose: SharedValue<KernPose>;
  fade: SharedValue<number>;
  u: number;
}) {
  const id = useSvgId('kern');
  const d = ORB_R * 2 * u;
  const style = useAnimatedStyle(() => ({ opacity: fade.value }));
  const blue = useAnimatedProps(() => ({ cx: pose.value.blueX, cy: pose.value.blueY }));
  const pink = useAnimatedProps(() => ({ cx: pose.value.pinkX, cy: pose.value.pinkY }));
  const arm0 = useAnimatedProps(() => ({ d: pose.value.arms[0] ?? '' }));
  const arm1 = useAnimatedProps(() => ({ d: pose.value.arms[1] ?? '' }));
  const arm2 = useAnimatedProps(() => ({ d: pose.value.arms[2] ?? '' }));
  const arms = useAnimatedProps(() => ({ opacity: pose.value.armOp }));
  const glow = useAnimatedProps(() => ({ r: pose.value.glowR }));
  const dot = useAnimatedProps(() => ({ r: pose.value.dotR }));
  const flare = useAnimatedProps(() => ({ r: pose.value.flareR, opacity: pose.value.flareOp }));
  const armProps = [arm0, arm1, arm2];
  return (
    <Animated.View pointerEvents="none" style={[{ width: d, height: d }, style]}>
      <Svg width={d} height={d} viewBox={`${-ORB_R} ${-ORB_R} ${ORB_R * 2} ${ORB_R * 2}`}>
        <Defs>
          <RadialGradient id={`${id}core`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
            <Stop offset="0.35" stopColor="#f6f0ff" stopOpacity={0.8} />
            <Stop offset="1" stopColor="#e7dcff" stopOpacity={0} />
          </RadialGradient>
          <Blur id={`${id}b1`} sd={1} />
          <Blur id={`${id}b4`} sd={4} />
          <Blur id={`${id}b8`} sd={8} />
        </Defs>
        <G transform="translate(-4 -2) rotate(-18) scale(1 0.8)">
          <Circle r={40} fill="#5b3fc4" opacity={0.38} filter={`url(#${id}b8)`} />
          <AnimatedCircle
            r={22}
            fill="#7f9bff"
            opacity={0.6}
            filter={`url(#${id}b8)`}
            animatedProps={blue}
          />
          <AnimatedCircle
            r={22}
            fill="#ff9fd0"
            opacity={0.5}
            filter={`url(#${id}b8)`}
            animatedProps={pink}
          />
          {/* The arms twice: a wide glow under the sharp light. */}
          <G filter={`url(#${id}b4)`} opacity={0.8}>
            {armProps.map((a, i) => (
              <AnimatedPath key={i} fill="#ffffff" animatedProps={a} />
            ))}
          </G>
          <AnimatedG filter={`url(#${id}b1)`} animatedProps={arms}>
            {armProps.map((a, i) => (
              <AnimatedPath key={i} fill="#ffffff" animatedProps={a} />
            ))}
          </AnimatedG>
          <AnimatedCircle fill={`url(#${id}core)`} animatedProps={glow} />
          <AnimatedCircle fill="#ffffff" animatedProps={dot} />
        </G>
        <AnimatedCircle fill="#ffffff" filter={`url(#${id}b8)`} animatedProps={flare} />
      </Svg>
    </Animated.View>
  );
}
