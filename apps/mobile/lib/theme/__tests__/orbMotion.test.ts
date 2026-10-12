// Buddy's orb keeps the timing it had before the redesign (#599 R1/R2, owner rule 1): the app's
// motion tokens may follow the design, the orb's may not move with them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ORB_DURATION, ORB_EASE_STANDARD } from '../motionDurations.js';

const source = (path: string) => readFileSync(join(__dirname, '../../..', path), 'utf8');

describe("the orb's own motion tokens", () => {
  it('are the values of 70068913, whatever the app tokens are', () => {
    expect(ORB_DURATION).toEqual({ quick: 150, base: 240 });
    expect(ORB_EASE_STANDARD).toEqual([0.2, 0, 0, 1]);
    // Read as source: motion.ts needs the native runtime, and the test stub's bezier is linear.
    const motion = source('lib/theme/motion.ts');
    expect(motion).toContain('standard: Easing.bezier(...ORB_EASE_STANDARD),');
    // The spring is shared and unchanged; whoever changes it gives the orb its own first.
    expect(motion).toContain(
      'export const SPRING = { damping: 18, stiffness: 180, mass: 1 } as const;',
    );
  });

  it('are what the orb and its moon import, with the system reduce-motion hook', () => {
    const orb = source('components/lb/BuddyOrb.tsx');
    expect(orb).toContain(
      "import { ORB_DURATION as DURATION, ORB_EASE as EASE, SPRING } from '../../lib/theme/motion.js';",
    );
    expect(orb).toContain('const reduce = useReducedMotion();');
    expect(orb).not.toContain('useMotionReduced');
    expect(source('lib/buddy/useMoon.ts')).toContain(
      "import { ORB_DURATION as DURATION, ORB_EASE as EASE } from '../theme/motion.js';",
    );
  });
});
