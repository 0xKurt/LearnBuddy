// Buddy's orb looks the same while writing far less per frame (issue #637).
//
// Replays the moon frame by frame through every state and its blends, at the header size (6
// trail dots a side) and the Talk size (12), and applies the writes the way Reanimated does: a
// style is sent when its object is not shallow-equal to the last one. The reference is what the
// orb wrote before (every part, every frame, all props at once). For every part that can be seen
// (opacity above 0) the props on the view must be exactly the reference's, every frame; what
// cannot be seen may keep an old place. And it must write far less.

import { describe, expect, it } from 'vitest';

import {
  moonDetail,
  moonPose,
  MOON_STATES,
  newMoon,
  newOrder,
  placeOrder,
  stepMoon,
  type MoonOrder,
  type MoonPose,
  type MoonSim,
  type MoonState,
} from '../moon.js';
import {
  ghostOpacity,
  ghostPlace,
  glowOpacity,
  glowScale,
  haloOpacity,
  haloScale,
  moonOpacity,
  moonPlace,
  pingBox,
  pingOpacity,
  reflOpacity,
  reflPlace,
  stack,
} from '../orbStyles.js';

type Props = Record<string, unknown>;
const LINE = 1.6;

/** What the orb wrote before #637: one style per part, everything, every frame. */
function reference(
  p: MoonPose,
  fade: number,
  order: MoonOrder,
  u: number,
  size: number,
  ghosts: number,
) {
  const parts: Record<string, Props> = {
    body: { transform: [{ scale: p.orb }] },
    halo: { opacity: Math.min(1, p.halo), transform: [{ scale: 0.92 + p.halo * 0.1 }] },
    refl: {
      opacity: Math.min(1, p.reflOp) * fade,
      transform: [
        { translateX: p.reflX * u },
        { translateY: p.reflY * u },
        { rotate: `${p.reflRot}deg` },
      ],
    },
  };
  for (const front of [true, false]) {
    const side = front ? 'f' : 'b';
    const here = front ? p.z >= 0 : p.z < 0;
    parts[`moon${side}`] = {
      opacity: here ? fade : 0,
      zIndex: order.seq[0] ?? 0,
      transform: [{ translateX: p.x * u }, { translateY: p.y * u }, { scale: p.scale }],
    };
    const g = p.glow;
    parts[`glow${side}`] = {
      opacity: Math.min(1, Math.max(0, g)),
      transform: [{ scale: 0.8 + Math.min(1.3, Math.max(0, g)) * 0.4 }],
    };
    const r = (p.pingR + LINE / 2) * u;
    parts[`ping${side}`] = {
      opacity: here ? p.pingOp : 0,
      zIndex: order.seq[1] ?? 0,
      left: size / 2 + p.x * u - r,
      top: size / 2 + p.y * u - r,
      width: r * 2,
      height: r * 2,
      borderRadius: r,
    };
    for (let i = 0; i < ghosts; i++) {
      const gg = p.ghosts;
      const o = i * 5;
      const z = gg[o + 2] ?? 0;
      const gh = front ? z >= 0 : z < 0;
      parts[`ghost${side}${i}`] = {
        opacity: gh ? (gg[o + 4] ?? 0) * fade : 0,
        zIndex: order.seq[i + 2] ?? 0,
        transform: [
          { translateX: (gg[o] ?? 0) * u },
          { translateY: (gg[o + 1] ?? 0) * u },
          { scale: (gg[o + 3] ?? 0) / 4.2 },
        ],
      };
    }
  }
  return parts;
}

/** The same parts now: each a list of separate styles. */
function split(
  p: MoonPose,
  fade: number,
  order: MoonOrder,
  u: number,
  size: number,
  ghosts: number,
) {
  const parts: Record<string, Props[]> = {
    body: [{ transform: [{ scale: p.orb }] }],
    halo: [{ opacity: haloOpacity(p) }, haloScale(p)],
    refl: [{ opacity: reflOpacity(p, fade) }, reflPlace(p, fade, u)],
  };
  for (const front of [true, false]) {
    const side = front ? 'f' : 'b';
    parts[`moon${side}`] = [
      { opacity: moonOpacity(p, fade, front) },
      stack(order, 0),
      moonPlace(p, fade, front, u),
    ];
    parts[`glow${side}`] = [{ opacity: glowOpacity(p) }, glowScale(p, fade, front)];
    parts[`ping${side}`] = [
      { opacity: pingOpacity(p, front) },
      stack(order, 1),
      pingBox(p, front, u, size, LINE),
    ];
    for (let i = 0; i < ghosts; i++)
      parts[`ghost${side}${i}`] = [
        { opacity: ghostOpacity(p, i, fade, front) },
        stack(order, i + 2),
        ghostPlace(p, i, fade, front, u),
      ];
  }
  return parts;
}

/** The parts an orb of this size draws (moonDetail: halo and reflection only on large orbs). */
function only<T>(parts: Record<string, T>, size: number): Record<string, T> {
  const d = moonDetail(size);
  return Object.fromEntries(
    Object.entries(parts).filter(
      ([k]) => (k !== 'halo' || d.halo) && (k !== 'refl' || d.reflection),
    ),
  );
}

/** Reanimated's rule for a style without animations: sent when not shallow-equal to the last. */
function shallowEqual(a: Props | undefined, b: Props): boolean {
  if (!a) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

/** A run of states, each held for a while, so every blend between them is crossed. */
const RUN: Array<[MoonState, number]> = [
  ['idle', 10],
  ['listen', 3],
  ['think', 4],
  ['speak', 3],
  ['wait', 4],
  ['happy', 3],
  ['idle', 3],
  ['speak', 2],
  ['listen', 2],
  ['idle', 2],
];

function replay(ghosts: number, size: number, levelOf: (t: number) => number) {
  const u = (size * 0.48) / 54;
  let sim: MoonSim = newMoon('idle');
  let order = newOrder(ghosts);
  const lastRef: Record<string, Props> = {};
  const lastNew: Record<string, Props[]> = {};
  const onViewRef: Record<string, Props> = {};
  const onViewNew: Record<string, Props> = {};
  let writesRef = 0;
  let writesNew = 0;
  let propsRef = 0;
  let propsNew = 0;
  let frames = 0;
  let checked = 0;
  for (const [state, secs] of RUN) {
    for (let f = 0; f < secs * 60; f++) {
      sim = stepMoon(sim, 1 / 60, state);
      const pose = moonPose(sim, levelOf(sim.t), ghosts);
      order = placeOrder(order, pose);
      // A short fade, as when a still orb comes alive.
      const fade = Math.min(1, frames / 12);
      frames++;
      const ref = only(reference(pose, fade, order, u, size, ghosts), size);
      for (const [k, v] of Object.entries(ref)) {
        if (!shallowEqual(lastRef[k], v)) {
          writesRef++;
          propsRef += Object.keys(v).length;
          onViewRef[k] = { ...onViewRef[k], ...v };
        }
        lastRef[k] = v;
      }
      const now = only(split(pose, fade, order, u, size, ghosts), size);
      for (const [k, styles] of Object.entries(now)) {
        const last = (lastNew[k] ??= []);
        let touched = false;
        styles.forEach((v, i) => {
          if (!shallowEqual(last[i], v)) {
            touched ||= Object.keys(v).length > 0;
            propsNew += Object.keys(v).length;
            onViewNew[k] = { ...onViewNew[k], ...v };
          }
          last[i] = v;
        });
        // Reanimated gathers a frame's writes per view: one view, one update, however many styles.
        if (touched) writesNew++;
      }
      for (const k of Object.keys(ref)) {
        const want = onViewRef[k]!;
        const got = onViewNew[k]!;
        // Seen or not: the same opacity, always.
        expect(got.opacity, `${state} frame ${f} ${k} opacity`).toBe(want.opacity);
        if (k === 'body') {
          expect(got).toEqual(want);
          continue;
        }
        const parent = k.startsWith('glow') ? onViewRef[`moon${k.slice(4)}`]! : null;
        const seen = (want.opacity as number) > 0 && (!parent || (parent.opacity as number) > 0);
        if (!seen) continue;
        expect(got, `${state} frame ${f} ${k}`).toEqual(want);
        checked++;
      }
    }
  }
  return { writesRef, writesNew, propsRef, propsNew, frames, checked };
}

const voice = (t: number) => 0.5 + 0.4 * Math.sin(t * 7);

describe("Buddy's orb, frame by frame", () => {
  it.each([
    ['header orb', 6, 30],
    ['Talk orb', 12, 220],
  ] as const)(
    '%s: every part she can see is exactly where it was, with far fewer writes',
    (_, ghosts, size) => {
      const r = replay(ghosts, size, voice);
      expect(r.checked).toBeGreaterThan(r.frames * 3);
      // Far fewer views updated per frame (each one cloned into the shadow tree and handed to
      // Java), and far fewer props.
      console.info(
        `[orb] ${_}: ${r.frames} frames, view updates ${r.writesRef} → ${r.writesNew}, props ${r.propsRef} → ${r.propsNew}`,
      );
      expect(r.writesNew).toBeLessThan(r.writesRef * 0.67);
      expect(r.propsNew).toBeLessThan(r.propsRef * 0.5);
    },
  );

  it('covers every state', () => {
    expect(new Set(RUN.map(([s]) => s))).toEqual(new Set(MOON_STATES));
  });
});
