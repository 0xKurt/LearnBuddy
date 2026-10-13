// The system states' own measures (#599, owner rule 4): the skeletons, the full-screen state, the
// toast, the banner, the loading state, the developer's note. Their look is the design's
// (components/core/States.jsx; owner 12.10.: the design decides how it looks). Where a bone stands
// in for something a loaded screen draws, its place comes from that screen's own tokens
// (components/lb/Skeletons.tsx) — only what the design alone decides has its number here.
import { SPACE, TOUCH } from './space.js';

export const SKELETON = {
  /** States.jsx:9,18 — `lb-pulse 1.4s ease-in-out infinite`: opacity 1 → .55 → 1. */
  pulseMs: 1400,
  pulseLow: 0.55,
  /** CSS `ease-in-out` as control points. */
  pulseEase: [0.42, 0, 0.58, 1],
  /** A bone without a corner of its own (States.jsx:8). */
  radius: 8,
  /**
   * How tall a bone is, by the words it stands for (States.jsx:15,20,22,26): a quiet line, a
   * row's name, running text, the question.
   */
  line: { meta: 11, row: 13, text: 16, question: 18 },
  /** Bones under each other in a card (States.jsx:14), and lines with no text box to sit in (:20). */
  cardGap: 10,
  lineGap: SPACE.sm,
  /** The button in one of Buddy's cards (States.jsx:22): 120 wide, 40 high, round. */
  button: { width: 120, height: 40 },
  /**
   * How much of its row a bone takes (States.jsx:15,20–22,26,29). They differ on purpose, so the
   * bones read as text and not as a grid.
   */
  width: {
    label: '30%',
    meta: '35%',
    bubble: '45%',
    setting: '45%',
    name: '55%',
    short: '60%',
    answer: '65%',
    title: '70%',
    long: '80%',
    question: '90%',
  },
  /** The rows of a list while it loads (States.jsx:24) and a settings page's two groups (:29). */
  rows: 4,
  settingsGroups: [3, 2],
  /** The answers under a practice question (States.jsx:27), and the cards of a sheet's questions. */
  options: 4,
  cards: 3,
} as const;

/**
 * The full-screen state (States.jsx:45–52 `StateScreen`): Buddy at 64, one bold line (800 22/28),
 * one sentence (400 15/22, at most 300 wide), 14 between them, 40 above and below and 24 at the
 * sides; the way on stands 6 further down.
 */
export const STATE_SCREEN = {
  orb: 64,
  gap: 14,
  padY: 40,
  padX: SPACE.xl,
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyWidth: 300,
  actionGap: 6,
} as const;

/**
 * The toast (States.jsx:60–62): an ink pill at least 44 high, 14 before its words (600 14) and 6
 * after its offer, 10 between its parts. The offer is 700 14 with 12 at its sides — in a full
 * 44 pt box of its own, because the web knows no `hitSlop` and "Rückgängig" can be the only way
 * back (#599). A 20 pt line with `padY` closes one line at exactly 44; a longer message grows.
 */
export const TOAST = {
  minHeight: TOUCH,
  padStart: 14,
  padEnd: 6,
  /** What stands after the words when there is no offer (`<span style={{ width: 8 }}>`). */
  endRoom: SPACE.sm,
  gap: 10,
  maxWidth: 520,
  words: { fontSize: 14, lineHeight: 20 },
  padY: SPACE.md,
  offerPad: SPACE.md,
  /** The round "!" of an error: not the design's, kept so an error is never colour alone. */
  mark: 22,
  markSign: { fontSize: 14, lineHeight: 18 },
} as const;

/**
 * The banner (States.jsx:70): at least 36 high, 8 above and below, 16 at the sides, 600 13/18,
 * its words in the middle. Under the head it runs from edge to edge; as a note inside a sheet or
 * beside a card it keeps the corner it had.
 */
export const BANNER = {
  minHeight: 36,
  padY: SPACE.sm,
  padX: SPACE.lg,
  words: { fontSize: 13, lineHeight: 18 },
} as const;

/**
 * An empty or gone page inside the app (ui_kits/app/Gaps.jsx `Empty`): Buddy stays in the head,
 * the content is one quiet block at the start edge — a bold line (800 26/32), a sentence, one
 * action — set a little above the middle by the room under it.
 */
export const EMPTY_STATE = {
  page: { head: { fontSize: 26, lineHeight: 32, letterSpacing: -0.6 }, bottom: 80 },
} as const;

export const LOADING_STATE = {
  /** A quick load is over before anything shows. */
  showAfterMs: 250,
  breathMs: 1600,
  orb: 56,
  /** The label in a column narrower than the page. */
  padX: 28,
  /** The orb's breath: from this opacity and scale, by this much. */
  dim: 0.75,
  dimSpan: 0.25,
  scale: 0.94,
  scaleSpan: 0.08,
} as const;

/** The developer's note: tiny on purpose, never in a release build. */
export const DEV_NOTE = {
  shownMs: 6000,
  padX: 9,
  padY: 2,
  fontSize: 10,
} as const;
