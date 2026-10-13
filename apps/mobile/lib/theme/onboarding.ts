import { SPACE, TOUCH } from './space.js';

// The setup pages' chrome and fact lists (design ui_kits/app/Onboarding.jsx `OnbPage`).
/** The checkbox's own sizes (design components/core/Check.jsx): box, corner, tick. */
const CHECK_BOX = 24;
const CHECK_RADIUS = 8;
const CHECK_GLYPH = 16;
/** A fact's check and the gap to its sentence. */
const FACT_GLYPH = 18;

export const ONBOARDING = {
  orb: TOUCH,
  top: SPACE.md,
  heroTop: 20,
  bottom: SPACE.lg,
  footerBottom: 22,
  gap: SPACE.xl,
  heroGap: SPACE.md,
  /** A link under the facts starts where their sentences do, less its own inset (Onboarding.jsx:58). */
  policyIndent: FACT_GLYPH + SPACE.md - SPACE.xs,
  facts: { gap: 14, glyph: FACT_GLYPH, opticalTop: 2 },
  check: {
    box: CHECK_BOX,
    radius: CHECK_RADIUS,
    border: 1.5,
    pad: 10,
    opticalTop: -1,
    glyph: CHECK_GLYPH,
  },
} as const;
