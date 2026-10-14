// What each moving part of Buddy's orb writes per frame (components/lb/BuddyOrb.tsx, issue #637).
//
// On Android every animated style Reanimated writes is a shadow-tree commit on the UI thread,
// and it writes a style whenever the object it returns differs from the last one — a fresh
// transform array always does. One small orb wrote ~19 views every frame, among them views
// that could not be seen (the moon and trail dots on the far side of the glass, the ping and the
// trail in states that have none) and `zIndex` values that had not changed. On the POCO X3 that
// was about one core while nothing happened.
//
// So each part is split by how often it changes, and what cannot be seen writes nothing:
//   - `zIndex` on its own: written only when the stacking order changes;
//   - opacity on its own: written only when it changes;
//   - the movement (transform, the ping's box): written only while the part can be seen. A hidden
//     part keeps its last place; the frame it shows again writes opacity and place together.
// What is on screen is the same as before, pixel for pixel: a part is drawn only when its
// opacity is above 0, and then it always carries this frame's place (lib/buddy/__tests__/
// orbStyles.test.ts replays every state frame by frame against the full writes).
//
// Pure worklets: the same functions run on the UI thread and in the test.

import type { MoonOrder, MoonPose } from './moon.js';

/** What the orb's shared values were created with: the JS thread's copy of them. */
export type Born = { pose: MoonPose; order: MoonOrder };

/** Nothing to write: equal to the last `{}`, so Reanimated sends nothing. */
type Still = Record<string, never>;

/** Whether the moon is on this side of the glass. */
function onSide(z: number, front: boolean): boolean {
  'worklet';
  return front ? z >= 0 : z < 0;
}

/** The moon's opacity on one side. */
export function moonOpacity(p: MoonPose, fade: number, front: boolean): number {
  'worklet';
  return onSide(p.z, front) ? fade : 0;
}

export function moonPlace(p: MoonPose, fade: number, front: boolean, u: number) {
  'worklet';
  if (moonOpacity(p, fade, front) <= 0) return {} as Still;
  return { transform: [{ translateX: p.x * u }, { translateY: p.y * u }, { scale: p.scale }] };
}

/** The moon's glow: inside the moon's view, so it is seen only where the moon is. */
export function glowOpacity(p: MoonPose): number {
  'worklet';
  return Math.min(1, Math.max(0, p.glow));
}

export function glowScale(p: MoonPose, fade: number, front: boolean) {
  'worklet';
  if (moonOpacity(p, fade, front) <= 0 || glowOpacity(p) <= 0) return {} as Still;
  return { transform: [{ scale: 0.8 + Math.min(1.3, Math.max(0, p.glow)) * 0.4 }] };
}

/** A trail dot's opacity on one side. */
export function ghostOpacity(p: MoonPose, index: number, fade: number, front: boolean): number {
  'worklet';
  const o = index * 5;
  const z = p.ghosts[o + 2] ?? 0;
  return onSide(z, front) ? (p.ghosts[o + 4] ?? 0) * fade : 0;
}

export function ghostPlace(p: MoonPose, index: number, fade: number, front: boolean, u: number) {
  'worklet';
  if (ghostOpacity(p, index, fade, front) <= 0) return {} as Still;
  const g = p.ghosts;
  const o = index * 5;
  return {
    transform: [
      { translateX: (g[o] ?? 0) * u },
      { translateY: (g[o + 1] ?? 0) * u },
      { scale: (g[o + 3] ?? 0) / 4.2 },
    ],
  };
}

/** The ping's opacity on one side. */
export function pingOpacity(p: MoonPose, front: boolean): number {
  'worklet';
  return onSide(p.z, front) ? p.pingOp : 0;
}

/**
 * The ping's box: the ring grows while its line stays thin, so it is the box that grows (a
 * scale would thicken the line). Written only while the ring is seen ("wait").
 */
export function pingBox(p: MoonPose, front: boolean, u: number, size: number, line: number) {
  'worklet';
  if (pingOpacity(p, front) <= 0) return {} as Still;
  const r = (p.pingR + line / 2) * u;
  return {
    left: size / 2 + p.x * u - r,
    top: size / 2 + p.y * u - r,
    width: r * 2,
    height: r * 2,
    borderRadius: r,
  };
}

/** Stacking: which part lies on top, written only when the order changes. */
export function stack(order: MoonOrder, k: number) {
  'worklet';
  return { zIndex: order.seq[k] ?? 0 };
}

export function reflOpacity(p: MoonPose, fade: number): number {
  'worklet';
  return Math.min(1, p.reflOp) * fade;
}

export function reflPlace(p: MoonPose, fade: number, u: number) {
  'worklet';
  if (reflOpacity(p, fade) <= 0) return {} as Still;
  return {
    transform: [
      { translateX: p.reflX * u },
      { translateY: p.reflY * u },
      { rotate: `${p.reflRot}deg` },
    ],
  };
}

export function haloOpacity(p: MoonPose): number {
  'worklet';
  return Math.min(1, p.halo);
}

export function haloScale(p: MoonPose) {
  'worklet';
  if (haloOpacity(p) <= 0) return {} as Still;
  return { transform: [{ scale: 0.92 + p.halo * 0.1 }] };
}
