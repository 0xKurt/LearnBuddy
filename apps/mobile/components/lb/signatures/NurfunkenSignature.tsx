// Signature "nurfunken" (prototype round 3, A2 "Nur die bunten Sternchen"; maths:
// lib/buddy/signatures/nurfunken.ts): no big star, only colourful little sparkles round
// Buddy — larger and brighter than round 2's — in front of and behind the glass, and big
// confetti all round at "happy". Which sparkle lies on top follows the prototype's node
// order (core.ts placeNodes).
import { useMemo } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { NodeOrder } from '../../../lib/buddy/signatures/core.js';
import {
  NURFUNKEN,
  NURFUNKEN_BURST,
  NURFUNKEN_FIELD,
  nurfunkenDetail,
  type NurfunkenPose,
} from '../../../lib/buddy/signatures/nurfunken.js';
import { Spark, fieldShape } from './sparks.js';
import { Burst, LAYER, OrbStage, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

/** The largest a sparkle gets (the field's 5.6 × 1.4 while speaking, × 1.8). */
const MOST = 14.2;

export function NurfunkenSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => nurfunkenDetail(size), [size]);
  const { pose, fade, order } = useSignature(NURFUNKEN, state, level, live, detail);
  // The confetti also shows in the still "happy": the prototype's still is it in mid-flight.
  const burst = useBurst(state, detail.confetti > 0, NURFUNKEN.settle);
  const layer = { pose, fade, order, u, size, sparks: detail.sparks };
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      back={detail.sparks > 0 ? <Side {...layer} front={false} /> : null}
      front={
        <>
          {detail.sparks > 0 ? <Side {...layer} front /> : null}
          {burst ? (
            <Burst
              pose={pose}
              u={u}
              size={size}
              count={detail.confetti}
              seed={9}
              spot={NURFUNKEN_BURST}
            />
          ) : null}
        </>
      }
    />
  );
}

function Side({
  sparks,
  front,
  ...part
}: {
  pose: SharedValue<NurfunkenPose>;
  fade: SharedValue<number>;
  order: SharedValue<NodeOrder>;
  u: number;
  size: number;
  sparks: number;
  front: boolean;
}) {
  return (
    <View pointerEvents="none" style={[LAYER, { width: part.size, height: part.size }]}>
      {NURFUNKEN_FIELD.slice(0, sparks).map((q, i) => (
        <Spark
          key={i}
          {...part}
          front={front}
          list="field"
          index={i}
          node={i}
          shape={fieldShape(q)}
          color={q.color}
          most={MOST}
        />
      ))}
    </View>
  );
}
