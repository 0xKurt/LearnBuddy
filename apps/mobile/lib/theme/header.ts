// Header geometry shared by the shell and Buddy's conversation (#548).
import { orbSlot } from '../buddy/orbRoom.js';
import { SPACE, TOUCH } from './space.js';

export const HEADER = {
  orb: { brand: 30, page: 28 },
  band: TOUCH,
  height: TOUCH + SPACE.xs,
  paddingTop: SPACE.xs,
  gap: { brand: 10, page: SPACE.sm },
  orbOffset: { brand: -SPACE.md, page: -SPACE.sm },
  glow: 260,
} as const;

export function headerOrbSlot(brand: boolean): number {
  return orbSlot(brand ? HEADER.orb.brand : HEADER.orb.page);
}
