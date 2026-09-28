// The named palettes (issue #29, layer 1). A palette is the complete set of colour
// tokens; everything else in lib/theme derives from the active one.
//
// Curated, not free: the product must stay calm and friendly (docs/DESIGN-BRIEF.md), so
// a learner picks a palette, never a colour. Contrast pairs that carry meaning (text on
// paper, text on tints, a field's border) are checked per palette in
// lib/theme/__tests__/contrast.test.ts — a palette that fails there is not shipped.

export type Palette = {
  ink: string;
  ink2: string;
  ink3: string;
  /** Placeholder text (≥ 4.5:1 on paper and bg; ink3 is for hairlines). */
  placeholder: string;
  ink4: string;
  paper: string;
  bg: string;
  canvas: string;
  hairline: string;
  primary: string;
  primaryDk: string;
  primaryLt: string;
  /** The soft halo around a focused field (components/lb/LbTextInput.tsx). */
  ring: string;
  /** A text field's resting border: ≥ 3:1 on paper (WCAG 1.4.11). */
  field: string;
  /** The page seen through a hint laid over it (a file dragged over capture). */
  veil: string;
  success: string;
  warning: string;
  danger: string;
  /** Text on the pale success/warning tints (≥ 4.5:1). */
  successText: string;
  warningText: string;
  lavender: string;
  lavenderDeep: string;
  peach: string;
  peachDeep: string;
  mint: string;
  mintDeep: string;
  blush: string;
  blushDeep: string;
  sky: string;
  skyDeep: string;
  butter: string;
  butterDeep: string;
  rose: string;
  /** Shadows are part of the look: a dark palette needs a different cast. */
  shadowColor: string;
  /** How strong the two elevations are (soft, float) in this palette. */
  shadowOpacity: readonly [number, number];
  /** Figure ink for questions (components/math/FigureView.tsx). */
  figure: {
    grid: string;
    gridStrong: string;
    fill: string;
    fillSoft: string;
    series: readonly [string, string, string];
  };
};

/** "Pastell Soft" — the look the owner chose (2026-09-25); the default. */
const pastellSoft: Palette = {
  ink: '#1f1b2e',
  ink2: '#5d5873',
  ink3: '#8e89a3',
  placeholder: '#6f6a85',
  ink4: '#d4d0e2',
  paper: '#ffffff',
  bg: '#faf7fd',
  canvas: '#f1edf8',
  hairline: 'rgba(60,40,120,0.09)',
  primary: '#6a48d7',
  primaryDk: '#5335b5',
  primaryLt: '#ebe5fc',
  ring: 'rgba(106,72,215,0.22)',
  field: 'rgba(60,40,120,0.45)',
  veil: 'rgba(250,247,253,0.96)',
  success: '#6b8d6a',
  warning: '#b58a3c',
  danger: '#b1493c',
  successText: '#46663f',
  warningText: '#7d5a16',
  lavender: '#ece6fb',
  lavenderDeep: '#c9b8f3',
  peach: '#fbe3ee',
  peachDeep: '#f2b8d2',
  mint: '#dcf1ea',
  mintDeep: '#b3e0cf',
  blush: '#fae0ea',
  blushDeep: '#efb3c8',
  sky: '#e2ebfd',
  skyDeep: '#b7cbf5',
  butter: '#f6efdc',
  butterDeep: '#ddc995',
  rose: '#e6def6',
  shadowColor: '#4b3a8f',
  shadowOpacity: [0.08, 0.14],
  figure: {
    grid: 'rgba(20,15,30,0.09)',
    gridStrong: 'rgba(20,15,30,0.18)',
    fill: '#b9a4f0',
    fillSoft: 'rgba(106,72,215,0.14)',
    series: ['#6a48d7', '#2f7fb8', '#3f8a5c'],
  },
};

/** The same room at night: deep violet-grey, the same violet accent, lighter ink. */
const night: Palette = {
  ink: '#f3f0fb',
  ink2: '#bdb7d3',
  ink3: '#8b85a3',
  placeholder: '#a39dbb',
  ink4: '#3a3550',
  paper: '#232036',
  bg: '#191627',
  canvas: '#2b2742',
  hairline: 'rgba(220,210,255,0.14)',
  primary: '#9d82f5',
  primaryDk: '#b9a4ff',
  primaryLt: '#332c55',
  ring: 'rgba(157,130,245,0.30)',
  field: 'rgba(220,210,255,0.55)',
  veil: 'rgba(25,22,39,0.96)',
  success: '#7fae7c',
  warning: '#d6a95a',
  danger: '#e0776a',
  successText: '#a9d3a4',
  warningText: '#e8c583',
  lavender: '#332c55',
  lavenderDeep: '#5b4d93',
  peach: '#4a2f42',
  peachDeep: '#8c5a75',
  mint: '#25443c',
  mintDeep: '#4d8574',
  blush: '#472b3a',
  blushDeep: '#8f5972',
  sky: '#26334f',
  skyDeep: '#546d9e',
  butter: '#42381f',
  butterDeep: '#8d7942',
  rose: '#3a3155',
  shadowColor: '#000000',
  shadowOpacity: [0.3, 0.45],
  figure: {
    grid: 'rgba(220,210,255,0.12)',
    gridStrong: 'rgba(220,210,255,0.22)',
    fill: '#6f5bb8',
    fillSoft: 'rgba(157,130,245,0.20)',
    series: ['#b9a4ff', '#7fb6e6', '#87c79c'],
  },
};

/** An accent swap on the light palette: the calm stays, the violet turns. */
function accent(
  base: Palette,
  over: Pick<Palette, 'primary' | 'primaryDk' | 'primaryLt' | 'ring' | 'bg' | 'canvas'> & {
    figureFill: string;
    figureFillSoft: string;
  },
): Palette {
  return {
    ...base,
    primary: over.primary,
    primaryDk: over.primaryDk,
    primaryLt: over.primaryLt,
    ring: over.ring,
    bg: over.bg,
    canvas: over.canvas,
    figure: { ...base.figure, fill: over.figureFill, fillSoft: over.figureFillSoft },
  };
}

export const PALETTES = {
  pastellSoft,
  night,
  forest: accent(pastellSoft, {
    primary: '#2f7d5b',
    primaryDk: '#256149',
    primaryLt: '#e0f1e8',
    ring: 'rgba(47,125,91,0.22)',
    bg: '#f6fbf8',
    canvas: '#e9f4ee',
    figureFill: '#9fd0b6',
    figureFillSoft: 'rgba(47,125,91,0.14)',
  }),
  ocean: accent(pastellSoft, {
    primary: '#2a6ab0',
    primaryDk: '#20548c',
    primaryLt: '#e2edfb',
    ring: 'rgba(42,106,176,0.22)',
    bg: '#f6f9fe',
    canvas: '#e8f0fa',
    figureFill: '#a6c6ec',
    figureFillSoft: 'rgba(42,106,176,0.14)',
  }),
  sunset: accent(pastellSoft, {
    primary: '#b45a1f',
    primaryDk: '#8f4615',
    primaryLt: '#fdece0',
    ring: 'rgba(180,90,31,0.22)',
    bg: '#fdf8f4',
    canvas: '#f8ece3',
    figureFill: '#eebb8e',
    figureFillSoft: 'rgba(180,90,31,0.14)',
  }),
} satisfies Record<string, Palette>;

export type ThemeName = keyof typeof PALETTES;
export const THEME_NAMES = Object.keys(PALETTES) as ThemeName[];
export const DEFAULT_THEME: ThemeName = 'pastellSoft';

export function paletteOf(name: ThemeName | null | undefined): Palette {
  return PALETTES[name ?? DEFAULT_THEME] ?? PALETTES[DEFAULT_THEME];
}
