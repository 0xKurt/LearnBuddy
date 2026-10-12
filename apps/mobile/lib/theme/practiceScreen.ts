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
  imageHeight: PRACTICE.imageHeight,
  imageRatio: 4 / 3,
  viewerHintTop: 58,
  viewerBottomRoom: 26,
  thumbnailSlop: 10,
  thumbnailPressed: UI.pressed.surface,
  viewerStartScale: 0.92,
  /** While the fingers are down a pinch may pass the range by this much; it springs back after. */
  pinchUnder: 0.8,
  pinchOver: 1.25,
  /** From here on the picture counts as zoomed: a drag moves it instead of closing the viewer. */
  zoomedFrom: 1.01,
  pullVeilDistance: 400,
  pullChromeDistance: 160,
  pullScaleDistance: 1600,
  pullVeilFade: 0.6,
  pullScaleShrink: 0.15,
} as const;
