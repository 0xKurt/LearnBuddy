import { UI } from './components.js';
import { RADIUS } from './radius.js';
import { SPACE, TOUCH } from './space.js';

// Conversation presentation: each role has one consistent treatment (#548).
export const CHAT = {
  followSlack: SPACE.xl,
  reveal: { charactersPerSecond: 90 },
  marker: { orderedWidth: 18, bulletWidth: 12 },
  reading: {
    statusOffset: 1,
    minHeight: 60,
    thumbWidth: 30,
    thumbHeight: 38,
    thumbCorner: 5,
    thumbFrame: 2,
    leadingInset: 10,
    gap: 6,
    pageHeight: 58,
    glyph: 18,
    mark: 36,
    linkWidth: 12,
    linkHeight: 2,
    dot: 9,
    dotBorder: 1.5,
    doneOpacity: 0.5,
  },
  overlay: {
    closeInset: 40,
    swipeDistance: 48,
    swipeSpeed: 0.5,
    captureDistance: 8,
    travel: 400,
    fadeDistance: 160,
    closeTop: 8,
    closeRight: 2,
    glyph: 20,
    zIndex: 10,
    elevation: 12,
  },
  mine: { borderRadius: RADIUS.lg, paddingHorizontal: SPACE.lg, paddingVertical: 10 },
  tail: 6,
  failedBorder: 1,
  mineWidth: '82%' as const,
  /** A card of Buddy's takes the thread's whole width (components/practice/PracticeReady.jsx). */
  cardWidth: '100%' as const,
  /**
   * Buddy's line (components/buddy/Message.jsx:17–19): his mini orb beside the newest one, the
   * text 10 after it; an older line keeps the column empty. What hangs under a line — a receipt,
   * answer chips — starts where its text does (ui_kits/app/Chat.jsx:20, `paddingLeft: 36`).
   */
  orb: { size: 26, gap: 10, indent: 36 },
  /** Buddy is writing (components/buddy/Cards.jsx:96–103): a smaller orb and three still dots. */
  typing: { orb: 22, gap: SPACE.sm, dot: 6, dotGap: SPACE.xs, padX: SPACE.md, padY: 10 },
  typingDots: [0.4, 0.65, 0.9] as const,
  /**
   * "Zurücknehmen" under a turn (ui_kits/app/Gaps.jsx:83–85): a quiet line, 34 in. `reach` is
   * what its 44 pt target extends beyond the 20 pt line, above and below (handed back as margin).
   */
  takeBack: { inset: 34, icon: 16, gap: 6, reach: (TOUCH - 20) / 2 },
  /** A receipt's room above and below its words: a 20 pt line closes at the chip's 34 (`--chip-h`). */
  receiptPad: 6,
  /**
   * The one card for what Buddy puts into the thread (components/practice/PracticeReady.jsx
   * `PracticeReady` and `ChatCard`): a 48 pt tile with a 22 pt sign, two points between its
   * lines, 8 between its two actions; a page of hers lies 6 inside the tile.
   */
  card: { tile: 48, glyph: 22, lineGap: 2, actions: SPACE.sm },
  /**
   * A way to practise beyond question and answer — roleplay, rehearsing a talk — has the smaller
   * tile in its own tone (components/practice/Modes.jsx:10): 40 pt with a 20 pt sign.
   */
  modeCard: { tile: 40, glyph: 20 },
  pressedOpacity: UI.pressed.surface,
  pressedScale: 0.98,
  pendingOpacity: 0.8,
  titleGap: 2,
  longPress: 350,
  scrollThrottle: 64,
} as const;
