// Conversation-mode frame (design ui_kits/app/Talk.jsx:22–45); Orb/moon rendering and speech
// behavior stay shared (#548).
import { SPACE } from './space.js';

export const TALK = {
  /** Between the orb and what stands under it (Talk.jsx:25). */
  groupGap: 36,
  /**
   * Talk's own threshold, not the forms' (#599 correction): a whole 360×740 phone is no short
   * window. Header, the design's stage, status, `lineMax` lines and the row of controls need
   * about 560 pt, plus the insets of a phone (up to 80): only a window lower than this — a
   * keyboard, a split screen — gets the compact stage.
   */
  compactBelow: 640,
  stageSize: 150,
  /**
   * No design source: the stage on a window lower than `compactBelow`, where 150 would push the
   * row of controls off the screen — and the stage that gives way before an answer that arrived
   * whole is cut (the help answer, CLAUDE.md rule 18; components/voice/talkRoom.ts).
   */
  compactStageSize: 112,
  /** The stage of a roleplay, which shares the screen with its lines (ui_kits/app/Extra.jsx:190). */
  liveStageSize: 120,
  /**
   * Who Buddy plays, as the scene's pill under the orb (Extra.jsx:191): its padding, and the room
   * to the status under it.
   */
  rolePill: { padV: SPACE.sm, padH: SPACE.md, below: SPACE.md },
  /** Between the stage and the thread's tail under it; the tail brings its fade's room itself. */
  tailGap: SPACE.sm,
  /** The status and the one line under the orb: their room and the gap between them (Talk.jsx:27). */
  captionHeight: 110,
  captionGap: 10,
  /**
   * The one line is a sentence. What is longer than this many lines scrolls inside its room
   * instead of pushing the controls off the screen; fewer on a window lower than `compactBelow`.
   * Never the cap of an answer that arrived whole: that one takes all the room there is.
   */
  lineMax: 6,
  lineMaxCompact: 3,
  /** The row of controls: its side buttons stand this far from the edges (Talk.jsx:32). */
  rowInset: 28,
  sideSize: 52,
  micHeight: 64,
  micPadding: 26,
  micGlyph: 22,
} as const;
