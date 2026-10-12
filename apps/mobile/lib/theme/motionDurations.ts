// Pure duration specification shared by runtime and pure presentation algorithms.
export const DURATION = {
  quick: 140,
  practicePendingArrival: 120,
  practiceTurnArrival: 60,
  verdictNudgeStep: 70,
  stimulusImageArrival: 90,
  zoomPhotoArrival: 120,
  reexplainArrival: 350,
  reexplainReply: 200,
  base: 220,
  gentle: 420,
  keyboardReveal: 280,
  voicePulse: 1200,
  recordingPulse: 700,
  wordRevealLag: 700,
  /** Legacy completion phases; live reduced motion skips their arrival delay. */
  summaryTitle: 260,
  summaryCard: 460,
  summaryLine: 140,
  summaryReview: 900,
  summaryActions: 900,
  /** Lead between the legacy result heading and its first card. */
  resultCardLead: 60,
} as const;

/**
 * Buddy's orb keeps its own timing (#599 R2, owner rule 1): the values `quick`, `base` and the
 * standard curve had before the redesign. The app tokens above follow the design; the orb and its
 * moon (components/lb/BuddyOrb.tsx, lib/buddy/useMoon.ts) must not move with them.
 */
export const ORB_DURATION = { quick: 150, base: 240 } as const;
/** Control points of the orb's standard curve; the curve itself is `ORB_EASE` in motion.ts. */
export const ORB_EASE_STANDARD = [0.2, 0, 0, 1] as const;
