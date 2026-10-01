// Buddy's face: a pastel glass orb (blue → lilac → pink, lit from the upper left) and
// his signature, a small pearl moon on a tilted orbit that passes in front of and behind
// the glass (owner decision 2026-09-27, docs/DESIGN-BRIEF.md §Buddy's moon). The moon
// shows what Buddy is doing — idle, listen, think, wait, speak, happy — and blends softly
// between those states (the maths: lib/buddy/moon.ts). The glass stays clear in every
// state — listening is the moon glowing with her voice, not bars in the orb (owner
// feedback 2026-09-28). The same Buddy at every size; decorative for screen readers.
//
// The reference is the approved prototype, variant 1 "Mond" (owner 2026-09-28: "alle
// Animationen waren doch gut aus den Testfiles"): the same glass, white halo, shadow,
// moon, white trail and ping, reflection and sparkle colours, drawn with the same blurs.
// A large orb draws it exactly; a chat avatar draws the same moon at the same scale with
// fewer trail dots and sparkles and no reflection, shadow or halo; the smallest none
// (moonDetail).
//
// How it moves: one frame callback on the UI thread steps the moon and writes a pose;
// a few animated views (the moon in front, the moon behind, a trail of dots, the
// reflection on the glass, the waiting ping) read it — no JS re-render per frame.
// `breathe={false}` (an older avatar in the chat) and reduce motion stand still: the moon
// is parked in its state's still pose, and a change of state only cross-fades. A tap on a
// large orb makes it bob gently — nothing happens because of it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
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
  HAPPY_SETTLE,
  ORB_R,
  moonDetail,
  moonPose,
  newOrder,
  placeOrder,
  sparklePose,
  sparkles,
  starPath,
  stepMoon,
  stillMoon,
  stillSeconds,
  type MoonDetail,
  type MoonOrder,
  type MoonPose,
  type MoonSim,
  type MoonState,
  type Sparkle,
} from '../../lib/buddy/moon.js';
import { orbMoves } from '../../lib/buddy/orbRoom.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { DURATION, EASE, SPRING } from '../../lib/theme/motion.js';
import { useSvgId } from '../../lib/theme/svgId.js';

export type { MoonState } from '../../lib/buddy/moon.js';

/** The orb's radius as a share of its box (a thin margin for the rim). */
const FILL = 0.48;
/** Half the glass's viewBox, in moon units. */
const VIEW = ORB_R / (2 * FILL);

// The prototype's colours: white light (trail, ping) — it reads on the pastel light behind
// Buddy and on his white halo, as on the prototype's stage — and its sparkle shower.
const TRAIL = '#ffffff';
const PING = '#ffffff';
const SPARK_COLORS = ['#ffffff', '#d4c2ff', '#ffc2e0', '#ffffff', '#c3d2ff'] as const;

export function BuddyOrb({
  size = 32,
  state = 'idle',
  level = 0.5,
  breathe = true,
  reactToTap = size >= 48,
  halo,
}: {
  size?: number;
  /** What Buddy is doing: the moon's state (lib/buddy/moon.ts). */
  state?: MoonState;
  /** How loud she is (0…1): the listening orb, halo and moon follow it. */
  level?: number;
  /** Alive: breathing and the moon moving (off for older avatars, where many stand together). */
  breathe?: boolean;
  /** Bob gently when touched (decorative: the tap starts nothing); default for a large orb. */
  reactToTap?: boolean;
  /** The soft white halo that follows the state (default: large orbs, as the prototype). */
  halo?: boolean;
}) {
  const reduce = useReducedMotion();
  const detail = moonDetail(size);
  // Decoration stops with reduce motion; "Buddy is working" does not (issue #182).
  const live = orbMoves(breathe, reduce, state);
  const { pose, fade, order } = useMoon(state, level, live, detail.ghosts);
  const bob = useSharedValue(1);
  const u = (size * FILL) / ORB_R;
  const burst = useBurst(state, live && detail.sparkles > 0);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pose.value.orb * bob.value }],
  }));
  const haloStyle = useAnimatedStyle(() => {
    const h = pose.value.halo;
    return { opacity: Math.min(1, h), transform: [{ scale: 0.92 + h * 0.1 }] };
  });

  const haloSize = ORB_R * 1.36 * 2 * u;
  const orb = (
    <View style={{ width: size, height: size }}>
      {(halo ?? detail.halo) ? (
        <Animated.View pointerEvents="none" style={[centered(size, haloSize), haloStyle]}>
          <Halo size={haloSize} />
        </Animated.View>
      ) : null}
      {detail.shadow ? <Shadow size={size} u={u} /> : null}
      {detail.moon ? (
        <MoonLayer
          side="back"
          pose={pose}
          fade={fade}
          order={order}
          u={u}
          size={size}
          detail={detail}
        />
      ) : null}
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        <Glass size={size} />
        {detail.reflection ? <Reflection pose={pose} fade={fade} u={u} size={size} /> : null}
      </Animated.View>
      {detail.moon ? (
        <MoonLayer
          side="front"
          pose={pose}
          fade={fade}
          order={order}
          u={u}
          size={size}
          detail={detail}
        />
      ) : null}
      {burst ? <Burst pose={pose} u={u} size={size} count={detail.sparkles} /> : null}
    </View>
  );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {reactToTap ? (
        <Pressable
          accessible={false}
          onPressIn={() => {
            if (reduce) return;
            bob.value = withSequence(
              withTiming(0.92, { duration: DURATION.quick, easing: EASE.standard }),
              withSpring(1, SPRING),
            );
          }}
        >
          {orb}
        </Pressable>
      ) : (
        orb
      )}
    </View>
  );
}

/**
 * The moon's pose, stepped on the UI thread while `live`; otherwise the state's still pose,
 * cross-faded when the state changes (reduce motion: nothing moves, only this fade).
 */
function useMoon(
  state: MoonState,
  level: number,
  live: boolean,
  ghosts: number,
): {
  pose: SharedValue<MoonPose>;
  fade: SharedValue<number>;
  order: SharedValue<MoonOrder>;
} {
  const start = useRef<{ sim: MoonSim; pose: MoonPose; order: MoonOrder } | null>(null);
  if (start.current === null) {
    // A live moon starts in its orbit (a "happy" flies from there); a still one in its pose.
    const sim = live
      ? stillMoon(state === 'happy' ? 'idle' : state, 1.5)
      : stillMoon(state, stillSeconds(state));
    const pose = moonPose(sim, level, ghosts);
    start.current = { sim, pose, order: placeOrder(newOrder(ghosts), pose) };
  }
  const sim = useSharedValue<MoonSim>(start.current.sim);
  const pose = useSharedValue<MoonPose>(start.current.pose);
  const order = useSharedValue<MoonOrder>(start.current.order);
  const target = useSharedValue<MoonState>(state);
  const voice = useSharedValue(level);
  const fade = useSharedValue(1);

  useEffect(() => {
    target.value = state;
  }, [state, target]);
  useEffect(() => {
    // The microphone reports her level a few times a second: a quick, critically damped
    // spring joins the dots without overshooting (the orb swells with her, not beyond).
    voice.value = live ? withSpring(level, { damping: 30, stiffness: 220 }) : level;
  }, [level, live, voice]);

  const onFrame = useCallback(
    (info: { timeSincePreviousFrame: number | null }) => {
      'worklet';
      const dt = Math.min(0.05, Math.max(0, (info.timeSincePreviousFrame ?? 16) / 1000));
      const next = stepMoon(sim.value, dt, target.value);
      sim.value = next;
      const p = moonPose(next, voice.value, ghosts);
      pose.value = p;
      order.value = placeOrder(order.value, p);
    },
    [sim, pose, order, target, voice, ghosts],
  );
  const frame = useFrameCallback(onFrame, false);
  useEffect(() => {
    frame.setActive(live);
    if (live) fade.value = withTiming(1, { duration: DURATION.quick });
    return () => frame.setActive(false);
  }, [live, frame, fade]);

  // Standing still: the state's still pose; a change cross-fades (a happy settles to idle).
  const shown = useRef<MoonState | null>(null);
  useEffect(() => {
    if (live) {
      shown.current = null;
      return;
    }
    const place = (s: MoonState, first: boolean): void => {
      const still = moonPose(stillMoon(s, stillSeconds(s)), level, ghosts);
      const stack = placeOrder(order.value, still);
      if (first) {
        pose.value = still;
        order.value = stack;
        fade.value = 1;
      } else {
        fade.value = withTiming(0, { duration: DURATION.quick, easing: EASE.standard }, () => {
          pose.value = still;
          order.value = stack;
          fade.value = withTiming(1, { duration: DURATION.base, easing: EASE.standard });
        });
      }
      shown.current = s;
    };
    if (shown.current !== state) place(state, shown.current === null);
    if (state !== 'happy') return;
    const settle = setTimeout(() => place('idle', false), HAPPY_SETTLE * 1000);
    return () => clearTimeout(settle);
    // `level` only matters for the listening pose, taken when the state changes.
  }, [live, state, pose, fade, order, ghosts]);

  return { pose, fade, order };
}

/** The sparkle burst is on screen only while a "happy" plays. */
function useBurst(state: MoonState, allowed: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (state !== 'happy' || !allowed) {
      setOn(false);
      return;
    }
    setOn(true);
    const off = setTimeout(() => setOn(false), HAPPY_SETTLE * 1000);
    return () => clearTimeout(off);
  }, [state, allowed]);
  return on;
}

/** An absolutely placed box of `w` × `h` px, centred on the orb. */
function centered(size: number, w: number, h: number = w) {
  return {
    position: 'absolute' as const,
    left: (size - w) / 2,
    top: (size - h) / 2,
    width: w,
    height: h,
  };
}

const LAYER = { position: 'absolute' as const, left: 0, top: 0 };

/** A Gaussian blur filter (stdDeviation in the drawing's units), as the prototype's. */
function Blur({ id, sd }: { id: string; sd: number }) {
  return (
    <Filter id={id} x="-80%" y="-80%" width="260%" height="260%">
      <FeGaussianBlur stdDeviation={sd} />
    </Filter>
  );
}

/** The glass sphere, as the prototype's Orb draws it. */
function Glass({ size }: { size: number }) {
  const { palette } = useTheme();
  const id = useSvgId('orb');
  const R = ORB_R;
  const hx = -R * 0.36;
  const hy = -R * 0.46;
  return (
    <Svg width={size} height={size} viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}>
      <Defs>
        <LinearGradient id={`${id}body`} x1="0.12" y1="0.08" x2="0.9" y2="0.95">
          <Stop offset="0" stopColor="#a9bfff" />
          <Stop offset="0.42" stopColor="#bba6fb" />
          <Stop offset="0.78" stopColor="#eaa6d6" />
          <Stop offset="1" stopColor="#f7bcdc" />
        </LinearGradient>
        <RadialGradient id={`${id}depth`} cx="0.42" cy="0.34" r="0.74">
          <Stop offset="0.6" stopColor={palette.primary} stopOpacity={0} />
          <Stop offset="0.9" stopColor={palette.primary} stopOpacity={0.24} />
          <Stop offset="1" stopColor={palette.primary} stopOpacity={0.4} />
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
      <G clipPath={`url(#${id}sphere)`}>
        <Circle r={R} fill={`url(#${id}body)`} />
        <Circle r={R} fill={`url(#${id}depth)`} />
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
      </G>
      <Circle r={R - 0.4} fill="none" stroke={`url(#${id}rim)`} strokeWidth={0.9} />
    </Svg>
  );
}

/** The soft violet shadow under a large orb (it does not breathe with the glass). */
function Shadow({ size, u }: { size: number; u: number }) {
  const { palette } = useTheme();
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
          fill={palette.primary}
          fillOpacity={0.2}
          filter={`url(#${id})`}
        />
      </Svg>
    </View>
  );
}

/** The white halo behind the glass (the prototype's, on its pastel stage). */
/**
 * The bloom around Buddy. Its colour comes from the palette (issue #139): white light was
 * made for the pastel ground and turns into a near-white disc on the night one.
 *
 * The falloff lost its step too. It used to sit flat at full strength out to half the
 * radius and then drop to 0.4 in one go — invisible against a light ground, a hard edge
 * against a dark one. The inner part is behind the orb anyway.
 */
function Halo({ size }: { size: number }) {
  const id = useSvgId('halo');
  const { palette } = useTheme();
  const { color, opacity } = palette.buddyLight.halo;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.4" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.66" stopColor={color} stopOpacity={opacity * 0.42} />
          <Stop offset="0.85" stopColor={color} stopOpacity={opacity * 0.12} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

type LayerProps = {
  side: 'front' | 'back';
  pose: SharedValue<MoonPose>;
  fade: SharedValue<number>;
  /** Which part lies on top (the prototype's node order). */
  order: SharedValue<MoonOrder>;
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
  const r = ORB_R * u;
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
      <Animated.View style={[centered(r * 2, box), style]}>
        <Svg width={box} height={box} viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}>
          <Defs>
            <Blur id={id} sd={2.2} />
          </Defs>
          <Ellipse rx={6} ry={4} fill="#ffffff" filter={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** The shower of sparkles at the top of "happy". */
function Burst({
  pose,
  u,
  size,
  count,
}: {
  pose: SharedValue<MoonPose>;
  u: number;
  size: number;
  count: number;
}) {
  const [parts] = useState(() => sparkles(count));
  return (
    <View pointerEvents="none" style={[LAYER, { width: size, height: size }]}>
      {parts.map((q, i) => (
        <SparkleView
          key={i}
          q={q}
          color={SPARK_COLORS[i % SPARK_COLORS.length] ?? TRAIL}
          pose={pose}
          u={u}
          size={size}
        />
      ))}
    </View>
  );
}

function SparkleView({
  q,
  color,
  pose,
  u,
  size,
}: {
  q: Sparkle;
  color: string;
  pose: SharedValue<MoonPose>;
  u: number;
  size: number;
}) {
  const id = useSvgId('spk');
  // viewBox -2…2 around a unit sparkle: one unit is 7 moon units at scale 1.
  const d = 28 * u;
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const s = sparklePose(q, p.burstU);
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
          {/* The prototype's glow: a soft blur under the sharp sparkle. */}
          <Filter id={id} x="-100%" y="-100%" width="300%" height="300%">
            <FeGaussianBlur in="SourceGraphic" stdDeviation={0.35} result="b" />
            <FeMerge>
              <FeMergeNode in="b" />
              <FeMergeNode in="SourceGraphic" />
            </FeMerge>
          </Filter>
        </Defs>
        <Path d={starPath(1, 0.2)} fill={color} filter={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
