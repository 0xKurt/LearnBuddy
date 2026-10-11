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
  dot: { size: 12, lowOpacity: 0.35 },
  statusDot: 10,
  rowHeight: SPACE.xl,
  statusHeight: 22,
  statusGap: 6,
  liveLines: 4,
  disabledOpacity: 0.6,
  pressedOpacity: 0.8,
  border: 1,
  iconRatio: { stop: 0.36, mic: 0.44 },
} as const;

export const MIC_RING_ROOM = Math.ceil((VOICE.face.lg * (VOICE.ring.scale - 1)) / 2);
