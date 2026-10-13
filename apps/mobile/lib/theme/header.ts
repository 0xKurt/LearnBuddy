// Header geometry shared by the shell and Buddy's conversation (#548), as the design draws it
// (components/buddy/Header.jsx): the orb is 30 beside the bare brand title and 28 beside a page
// title; its slot is 1.85 × that (lib/buddy/orbRoom.ts), pulled left by 8 next to a back or
// close button and by 12 where the orb leads the row.
import { orbSlot } from '../buddy/orbRoom.js';
import { SPACE, TOUCH } from './space.js';

export const HEADER = {
  orb: { brand: 30, page: 28 },
  band: TOUCH,
  height: TOUCH + SPACE.xs,
  paddingTop: SPACE.xs,
  gap: { brand: 10, page: SPACE.sm },
  /** How far the orb's slot moves left: by what stands before it, not by the title's weight. */
  orbOffset: { leading: -SPACE.sm, bare: -SPACE.md },
} as const;

/** The brand head: a title alone, with neither a line under it nor a way back before it. */
export function headerIsBrand(head: { subtitle?: string; leading?: unknown }): boolean {
  return !head.subtitle && !head.leading;
}

export function headerOrbSlot(brand: boolean): number {
  return orbSlot(brand ? HEADER.orb.brand : HEADER.orb.page);
}
