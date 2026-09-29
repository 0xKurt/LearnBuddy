// One small pastel sparkle of the round-2 sparkle language (lib/buddy/signatures/sparkField.ts):
// a dot, a four-pointed sparkle or a soft five-pointed star with the prototype's glow, placed
// from a pose list (x, y, z, rotation, scale, opacity per sparkle) on its side of the glass.
// Used by "mondfunken" (its trail and field) and "nurfunken" (its field).
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path } from 'react-native-svg';

import {
  starPath,
  star5Path,
  type BasePose,
  type NodeOrder,
} from '../../../lib/buddy/signatures/core.js';
import type { FieldSpark } from '../../../lib/buddy/signatures/sparkField.js';
import { useSvgId } from '../../../lib/theme/svgId.js';
import { GlowFilter, centered } from './stage.js';

/** A pose that carries sparkles: the field round Buddy and (optionally) a trail. */
export type SparkPose = BasePose & { field: number[]; ghosts?: number[] };

/** The unit shape of a field sparkle (null: a dot). */
export function fieldShape(q: FieldSpark): string | null {
  return q.kind === 0 ? null : q.kind === 1 ? starPath(1, 0.22) : star5Path(1, 0.5, 0.2);
}

/** The unit shape of trail sparkle `i`: stars and sparkles by turns. */
export function trailShape(i: number): string {
  return i % 2 ? starPath(1, 0.22) : star5Path(1, 0.5, 0.2);
}

export function Spark<P extends SparkPose>({
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
  most = 8,
}: {
  pose: SharedValue<P>;
  fade: SharedValue<number>;
  order: SharedValue<NodeOrder>;
  u: number;
  size: number;
  /** Which side of the glass this copy is. */
  front: boolean;
  list: 'ghosts' | 'field';
  index: number;
  /** Its place in the stacking order. */
  node: number;
  shape: string | null;
  color: string;
  /** Its largest scale: it is drawn at that size and only ever scaled down. */
  most?: number;
}) {
  const id = useSvgId('spark');
  // viewBox -2…2 around a unit shape, drawn at its largest scale.
  const box = 4 * most * u;
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const g = (list === 'ghosts' ? p.ghosts : p.field) ?? [];
    const o = index * 6;
    const z = g[o + 2] ?? 0;
    const here = front ? z >= 0 : z < 0;
    return {
      opacity: here ? Math.min(1, Math.max(0, g[o + 5] ?? 0)) * fade.value : 0,
      zIndex: order.value.seq[node] ?? 0,
      transform: [
        { translateX: (g[o] ?? 0) * u },
        { translateY: (g[o + 1] ?? 0) * u },
        { rotate: `${g[o + 3] ?? 0}deg` },
        { scale: Math.max(0, g[o + 4] ?? 0) / most },
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
