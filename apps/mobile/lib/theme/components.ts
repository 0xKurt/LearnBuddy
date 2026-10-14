import type { ViewStyle } from 'react-native';

import type { Palette } from './palettes.js';
import { TOUCH } from './space.js';
import { TYPE } from './type.js';

// Shared component geometry and interaction treatment (redesign, #548).
const inputLine = () => TYPE.input.lineHeight;

/**
 * The one place a pressed thing's opacity is written; chat, practice and voice name theirs from
 * here. The design's press state is scale .97 alone (readme.md "States"): whether these stay is
 * decided with the components that read them (#599).
 */
const PRESSED = { link: 0.6, control: 0.78, voice: 0.8, surface: 0.85 } as const;
/** `--chip-h`. */
const CHIP_HEIGHT = 34;

export const UI = {
  icon: { defaultSize: 22, stroke: 1.7, boldStroke: 2.2 },
  pressed: PRESSED,
  textLink: { pressedOpacity: PRESSED.link },
  /** A resting boundary, a selected one (readme.md "States": 2 px primary). */
  border: 1,
  selectedBorder: 2,
  /** Disabled is 45 % everywhere (readme.md "States"). */
  disabledOpacity: 0.45,
  busyOpacity: 0.8,
  // React Native Android ProgressBar small/large intrinsic dimensions.
  busyIndicator: { small: 20, large: 36 },
  pressScale: 0.97,
  pressedOpacity: PRESSED.control,
  fontScale: 2,
  minimumFontScale: 0.82,
  button: { pad: 22, icon: 18, compactIcon: 24, compactGlyph: 18, maxLines: 2 },
  field: {
    height: 52,
    get line() {
      return inputLine();
    },
    centeredPadding: (height: number) => (height - inputLine()) / 2,
    labelGap: 6,
    maxRows: 5,
    composerHorizontal: 10,
    composerBottom: 6,
    toggleIcon: 20,
    clearIcon: 18,
  },
  iconButton: { glyph: 20, actionGlyph: 22, composer: 40 },
  /** components/core/List.jsx: a row of at least 56 with 10 above and below, 2 between its lines. */
  list: {
    row: 56,
    padY: 10,
    lineGap: 2,
    tile: 36,
    tileIcon: 18,
    icon: 20,
    more: 22,
    chevron: 18,
    /**
     * Beside a value the title keeps its own width (List.jsx: the value is `flex: none`, the
     * design's are short) — up to this share of the row, so a long value still has room to wrap.
     */
    titleShare: '60%',
    /** The quiet action in the chevron's place (ui_kits/app/Library.jsx `RowAction`). */
    action: { height: 32, padStart: 14, padEnd: 12, icon: 15 },
  },
  chip: {
    height: CHIP_HEIGHT,
    icon: 16,
    /** The glyph at a receipt's end (components/core/core.card.html: undo at 15). */
    endIcon: 15,
    gap: 6,
    pad: 14,
    iconPad: 10,
    paperOpacity: 0.88,
    /** What the 44 pt target reaches beyond the 34 pt chip, above and below (handed back as margin). */
    reach: (TOUCH - CHIP_HEIGHT) / 2,
  },
  segmented: { visible: 36 },
  /** The switch at a row's end (ui_kits/app/Flows.jsx `Toggle`): a 52×32 track, a 26 knob. */
  toggle: { width: 52, height: 32, pad: 3, knob: 26 },
  /**
   * The seven day tiles (Flows.jsx `Times`): 44 high, 6 apart. Each target stays 44 wide on a
   * 360 pt phone by reaching `bleed` into the row's side padding; the tile drawn inside it keeps
   * `inset` on either side, so two tiles stand 6 apart.
   */
  day: { height: TOUCH, inset: 3, bleed: 6 },
  progress: { height: 4, legacyHeight: 6, currentPart: 0.5 },
  sheet: {
    maxFraction: 0.92,
    veilOpacity: 0.28,
    radius: 28,
    handleWidth: 36,
    handleHeight: 5,
    handleRadius: 3,
    topPad: 10,
    /** components/core/Sheet.jsx: `padding: 10px 16px 30px`; a home indicator may ask for more. */
    bottomPad: 30,
    travel: 0.9,
    dragResistance: 0.15,
    gestureStart: 8,
    gestureFail: 24,
  },
  entrance: { staggerCap: 4, slide: 28, slowMultiplier: 2, maxRows: 8, windowMs: 900 },
  /** A gap of a cloze: as wide as its word (per letter), within these bounds; dashed while empty. */
  slot: { minWidth: 64, maxWidth: 220, letter: 9.5, dashed: 1.5 },
  /** A folded thing's one line: its sign and the chevron after its action. */
  fold: { icon: 18, chevron: 16 },
  /** The fade at a scrolling edge: one line of type tall, still 70 % of the ground at 35 %. */
  edgeFade: { height: 28, mid: 0.35, midOpacity: 0.7 },
  /**
   * The hand-off from the native splash: its image width (app.json → expo-splash-screen →
   * imageWidth), the ball's radius on that picture's canvas (285 of 1024), how far the orb
   * shrinks as it settles, and the layer it lies on.
   */
  splash: { imageWidth: 200, ball: 285 / 1024, settle: 0.14, layer: 1000 },
} as const;

/**
 * A title beside its value in one row (#599): the title keeps its own width up to its share and
 * is never squeezed; the rest of the row is the value's — a short one ends at the row's edge, a
 * long one wraps there. One pattern for a list row's value and a result row's state.
 */
export const ROW_SPLIT = {
  title: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', maxWidth: UI.list.titleShare },
  value: { flexGrow: 1, flexShrink: 1, textAlign: 'right' },
} as const;

const REST: ViewStyle = {};
const DIP: ViewStyle = { transform: [{ scale: UI.pressScale }] };
const DIM: ViewStyle = { opacity: PRESSED.control };

/**
 * How a design control answers a finger (readme.md "States": press = scale .97, nothing else).
 * With Reduce Motion the dip is off, and the press dims instead — as it did before the redesign —
 * so the control never stays mute under a finger.
 *
 * The View that wears it carries `collapsable={false}`: at rest this style is empty, and Android
 * would flatten the view between press-in and press-out — moving its label to another native
 * parent while the screen may be leaving, which crashed the app (#631, `pressFace.test.ts`).
 */
export function pressedStyle(pressed: boolean, reduced: boolean): ViewStyle {
  return pressed ? (reduced ? DIM : DIP) : REST;
}

export type ChipTone = 'default' | 'receipt' | 'gray' | 'primary' | 'success' | 'warning' | 'dark';

/** Chip surfaces are palette roles; only the default paper surface is translucent. */
export function chipSkin(p: Palette, tone: ChipTone, selected: boolean, opaque: boolean) {
  if (selected) return { bg: p.primaryLt, color: p.primaryDk, border: 'transparent' };
  const paper = opaque ? p.paper : translucentPaper(p.paper);
  const tones: Record<ChipTone, { bg: string; color: string; border?: string }> = {
    default: { bg: paper, color: p.ink, border: p.hairlineStrong },
    receipt: { bg: p.canvas, color: p.ink, border: p.hairlineStrong },
    // Existing explicit semantic tones stay compatible until their caller migrations.
    gray: { bg: p.canvas, color: p.ink2 },
    primary: { bg: p.primaryLt, color: p.primaryDk },
    success: { bg: p.canvas, color: p.successText },
    warning: { bg: p.canvas, color: p.warningText },
    dark: { bg: p.ink, color: p.paper },
  };
  return tones[tone];
}

function translucentPaper(hex: string): string {
  const rgb = Number.parseInt(hex.slice(1), 16);
  return `rgba(${rgb >> 16},${(rgb >> 8) & 255},${rgb & 255},${UI.chip.paperOpacity})`;
}
