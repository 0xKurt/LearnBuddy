// How much room Buddy's orb really needs, and when it is allowed to move (issue #182).
//
// Pure, no React: both are geometry and policy, not rendering.

import type { MoonState } from './moon.js';

/**
 * The widest the drawing gets, as a multiple of the orb's `size`.
 *
 * The ball fills 48 % of its box (`FILL` in BuddyOrb) so the moon has somewhere to fly —
 * and fly it does: the orbit reaches 82 moon units from the centre and the moon's own glow
 * another 22, against an orb radius of 54. In pixels that is
 * `(82 + 22) / 54 * 0.48 ≈ 0.92 · size` from the centre, so the drawing is about 1.85
 * times as wide as the box it is given.
 *
 * Nobody noticed while the orb stood in open space. In the head it stands next to the
 * app's name, and in "listen" the moon parks upper right — straight onto the "L" of
 * LearnBuddy (owner, 01.10.: "der header ist voll im arsch man").
 */
export const ORB_SPREAD = 1.85;

/** The width a slot must have so the moon never leaves it sideways. */
export function orbSlot(size: number): number {
  return Math.ceil(size * ORB_SPREAD);
}

/** The states in which the moon is saying something, not just being alive. */
const WORKING: ReadonlySet<MoonState> = new Set<MoonState>(['think', 'speak', 'listen']);

/**
 * Whether the moon moves.
 *
 * With reduce motion on, decoration stops — the idle drift is decoration. But "Buddy is
 * thinking" is **information**, and it is the only thing on the screen that says so. Every
 * platform keeps its activity indicator spinning under reduce motion for exactly that
 * reason, and so does this. WCAG 2.3.3 is about movement that carries nothing.
 */
export function orbMoves(breathe: boolean, reduced: boolean, state: MoonState): boolean {
  if (!breathe) return false;
  return !reduced || WORKING.has(state);
}
