import { FORM_DENSITY } from './layout.js';

// Conversation-mode frame (design ui_kits/app/Talk.jsx:22–45); Orb/moon rendering and speech
// behavior stay shared (#548).
export const TALK = {
  glowHeight: 700,
  /** Between the orb and what stands under it (Talk.jsx:25). */
  groupGap: 36,
  compactBelow: FORM_DENSITY.compactBelow,
  stageSize: 150,
  /**
   * No design source: the stage on a window lower than `compactBelow` (the keyboard of a
   * browser, a split screen), where 150 would push the row of controls off the screen.
   */
  compactStageSize: 112,
  /** The stage of a roleplay, which shares the screen with its lines (ui_kits/app/Extra.jsx:190). */
  liveStageSize: 120,
  /** The status and the one line under the orb: their room and the gap between them (Talk.jsx:27). */
  captionHeight: 110,
  captionGap: 10,
  /**
   * The one line is a sentence. What is longer than this many lines scrolls inside its room
   * instead of pushing the controls off the screen; fewer on a window lower than `compactBelow`.
   */
  lineMax: 6,
  lineMaxCompact: 3,
  sideSize: 52,
  micHeight: 64,
  micPadding: 26,
  micGlyph: 22,
} as const;
