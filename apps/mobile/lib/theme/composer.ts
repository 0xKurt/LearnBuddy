// Composer geometry; controls keep full touch targets even with a smaller visible face.
import { UI } from './components.js';

export const COMPOSER = {
  slot: UI.iconButton.composer,
  rows: { base: 1, tall: 3, roomy: 10, tight: 4 },
} as const;
