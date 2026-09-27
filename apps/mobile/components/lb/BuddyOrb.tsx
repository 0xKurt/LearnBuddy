// Buddy's face: a pastel glass orb (blue → lilac → pink, lit from the upper left) and
// his signature, a small pearl moon on a tilted orbit that passes in front of and behind
// the glass (owner decision 2026-09-27, docs/DESIGN-BRIEF.md §Buddy's moon). The moon
// shows what Buddy is doing — idle, listen, think, wait, speak, happy — and blends softly
// between those states (the maths: lib/buddy/moon.ts). With `listening`, sound bars
// appear in the orb (the voice-first look). The same Buddy at every size; decorative for
// screen readers.
//
// How it moves: one frame callback on the UI thread steps the moon and writes a pose;
// a few animated views (the moon in front, the moon behind, a trail of dots, the
// reflection on the glass, the waiting ping) read it — no JS re-render per frame. Small
// avatars get a simpler moon (no reflection, a short trail); the smallest none
// (moonDetail). `breathe={false}` (an older avatar in the chat) and reduce motion stand
// still: the moon is parked in its state's still pose, and a change of state only
// cross-fades. A tap on a large orb makes it bob gently — nothing happens because of it.
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
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  HAPPY_SETTLE,
  ORB_R,
  moonDetail,
  moonPose,
  sparklePose,
  sparkles,
  starPath,
  stepMoon,
  stillMoon,
  stillSeconds,
  type MoonDetail,
  type MoonPose,
  type MoonSim,
  type MoonState,
  type Sparkle,
} from '../../lib/buddy/moon.js';
import { barHeights } from '../../lib/speech/level.js';
import { LB } from '../../lib/theme/colors.js';
import { DURATION, EASE, SPRING } from '../../lib/theme/motion.js';
import { useSvgId } from '../../lib/theme/svgId.js';

export type { MoonState } from '../../lib/buddy/moon.js';

const BAR_X = [33, 41, 49, 57, 65];
/** The tallest bar at full voice (in the 100-unit viewBox). */
const BAR_MAX = 44;
/** The orb's radius as a share of its box (a thin margin for the rim). */
const FILL = 0.48;
/** Half the glass's viewBox, in moon units. */
const VIEW = ORB_R / (2 * FILL);

// The moon's colours: a pearl lit from the upper left like Buddy, and lilac light around
// it (white light would vanish on the page's near-white).
const TRAIL = '#b9a4f5';
const PING = '#a98cf0';
const SPARK_COLORS = ['#b9a4f5', '#f2a9cf', '#a9bfff', '#d4c2ff', '#f7bcdc'] as const;

export function BuddyOrb({
  size = 32,
  state = 'idle',
  listening = false,
  level = 0.5,
  breathe = true,
  reactToTap = size >= 48,
  halo = false,
}: {
  size?: number;
  /** What Buddy is doing: the moon's state (lib/buddy/moon.ts). */
  state?: MoonState;
  listening?: boolean;
  /** How loud she is (0…1): the sound bars and the listening moon follow it. */
  level?: number;
  /** Alive: breathing and the moon moving (off for older avatars, where many stand together). */
  breathe?: boolean;
  /** Bob gently when touched (decorative: the tap starts nothing); default for a large orb. */
  reactToTap?: boolean;
  /** A soft halo of light around the orb that follows the state (talk mode). */
  halo?: boolean;
}) {
  const reduce = useReducedMotion();
  const detail = moonDetail(size);
  const live = breathe && !reduce;
  const { pose, fade } = useMoon(state, level, live, detail.ghosts);
  const bob = useSharedValue(1);
  const u = (size * FILL) / ORB_R;
  const burst = useBurst(state, live && detail.sparkles > 0);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pose.value.orb * bob.value }],
  }));
  const haloStyle = useAnimatedStyle(() => {
    const h = pose.value.halo;
    return { opacity: 0.8 * h, transform: [{ scale: 0.92 + h * 0.1 }] };
  });

  const heights = barHeights(level).map((h) => h * BAR_MAX);
  const haloSize = size * 2 * FILL * 1.36;
  const orb = (
    <View style={{ width: size, height: size }}>
      {halo ? (
        <Animated.View pointerEvents="none" style={[centered(size, haloSize), haloStyle]}>
          <Halo size={haloSize} />
        </Animated.View>
      ) : null}
      {detail.shadow ? <Shadow size={size} /> : null}
      {detail.moon ? (
        <MoonLayer side="back" pose={pose} fade={fade} u={u} size={size} detail={detail} />
      ) : null}
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        <Glass size={size} />
        {detail.reflection ? <Reflection pose={pose} fade={fade} u={u} size={size} /> : null}
        {listening ? (
          <Svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            style={{ position: 'absolute', left: 0, top: 0 }}
          >
            {BAR_X.map((x, i) => (
              <Rect
                key={x}
                x={x - 1.8}
                y={50 - (heights[i] ?? 0) / 2}
                width={3.6}
                height={heights[i] ?? 0}
                rx={1.8}
                fill={LB.primary}
              />
            ))}
          </Svg>
        ) : null}
      </Animated.View>
      {detail.moon ? (
        <MoonLayer side="front" pose={pose} fade={fade} u={u} size={size} detail={detail} />
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
): { pose: SharedValue<MoonPose>; fade: SharedValue<number> } {
  const start = useRef<{ sim: MoonSim; pose: MoonPose } | null>(null);
  if (start.current === null) {
    // A live moon starts in its orbit (a "happy" flies from there); a still one in its pose.
    const sim = live
      ? stillMoon(state === 'happy' ? 'idle' : state, 1.5)
      : stillMoon(state, stillSeconds(state));
    start.current = { sim, pose: moonPose(sim, level, ghosts) };
  }
  const sim = useSharedValue<MoonSim>(start.current.sim);
  const pose = useSharedValue<MoonPose>(start.current.pose);
  const target = useSharedValue<MoonState>(state);
  const voice = useSharedValue(level);
  const fade = useSharedValue(1);

  useEffect(() => {
    target.value = state;
  }, [state, target]);
  useEffect(() => {
    voice.value = live ? withSpring(level, { damping: 16, stiffness: 220 }) : level;
  }, [level, live, voice]);

  const onFrame = useCallback(
    (info: { timeSincePreviousFrame: number | null }) => {
      'worklet';
      const dt = Math.min(0.05, Math.max(0, (info.timeSincePreviousFrame ?? 16) / 1000));
      const next = stepMoon(sim.value, dt, target.value);
      sim.value = next;
      pose.value = moonPose(next, voice.value, ghosts);
    },
    [sim, pose, target, voice, ghosts],
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
      if (first) {
        pose.value = still;
        fade.value = 1;
      } else {
        fade.value = withTiming(0, { duration: DURATION.quick, easing: EASE.standard }, () => {
          pose.value = still;
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
  }, [live, state, pose, fade, ghosts]);

  return { pose, fade };
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

/** The glass sphere (drawn as scripts/brand/render-icons.mjs draws the app icon). */
function Glass({ size }: { size: number }) {
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
          <Stop offset="0.6" stopColor={LB.primary} stopOpacity={0} />
          <Stop offset="0.9" stopColor={LB.primary} stopOpacity={0.22} />
          <Stop offset="1" stopColor={LB.primary} stopOpacity={0.36} />
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
        {/* The soft white inner edge of the glass (a blurred stroke in the prototype). */}
        <RadialGradient id={`${id}edge`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.86" stopColor="#ffffff" stopOpacity={0} />
          <Stop offset="0.96" stopColor="#ffffff" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.75} />
        </RadialGradient>
        <LinearGradient id={`${id}rim`} x1="0.25" y1="0" x2="0.75" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
          <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      <Circle r={R} fill={`url(#${id}body)`} />
      <Circle r={R} fill={`url(#${id}depth)`} />
      <Circle r={R} fill={`url(#${id}shine)`} />
      <Circle r={R} fill={`url(#${id}bounce)`} />
      <Circle r={R} fill={`url(#${id}edge)`} />
      <Ellipse
        cx={hx}
        cy={hy}
        rx={R * 0.17}
        ry={R * 0.085}
        transform={`rotate(-36 ${hx} ${hy})`}
        fill="#ffffff"
        fillOpacity={0.92}
      />
      <Circle r={R - 0.4} fill="none" stroke={`url(#${id}rim)`} strokeWidth={1.2} />
    </Svg>
  );
}

/** A soft violet shadow under a large orb. */
function Shadow({ size }: { size: number }) {
  const id = useSvgId('sh');
  const w = size * 0.9;
  const h = size * 0.3;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (size - w) / 2 + size * 0.02,
        top: size * 0.83,
        width: w,
        height: h,
      }}
    >
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={LB.primary} stopOpacity={0.2} />
            <Stop offset="0.55" stopColor={LB.primary} stopOpacity={0.08} />
            <Stop offset="1" stopColor={LB.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function Halo({ size }: { size: number }) {
  const id = useSvgId('halo');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.5" stopColor={LB.lavenderDeep} stopOpacity={0.85} />
          <Stop offset="0.74" stopColor={LB.peachDeep} stopOpacity={0.3} />
          <Stop offset="1" stopColor={LB.skyDeep} stopOpacity={0} />
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
  /** Pixels per moon unit. */
  u: number;
  size: number;
};

/** Everything of the moon on one side of the glass: its trail, (in front) the ping, the moon. */
function MoonLayer({ detail, ...layer }: LayerProps & { detail: MoonDetail }) {
  const ghosts = Array.from({ length: detail.ghosts }, (_, i) => i);
  return (
    <View pointerEvents="none" style={[LAYER, { width: layer.size, height: layer.size }]}>
      {ghosts.map((i) => (
        <Ghost key={i} index={i} {...layer} />
      ))}
      {layer.side === 'front' && detail.ping ? <Ping {...layer} /> : null}
      <Moon {...layer} boost={detail.boost} />
    </View>
  );
}

function Moon({ side, pose, fade, u, size, boost }: LayerProps & { boost: number }) {
  const id = useSvgId('moon');
  const m = 44 * u * boost;
  const front = side === 'front';
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    const here = front ? p.z >= 0 : p.z < 0;
    return {
      opacity: here ? fade.value : 0,
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
              <Stop offset="0.3" stopColor="#f6e6ff" stopOpacity={0.8} />
              <Stop offset="0.62" stopColor="#d9c2ff" stopOpacity={0.4} />
              <Stop offset="1" stopColor="#cdb6ff" stopOpacity={0} />
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
          {/* The soft terminator: the lower right lies in shade, so it reads as a moon. */}
          <RadialGradient id={`${id}shade`} cx="0.8" cy="0.75" r="0.62">
            <Stop offset="0" stopColor="#a98cf0" stopOpacity={0.55} />
            <Stop offset="0.7" stopColor="#a98cf0" stopOpacity={0.4} />
            <Stop offset="1" stopColor="#a98cf0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle r={8.6} fill={`url(#${id}pearl)`} />
        <Circle r={8.6} fill={`url(#${id}shade)`} />
        <Circle r={8.6} fill="none" stroke="#b89ff2" strokeOpacity={0.6} strokeWidth={0.8} />
        <Circle cx={-2.8} cy={-3} r={2.3} fill="#ffffff" fillOpacity={0.95} />
      </Svg>
    </Animated.View>
  );
}

function Ghost({ index, side, pose, fade, u, size }: LayerProps & { index: number }) {
  const d = 8.4 * u;
  const front = side === 'front';
  const style = useAnimatedStyle(() => {
    const g = pose.value.ghosts;
    const o = index * 5;
    const z = g[o + 2] ?? 0;
    const here = front ? z >= 0 : z < 0;
    return {
      opacity: here ? (g[o + 4] ?? 0) * fade.value : 0,
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

/** "Your turn": a soft ring that leaves the waiting moon. */
function Ping({ pose, u, size }: LayerProps) {
  const d = 28 * u;
  const style = useAnimatedStyle(() => {
    const p = pose.value;
    return {
      opacity: p.pingOp,
      transform: [{ translateX: p.x * u }, { translateY: p.y * u }, { scale: p.pingR / 14 }],
    };
  });
  return (
    <Animated.View
      style={[
        centered(size, d),
        { borderRadius: d / 2, borderWidth: Math.max(1, 1.5 * u), borderColor: PING },
        style,
      ]}
    />
  );
}

/** The moon's light on the glass when it passes close (large orbs). */
function Reflection({ pose, fade, u, size }: Omit<LayerProps, 'side'>) {
  const id = useSvgId('refl');
  const r = ORB_R * u;
  const w = 20 * u;
  const h = 14 * u;
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
      <Animated.View style={[centered(r * 2, w, h), style]}>
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
              <Stop offset="0.45" stopColor="#ffffff" stopOpacity={0.6} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={`url(#${id})`} />
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
  const d = 14 * u;
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
      <Svg width={d} height={d} viewBox="-1 -1 2 2">
        <Path d={starPath(1, 0.2)} fill={color} />
      </Svg>
    </Animated.View>
  );
}
