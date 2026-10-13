import { UI } from './components.js';
import { COMPOSER } from './composer.js';
import { SPACE } from './space.js';

/** Recording controls share geometry and pulse timing across dictation surfaces. */
export const VOICE = {
  face: { sm: COMPOSER.slot, md: 56, lg: 72 },
  ring: {
    scale: 1.45,
    stillScale: 1.18,
    stillOpacity: 0.6,
    opacity: 0.7,
    border: 3,
  },
  dot: { size: 12 },
  statusDot: 10,
  rowHeight: SPACE.xl,
  statusHeight: 22,
  statusGap: 6,
  liveLines: 4,
  disabledOpacity: UI.disabledOpacity,
  pressedOpacity: UI.pressed.voice,
  border: UI.border,
  iconRatio: { stop: 0.36, mic: 0.44 },
  /** The Composer's mic: the glyph of every 40 pt slot control (components/core/Btn.jsx `IconBtn`). */
  slotGlyph: UI.iconButton.glyph,
} as const;

export const MIC_RING_ROOM = Math.ceil((VOICE.face.lg * (VOICE.ring.scale - 1)) / 2);
