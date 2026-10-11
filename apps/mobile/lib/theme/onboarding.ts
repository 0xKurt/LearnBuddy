import { SPACE, TOUCH } from './space.js';

// Onboarding chrome and fact lists, including the existing defaults for unmigrated callers.
const BADGE = 26;

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
  check: { box: SPACE.xl, radius: SPACE.sm, border: 1.5, pad: 10, opticalTop: -1, glyph: SPACE.lg },
  legacyOrb: { compact: 64, roomy: 72 },
  legacyFacts: { badge: BADGE, glyph: 15, opticalTop: -1 },
} as const;
