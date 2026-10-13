// The Composer's geometry (design components/composer/Composer.jsx). Every control keeps a full
// 44 pt touch target; what it reaches beyond its visible face is handed back as margin (`reach`),
// so the box is laid out by the faces.
import { UI } from './components.js';
import { TOUCH } from './space.js';

/** The tool row's controls: + · camera · mic · the primary slot. */
const SLOT = UI.iconButton.composer;
/** A key between her text and the tools. */
const KEY = 38;
/** The mode chip ("Formel", "Rechnen", "Chemie"). */
const MODE = 32;
/** Her one line of text with its padding above and below (8 + 23 + 6). */
const TEXT = 37;

const reach = (face: number) => (TOUCH - face) / 2;

export const COMPOSER = {
  slot: SLOT,
  slotReach: reach(SLOT),
  rows: { base: 1, tall: 3, roomy: 10, tight: 4 },
  /** Help chips above the box, the box's own padding, text · keys · tools, and tool to tool. */
  chipsGap: 10,
  pad: 8,
  gap: 4,
  toolGap: 6,
  text: { height: TEXT, reach: reach(TEXT) },
  /** "Prüfen" / "Weiter": the word, then its sign. */
  pill: { padStart: 16, padEnd: 12, gap: 6, icon: 18 },
  key: { height: KEY, reach: reach(KEY), padY: 2, selectedBorder: UI.selectedBorder },
  mode: { height: MODE, reach: reach(MODE), padStart: 10, padEnd: 12, gap: 6, icon: 18 },
  count: { padStart: 4 },
} as const;
