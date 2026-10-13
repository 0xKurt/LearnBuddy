import { SPACE, TOUCH } from './space.js';

// Onboarding chrome and fact lists, including the existing defaults for unmigrated callers.
const BADGE = 26;
/** The checkbox's own sizes (design components/core/Check.jsx): box, corner, tick. */
const CHECK_BOX = 24;
const CHECK_RADIUS = 8;
const CHECK_GLYPH = 16;

export const ONBOARDING = {
  orb: TOUCH,
  top: SPACE.md,
  heroTop: 20,
  bottom: SPACE.lg,
  footerBottom: 22,
  gap: SPACE.xl,
  heroGap: SPACE.md,
  policyIndent: BADGE,
  facts: { gap: 14, glyph: 18, opticalTop: 2 },
  check: {
    box: CHECK_BOX,
    radius: CHECK_RADIUS,
    border: 1.5,
    pad: 10,
    opticalTop: -1,
    glyph: CHECK_GLYPH,
  },
  legacyFacts: { badge: BADGE, glyph: 15, opticalTop: -1 },
} as const;
