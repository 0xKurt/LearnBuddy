// Signature "mondfunken" (prototype round 2, variant B "Mond mit Funken"; maths:
// lib/buddy/signatures/mondfunken.ts): the pearl moon of "mond" — the same moon, ping,
// reflection and shower (MondSignature.tsx) — with a trail of little pastel sparkles and
// stars instead of white dots, and pastel sparkles round Buddy that show the state. Which
// part lies on top follows the prototype's node order (core.ts placeNodes).
import { useMemo } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { SPARK_COLS, type NodeOrder } from '../../../lib/buddy/signatures/core.js';
import { MOON_BURST } from '../../../lib/buddy/signatures/mond.js';
import {
  MONDFUNKEN,
  MONDFUNKEN_FIELD,
  mondfunkenDetail,
  type MondfunkenDetail,
  type MondfunkenPose,
} from '../../../lib/buddy/signatures/mondfunken.js';
import { Moon, Ping, Reflection } from './MondSignature.js';
import { Spark, fieldShape, trailShape } from './sparks.js';
import { Burst, LAYER, OrbStage, type SignatureProps } from './stage.js';
import { useBurst, useSignature } from './useSignature.js';

export function MondfunkenSignature({ state, level, live, size, u, bob, halo }: SignatureProps) {
  const detail = useMemo(() => mondfunkenDetail(size), [size]);
  const { pose, fade, order } = useSignature(MONDFUNKEN, state, level, live, detail);
  // The shower also shows in the still "happy" (the prototype's still is 1.0 s into it).
  const burst = useBurst(state, detail.sparkles > 0, MONDFUNKEN.settle);
  const layer = { pose, fade, order, u, size, detail };
  return (
    <OrbStage
      size={size}
      u={u}
      base={pose}
      bob={bob}
      halo={halo ?? detail.halo}
      shadow={detail.shadow}
      back={detail.moon ? <Side {...layer} front={false} /> : null}
      overGlass={
        detail.reflection ? <Reflection pose={pose} fade={fade} u={u} size={size} /> : null
      }
      front={
        <>
          {detail.moon ? <Side {...layer} front /> : null}
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

/** Everything on one side of the glass: the moon, the ping, the trail, the field. */
function Side({
  detail,
  front,
  ...part
}: {
  pose: SharedValue<MondfunkenPose>;
  fade: SharedValue<number>;
  order: SharedValue<NodeOrder>;
  u: number;
  size: number;
  detail: MondfunkenDetail;
  front: boolean;
}) {
  const side = front ? 'front' : 'back';
  return (
    <View pointerEvents="none" style={[LAYER, { width: part.size, height: part.size }]}>
      <Moon side={side} {...part} />
      {detail.ping ? <Ping side={side} {...part} /> : null}
      {Array.from({ length: detail.ghosts }, (_, i) => (
        <Spark
          key={`g${i}`}
          {...part}
          front={front}
          list="ghosts"
          index={i}
          node={2 + i}
          shape={trailShape(i)}
          color={SPARK_COLS[(i * 3) % SPARK_COLS.length] ?? '#ffffff'}
        />
      ))}
      {MONDFUNKEN_FIELD.slice(0, detail.sparks).map((q, i) => (
        <Spark
          key={`f${i}`}
          {...part}
          front={front}
          list="field"
          index={i}
          node={2 + detail.ghosts + i}
          shape={fieldShape(q)}
          color={q.color}
        />
      ))}
    </View>
  );
}
