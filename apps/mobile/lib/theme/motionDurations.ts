// Pure timing specification shared by runtime and pure presentation algorithms.

/**
 * The design's three durations (tokens/motion.css `--dur-fast | --dur-base | --dur-slow`), with the
 * curve `EASE.standard` in motion.ts. Every transition the design draws is one of these.
 */
const DESIGN_DURATION = { quick: 140, base: 220, gentle: 420 } as const;

/**
 * Behavioural timings, not design durations: when something may arrive, how long a loop beats,
 * how far a reveal may lag. The design does not draw them; each keeps the number its place had
 * as a literal before the redesign (70068913, file named beside it).
 */
const TIMING = {
  /** Wait before the "thinking" line rises in (practice/Thinking). */
  practicePendingArrival: 120,
  /** Wait before a turn of the question's thread rises in (practice/ItemThread). */
  practiceTurnArrival: 60,
  /** One step of the nudge on a wrong answer (practice/Verdict). */
  verdictNudgeStep: 70,
  /** Cross-fade of a loaded picture, expo-image `transition` (practice/StimulusImage). */
  stimulusImageArrival: 90,
  /** Cross-fade of the large photo in the viewer, expo-image `transition` (lb/ZoomViewer). */
  zoomPhotoArrival: 120,
  /** Wait before "explain again" is offered (practice/Reexplain). */
  reexplainArrival: 350,
  /** Wait before the next turn of that exchange appears (practice/Reexplain). */
  reexplainReply: 200,
  /** Wait for the keyboard before a field is scrolled into view (app/memory). */
  keyboardReveal: 280,
  /** One beat of the microphone's pulse (voice/MicButton before the redesign; no caller today). */
  voicePulse: 1200,
  /** The furthest the word reveal may trail the voice (lib/buddy/reveal). */
  wordRevealLag: 700,
  /** Lead between a result heading and its first card (lb/ResultList). */
  resultCardLead: 60,
} as const;

/** One name for both, as every caller reads them (owner rule 6). */
export const DURATION = { ...DESIGN_DURATION, ...TIMING } as const;

/**
 * Buddy's orb keeps its own timing (#599 R2, owner rule 1): the values `quick`, `base` and the
 * standard curve had before the redesign. The app tokens above follow the design; the orb and its
 * moon (components/lb/BuddyOrb.tsx, lib/buddy/useMoon.ts) must not move with them.
 */
export const ORB_DURATION = { quick: 150, base: 240 } as const;
/** Control points of the orb's standard curve; the curve itself is `ORB_EASE` in motion.ts. */
export const ORB_EASE_STANDARD = [0.2, 0, 0, 1] as const;
