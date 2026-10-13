// The system states' own measures (#599, owner rule 4): the skeletons, the toast, the empty and
// the loading state, the developer's note. Their look is the one from before the redesign
// (implementation/MIGRATION.md §5: "unverändert, nur neue Tokens") — each number here is the
// literal its component carried, under a name.
import { TOUCH } from './space.js';

/** A bone as tall as `height`, its ends round unless a corner is given. */
const bone = (height: number, radius: number = height / 2) => ({ height, radius });

export const SKELETON = {
  /** One sweep across a block, then a short rest: slow enough to feel calm. */
  sweepMs: 1400,
  /** How wide the light is, relative to the block, and how bright at its middle. */
  light: 0.7,
  lightPeak: 0.7,
  /** A block without a corner of its own. */
  radius: 10,
  /** A line of text, by the size of the words it stands for. */
  text: {
    tiny: bone(10),
    tag: bone(11, 6),
    meta: bone(12),
    intro: bone(13),
    label: bone(14),
    name: bone(15, 7),
    heading: bone(16),
    title: bone(18),
    greeting: bone(22),
  },
  /** A few lines under each other, and how far apart: as text runs, as a question, in a bubble. */
  lineGap: 9,
  questionLineGap: 10,
  lastLine: '62%',
  /** A control: a pill button, a round button, the CTA, the input bar, the progress bar. */
  pill: bone(40),
  touch: bone(TOUCH),
  cta: bone(54),
  bar: bone(56),
  progress: bone(8),
  /** Buddy's small orb beside a bubble, and a subject's dot. */
  orb: bone(26),
  dot: bone(10),
  /** How wide a block with a known width is: by what it stands for, or by length where several share it. */
  width: {
    dotLabel: 70,
    shortPill: 72,
    short: 84,
    tag: 90,
    medium: 110,
    eyebrow: 120,
    longPill: 128,
    long: 150,
    startLabel: 52,
  },
  /** The practice progress row to the card under it. */
  progressGap: 10,
  /** A tinted card (the question, a memory): the padding its bones were drawn with (18, not a card's 20), and the question card's own corner. */
  tintPad: 18,
  questionRadius: 24,
  questionGap: 14,
  tagGap: 10,
  /** One of Buddy's bubbles: its inner room and the corner tucked in beside the orb. */
  bubblePad: 14,
  bubbleTuck: 6,
  /** In a library card: the mark to its name, and its two pills. */
  markGap: 14,
  pillGap: 10,
  /** The memory page's intro to its entries; the greeting under the home's head. */
  introGap: 22,
  greetingTop: 18,
} as const;

export const TOAST = {
  /** Round at one line (13 + 21 + 13), a soft box at two. */
  radius: 26,
  padY: 13,
  maxWidth: 520,
  words: { fontSize: 15, lineHeight: 21 },
  /** The round "!" of an error. */
  mark: 22,
  markSign: { fontSize: 14, lineHeight: 18 },
} as const;

export const EMPTY_STATE = {
  orb: 64,
  /** A step above the title role: the one line the empty screen has to say. */
  title: { fontSize: 20, lineHeight: 26 },
  bodyWidth: 320,
  /** The way on, set this much further from the lines above it. */
  actionGap: 6,
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
