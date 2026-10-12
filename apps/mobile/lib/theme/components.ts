import type { Palette } from './palettes.js';
import { TYPE } from './type.js';

// Shared component geometry and interaction treatment (redesign, #548).
const inputLine = () => TYPE.input.lineHeight;

export const UI = {
  icon: { defaultSize: 22, stroke: 1.7, boldStroke: 2.2 },
  textLink: { pressedOpacity: 0.6 },
  border: 1,
  selectedBorder: 2,
  disabledOpacity: 0.45,
  busyOpacity: 0.8,
  // React Native Android ProgressBar small/large intrinsic dimensions.
  busyIndicator: { small: 20, large: 36 },
  pressScale: 0.97,
  pressedOpacity: 0.78,
  fontScale: 2,
  minimumFontScale: 0.82,
  button: { pad: 22, icon: 18, compactIcon: 24, compactGlyph: 18 },
  field: {
    height: 52,
    get line() {
      return inputLine();
    },
    centeredPadding: (height: number) => (height - inputLine()) / 2,
    labelGap: 6,
    maxRows: 5,
    toolGap: 2,
    composerHorizontal: 10,
    composerBottom: 6,
    toggleIcon: 20,
    clearIcon: 18,
  },
  iconButton: { glyph: 20, actionGlyph: 22, composer: 40 },
  list: { row: 56, tile: 36, icon: 22, chevron: 18, trailing: 32 },
  chip: { height: 34, icon: 16, gap: 6, pad: 14, iconPad: 10, paperOpacity: 0.88 },
  segmented: { visible: 36 },
  progress: { height: 4, legacyHeight: 6, currentPart: 0.5 },
  sheet: {
    maxFraction: 0.92,
    veilOpacity: 0.28,
    radius: 28,
    handleWidth: 36,
    handleHeight: 5,
    handleRadius: 3,
    topPad: 10,
    travel: 0.9,
    dragResistance: 0.15,
    gestureStart: 8,
    gestureFail: 24,
  },
  entrance: { staggerCap: 4, slide: 28, slowMultiplier: 2, maxRows: 8, windowMs: 900 },
} as const;

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
