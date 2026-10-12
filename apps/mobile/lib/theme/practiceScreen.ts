import { paletteOf } from './palettes.js';
import { RADIUS } from './radius.js';
import { UI } from './components.js';
import { PRACTICE } from './practice.js';
import { SPACE, TOUCH } from './space.js';

const rhythmPadMin = 2 * TOUCH;

/** Practice feedback and the existing image viewer's presentation geometry. */
export const PRACTICE_SCREEN = {
  speakerGlyph: PRACTICE.actionIcon,
  evidenceGlyph: PRACTICE.essaySignIcon,
  evidenceRule: UI.border,
  rhythmPadPreferred: 3 * TOUCH,
  rhythmPadMin,
  rhythmAnswerMin: TOUCH + SPACE.sm + rhythmPadMin,
  markedPassageMin: 4 * TOUCH,
  pendingPill: 32,
  pendingDot: 6,
  pendingGap: 5,
  verdictGap: 6,
  fadedOpacity: 0.7,
  verdictRadius: RADIUS.round,
  verdictPadding: SPACE.md,
  verdictPaddingVertical: SPACE.xs,
  verdictIcon: 14,
  nudgeOffsets: [-7, -4, -2] as const,
  imageHeight: 180,
  imageRatio: 4 / 3,
  viewerVeil: '#15121f',
  get viewerHint() {
    return paletteOf('pastellDark').ink2;
  },
  viewerHintTop: 58,
  viewerBottomRoom: 26,
  thumbnailSlop: 10,
  thumbnailPressed: 0.85,
  viewerStartScale: 0.92,
  pullVeilDistance: 400,
  pullChromeDistance: 160,
  pullScaleDistance: 1600,
  pullVeilFade: 0.6,
  pullScaleShrink: 0.15,
} as const;
