// Signature "mondfunken" (prototype round 2, variant B "Mond mit Funken"): the moon of round
// 1 (mond.ts) with the colourful sparkle language. Its trail is made of little pastel
// sparkles instead of white dots, and pastel sparkles round Buddy (sparkField.ts) show the
// state too:
//   idle    the moon circles, a few sparkles drift calmly round Buddy;
//   listen  the moon stops, sparkles stream towards Buddy with her voice;
//   think   the moon races, a colourful whirl of sparkles circles with it;
//   wait    the moon bobs, single sparkles blink quietly round him;
//   speak   sparkles leave Buddy with every word;
//   happy   the moon spirals up, a shower of sparkles, then the sparkles dance upwards.
// The moon itself — orbit, glow, ping, reflection, "happy" flight and shower — is mond.ts's,
// unchanged (the prototype builds this variant from the same code).
//
// Pure maths (core.ts); the drawing is components/lb/signatures/MondfunkenSignature.tsx.

import { clamp, orbLevel, type NodeOrder, type SignatureMaths } from './core.js';
import {
  MOND,
  PROTO_GHOSTS,
  PROTO_SPARKLES,
  moonPose,
  type MoonPose,
  type MoonSim,
} from './mond.js';
import { FIELD_DEFAULTS, fieldSparks, placeSpark } from './sparkField.js';

/** The prototype's field round Buddy: 16 sparkles, seed 13 (round 2's options). */
export const MONDFUNKEN_SPARKS = 16;
export const MONDFUNKEN_FIELD = fieldSparks(MONDFUNKEN_SPARKS, 13);

export type MondfunkenPose = Omit<MoonPose, 'ghosts'> & {
  /** The colourful trail: x, y, z, rotation (degrees), scale, opacity per little sparkle. */
  ghosts: number[];
  /** The field round Buddy: x, y, z, rotation, scale, opacity per sparkle. */
  field: number[];
};

export type MondfunkenDetail = {
  moon: boolean;
  /** Trail sparkles (the prototype's 12; fewer are spaced wider, the trail keeps its length). */
  ghosts: number;
  /** Field sparkles round Buddy. */
  sparks: number;
  reflection: boolean;
  ping: boolean;
  /** Sparkles in the "happy" shower. */
  sparkles: number;
  shadow: boolean;
  halo: boolean;
};

/**
 * Where everything is: the moon exactly as mond.ts, its trail as colourful sparkles (the
 * prototype: the same places, a small wobble, a turn, 1.2 × the dots' opacity) and the field.
 */
export function mondfunkenPose(
  sim: MoonSim,
  voice: number,
  detail: { ghosts: number; sparks: number },
): MondfunkenPose {
  'worklet';
  const n = Math.max(0, Math.floor(detail.ghosts));
  const moon = moonPose(sim, voice, n);
  const t = sim.t;
  const spacing = n > 0 ? PROTO_GHOSTS / n : 1;
  const ghosts: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * 5;
    const z = moon.ghosts[o + 2] ?? 0;
    ghosts.push(
      (moon.ghosts[o] ?? 0) + Math.sin(i * 1.7 + t * 3) * 2,
      (moon.ghosts[o + 1] ?? 0) + Math.cos(i * 2.3 + t * 2.4) * 2,
      z,
      i * 37 + t * 60,
      (4.4 - i * 0.25 * spacing) * (1 + 0.12 * z),
      (moon.ghosts[o + 4] ?? 0) * 1.2,
    );
  }
  const field: number[] = [];
  const m = Math.min(MONDFUNKEN_SPARKS, Math.max(0, Math.floor(detail.sparks)));
  const vo = clamp(voice);
  for (let i = 0; i < m; i++) {
    const p = MONDFUNKEN_FIELD[i];
    if (p) placeSpark(field, p, i, m, sim.w, t, sim.hT, vo, FIELD_DEFAULTS);
  }
  return { ...moon, ghosts, field };
}

/**
 * The stacking order (core.ts NodeOrder). Nodes in the order the prototype places them: 0 the
 * moon, 1 the ping, then the trail, then the field. Created: the trail (behind the glass),
 * the field, the ping and the moon (in front) — so the moon starts on top.
 */
export function mondfunkenOrder(detail: MondfunkenDetail): NodeOrder {
  'worklet';
  const n = Math.max(0, Math.floor(detail.ghosts));
  const m = Math.max(0, Math.floor(detail.sparks));
  const front: boolean[] = [true, true];
  const seq: number[] = [n + m + 1, n + m];
  for (let i = 0; i < n; i++) {
    front.push(false);
    seq.push(i);
  }
  for (let i = 0; i < m; i++) {
    front.push(true);
    seq.push(n + i);
  }
  return { front, seq, next: n + m + 2 };
}

/** Each node's depth, in the order of mondfunkenOrder. */
export function mondfunkenNodes(pose: MondfunkenPose): number[] {
  'worklet';
  const zs = [pose.z, pose.z];
  for (let i = 2; i < pose.ghosts.length; i += 6) zs.push(pose.ghosts[i] ?? 0);
  for (let i = 2; i < pose.field.length; i += 6) zs.push(pose.field[i] ?? 0);
  return zs;
}

export function mondfunkenDetail(size: number): MondfunkenDetail {
  const level = orbLevel(size);
  if (level === 'none')
    return {
      moon: false,
      ghosts: 0,
      sparks: 0,
      reflection: false,
      ping: false,
      sparkles: 0,
      shadow: false,
      halo: false,
    };
  // A chat avatar: the same moon at the same scale, fewer trail and field sparkles, no
  // reflection, shadow or halo (as mond.ts).
  if (level === 'avatar')
    return {
      moon: true,
      ghosts: 6,
      sparks: 8,
      reflection: false,
      ping: true,
      sparkles: 7,
      shadow: false,
      halo: false,
    };
  return {
    moon: true,
    ghosts: PROTO_GHOSTS,
    sparks: MONDFUNKEN_SPARKS,
    reflection: true,
    ping: true,
    sparkles: PROTO_SPARKLES,
    shadow: true,
    halo: true,
  };
}

/**
 * The moon with sparkles as the renderer drives it: the moon's own simulation, start, stills
 * (1.0 s for "happy", 2.6 s otherwise — the prototype's) and settle (2.4 s).
 */
export const MONDFUNKEN: SignatureMaths<MoonSim, MondfunkenPose, MondfunkenDetail> = {
  settle: MOND.settle,
  start: MOND.start,
  still: MOND.still,
  step: MOND.step,
  pose: (sim, voice, detail) => {
    'worklet';
    return mondfunkenPose(sim, voice, detail);
  },
  order: mondfunkenOrder,
  nodes: mondfunkenNodes,
};
