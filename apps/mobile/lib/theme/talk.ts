import { FORM_DENSITY } from './layout.js';
import { SPACE } from './space.js';

// Conversation-mode frame; Orb/moon rendering and speech behavior stay shared (#548).
export const TALK = {
  glowHeight: 700,
  groupGap: SPACE.xl,
  compactBelow: FORM_DENSITY.compactBelow,
  stageSize: 150,
  compactStageSize: 112,
  captionHeight: 60,
  hintGap: 1,
  sideSize: 52,
  micHeight: 64,
  micPadding: 26,
  micGlyph: 22,
} as const;
