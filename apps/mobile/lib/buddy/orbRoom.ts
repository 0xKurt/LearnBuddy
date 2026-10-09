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
const ORB_SPREAD = 1.85;

/** The width a slot must have so the moon never leaves it sideways. */
export function orbSlot(size: number): number {
  return Math.ceil(size * ORB_SPREAD);
}

/**
 * Whether the moon moves. It does, unless the caller asked for a still one.
 *
 * This deliberately ignores the system's reduce-motion setting, and that was an owner
 * decision, twice stated (01.10.): "auch keine idle animation", then "der mond bewegt sich
 * trotzdem nicht. wenn die app nichts tut gibts ja den idle zustand."
 *
 * The case for honouring the setting was: the idle drift carries no information, so it is
 * decoration, and decoration stops. The case against — his — is that Buddy is not
 * decoration on his own screen: a frozen Buddy reads as a broken app, which is the
 * opposite of calm. The moon is one small element that neither translates the page nor
 * parallaxes; it is the app's heartbeat.
 *
 * Everything else still obeys the setting: entering cards and messages cross-fade instead
 * of rising, lists re-order without gliding (lib/theme/enter.ts, issue #126). This is the
 * one exception, made on purpose and written down here so the next person sees why.
 *
 * `reduced` stays in the signature: it is what the exception is about, and the test holds
 * the promise that it changes nothing.
 */
export function orbMoves(breathe: boolean, _reduced: boolean, _state: MoonState): boolean {
  return breathe;
}
