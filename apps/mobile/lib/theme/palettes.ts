// The named palettes (issue #29, layer 1). A palette is the complete set of colour
// tokens; everything else in lib/theme derives from the active one.
//
// Curated, not free: the product must stay calm and friendly (docs/DESIGN-BRIEF.md), so
// a learner picks a palette, never a colour. Contrast pairs that carry meaning (text on
// paper, text on tints, a field's border) are checked per palette in
// lib/theme/__tests__/contrast.test.ts — a palette that fails there is not shipped.

/** One of the three soft blobs behind a screen (components/lb/Glow.tsx). */
export type GlowStop = { color: string; opacity: number };

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
  /**
   * The soft light behind a screen (blue, lilac, pink), in that order. A palette owns it
   * because a dark one needs its OWN tones, not dimmed light ones: until issue #124 the
   * three pastels were hardcoded in the component and washed the night palette out.
   */
  glow: readonly [GlowStop, GlowStop, GlowStop];
  /**
   * Buddy's own light: the halo around him, and the pool he stands in on the talk screen
   * (base, blue, pink). Hardcoded until issue #139, which put a near-white disc at full
   * opacity on the night palette's near-black ground — a smudge, not a glow. A light in a
   * dark room is coloured, and much fainter.
   */
  buddyLight: {
    halo: GlowStop;
    stage: readonly [GlowStop, GlowStop, GlowStop];
  };
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
    /**
     * Charts (issues #245, #246). A climate chart's temperature line and precipitation
     * columns in the atlas colours (red, blue; `wetDeep` is the compressed part above
     * 100 mm), and the slices of a pie — numbered on the drawing, so colour is never the
     * only signal.
     */
    warm: string;
    wet: string;
    wetDeep: string;
    /** A map's mountain ranges (#429), in the atlas brown; rivers take `wetDeep`. */
    relief: string;
    slices: readonly string[];
    /**
     * Euro coins (issue #254), schematic: copper (1–5 ct), brass (10–50 ct), silver (the
     * other metal of 1 € and 2 €). The value is written on every coin, so colour is never the
     * only signal.
     */
    coins: readonly [string, string, string];
    /**
     * Itten's twelve hues (issue #261), clockwise from yellow. The subject IS the colour here,
     * so these are the one place a figure shows strong colour; every field also carries its name
     * in words. The dark set is lighter where a deep tone would sink into the dark card.
     */
    hues: readonly string[];
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
  // Exactly what Glow.tsx used to hardcode, so the light look does not move (issue #124).
  glow: [
    { color: '#cfdcff', opacity: 0.9 },
    { color: '#e3d6ff', opacity: 0.95 },
    { color: '#ffd6ea', opacity: 0.9 },
  ],
  // Likewise exactly what BuddyOrb and TalkOrb used to hardcode (issue #139).
  buddyLight: {
    halo: { color: '#ffffff', opacity: 0.95 },
    stage: [
      { color: '#efe6ff', opacity: 1 },
      { color: '#e3e9ff', opacity: 0.9 },
      { color: '#fde3f0', opacity: 0.9 },
    ],
  },
  shadowColor: '#4b3a8f',
  shadowOpacity: [0.08, 0.14],
  figure: {
    grid: 'rgba(20,15,30,0.09)',
    gridStrong: 'rgba(20,15,30,0.18)',
    fill: '#b9a4f0',
    fillSoft: 'rgba(106,72,215,0.14)',
    series: ['#6a48d7', '#2f7fb8', '#3f8a5c'],
    warm: '#c8473b',
    wet: '#8fb9e8',
    wetDeep: '#3f6fa8',
    relief: '#d6bf9c',
    slices: [
      '#b9a4f0',
      '#9cc7ec',
      '#a6d8b9',
      '#f5c48f',
      '#f2a7c3',
      '#e3d37a',
      '#c9b8a6',
      '#9fd6d6',
    ],
    coins: ['#e2ab86', '#ecd081', '#d9dce3'],
    hues: [
      '#f6d53a',
      '#f6ad2a',
      '#ee8128',
      '#e5562a',
      '#c92a3c',
      '#b02c74',
      '#82399c',
      '#4e4bb6',
      '#2a6cc0',
      '#178f8c',
      '#3a9e48',
      '#9cc43a',
    ],
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
  // Its own tones, not dimmed light ones: deep and saturated at low opacity, so they LIFT
  // the ground (#191627) instead of covering it. The low opacity also does most of the work
  // against the banding the owner saw — a long fade from a bright colour to nothing is what
  // shows rings on an 8-bit panel (issue #124).
  glow: [
    { color: '#2f4d96', opacity: 0.38 },
    { color: '#5a41a6', opacity: 0.42 },
    { color: '#8e3a69', opacity: 0.3 },
  ],
  // A light in a dark room is coloured and far fainter than one in a bright one: a lilac
  // bloom that lifts the ground, and a pool in deep violet instead of near-white (#139).
  buddyLight: {
    halo: { color: '#c3aeff', opacity: 0.4 },
    stage: [
      { color: '#33285c', opacity: 0.95 },
      { color: '#2a3568', opacity: 0.8 },
      { color: '#4e2a49', opacity: 0.8 },
    ],
  },
  shadowColor: '#000000',
  shadowOpacity: [0.3, 0.45],
  figure: {
    grid: 'rgba(220,210,255,0.12)',
    gridStrong: 'rgba(220,210,255,0.22)',
    fill: '#6f5bb8',
    fillSoft: 'rgba(157,130,245,0.20)',
    series: ['#b9a4ff', '#7fb6e6', '#87c79c'],
    warm: '#f08a7e',
    wet: '#3d6894',
    wetDeep: '#8fbcef',
    relief: '#7a6448',
    slices: [
      '#6f5bb8',
      '#3f74a6',
      '#3f8a5c',
      '#a8703d',
      '#a8566f',
      '#8f8339',
      '#7a6a5c',
      '#3f8a8a',
    ],
    coins: ['#8f5d40', '#9a8236', '#7c818c'],
    hues: [
      '#f2d24a',
      '#f2aa3a',
      '#ef8740',
      '#ec5f3e',
      '#d43a52',
      '#cf5596',
      '#a965cc',
      '#7d7fe0',
      '#4f97e0',
      '#36b2aa',
      '#55b866',
      '#aacb50',
    ],
  },
};

/**
 * An accent swap: the calm stays, the hue turns. The same swap applies to the light base
 * and to the dark one, which is what makes a colour family a *family* rather than a single
 * palette (issue #140) — "wenn blau eingestellt ist, hat der darkmode blaue highlights".
 */
type Accent = Pick<Palette, 'primary' | 'primaryDk' | 'primaryLt' | 'ring' | 'bg' | 'canvas'> & {
  figureFill: string;
  figureFillSoft: string;
  /** The light behind a screen, in the family's own hue (components/lb/Glow.tsx). */
  glow?: Palette['glow'];
};

function accent(base: Palette, over: Accent): Palette {
  return {
    ...base,
    primary: over.primary,
    primaryDk: over.primaryDk,
    primaryLt: over.primaryLt,
    ring: over.ring,
    bg: over.bg,
    canvas: over.canvas,
    ...(over.glow ? { glow: over.glow } : {}),
    figure: { ...base.figure, fill: over.figureFill, fillSoft: over.figureFillSoft },
  };
}

/** A colour family: the same hue in both modes. */
export const FAMILIES = ['pastell', 'forest', 'ocean', 'sunset'] as const;
export type Family = (typeof FAMILIES)[number];

/**
 * Light or dark — and `system`, which follows the phone. A mode is NOT a family: until
 * #140 "Nacht" was one of five flat palettes, so choosing dark meant giving up your
 * colour. They are two axes now.
 */
export const MODES = ['system', 'light', 'dark'] as const;
export type Mode = (typeof MODES)[number];

/** The hue of each family, in both modes. Written once, applied to both bases. */
const ACCENTS: Record<Exclude<Family, 'pastell'>, { light: Accent; dark: Accent }> = {
  forest: {
    light: {
      primary: '#2f7d5b',
      primaryDk: '#256149',
      primaryLt: '#e0f1e8',
      ring: 'rgba(47,125,91,0.22)',
      bg: '#f6fbf8',
      canvas: '#e9f4ee',
      figureFill: '#9fd0b6',
      figureFillSoft: 'rgba(47,125,91,0.14)',
      glow: [
        { color: '#cfe9dc', opacity: 0.9 },
        { color: '#d9f0e4', opacity: 0.95 },
        { color: '#e8f3d6', opacity: 0.9 },
      ],
    },
    dark: {
      primary: '#5fae86',
      primaryDk: '#86c9a6',
      primaryLt: '#1e3a2c',
      ring: 'rgba(95,174,134,0.30)',
      bg: '#121e18',
      canvas: '#1d2f25',
      figureFill: '#4a7d63',
      figureFillSoft: 'rgba(95,174,134,0.20)',
      glow: [
        { color: '#1f5e4a', opacity: 0.38 },
        { color: '#2c6b52', opacity: 0.42 },
        { color: '#4a6b28', opacity: 0.3 },
      ],
    },
  },
  ocean: {
    light: {
      primary: '#2a6ab0',
      primaryDk: '#20548c',
      primaryLt: '#e2edfb',
      ring: 'rgba(42,106,176,0.22)',
      bg: '#f6f9fe',
      canvas: '#e8f0fa',
      figureFill: '#a6c6ec',
      figureFillSoft: 'rgba(42,106,176,0.14)',
      glow: [
        { color: '#cfe0ff', opacity: 0.9 },
        { color: '#d6e9fb', opacity: 0.95 },
        { color: '#d3f0f2', opacity: 0.9 },
      ],
    },
    dark: {
      primary: '#5a9fe0',
      primaryDk: '#8bc0f0',
      primaryLt: '#1b2e45',
      ring: 'rgba(90,159,224,0.30)',
      bg: '#121a26',
      canvas: '#1c2a3c',
      figureFill: '#41719e',
      figureFillSoft: 'rgba(90,159,224,0.20)',
      glow: [
        { color: '#1f4a86', opacity: 0.38 },
        { color: '#2a5c96', opacity: 0.42 },
        { color: '#1f6b72', opacity: 0.3 },
      ],
    },
  },
  sunset: {
    light: {
      primary: '#b45a1f',
      primaryDk: '#8f4615',
      primaryLt: '#fdece0',
      ring: 'rgba(180,90,31,0.22)',
      bg: '#fdf8f4',
      canvas: '#f8ece3',
      figureFill: '#eebb8e',
      figureFillSoft: 'rgba(180,90,31,0.14)',
      glow: [
        { color: '#ffe0c7', opacity: 0.9 },
        { color: '#ffd9d0', opacity: 0.95 },
        { color: '#ffe9c2', opacity: 0.9 },
      ],
    },
    dark: {
      primary: '#e0925a',
      primaryDk: '#f0b489',
      primaryLt: '#3d2a1b',
      ring: 'rgba(224,146,90,0.30)',
      bg: '#241a14',
      canvas: '#362820',
      figureFill: '#9e6a41',
      figureFillSoft: 'rgba(224,146,90,0.20)',
      glow: [
        { color: '#8a4a1f', opacity: 0.38 },
        { color: '#96432c', opacity: 0.42 },
        { color: '#8a6420', opacity: 0.3 },
      ],
    },
  },
};

/**
 * Every family in both modes, generated rather than typed (issue #140). The key is what is
 * stored and what `applyPalette` takes; the two axes are resolved into it by the provider.
 */
export const PALETTES = {
  pastell: pastellSoft,
  pastellDark: night,
  forest: accent(pastellSoft, ACCENTS.forest.light),
  forestDark: accent(night, ACCENTS.forest.dark),
  ocean: accent(pastellSoft, ACCENTS.ocean.light),
  oceanDark: accent(night, ACCENTS.ocean.dark),
  sunset: accent(pastellSoft, ACCENTS.sunset.light),
  sunsetDark: accent(night, ACCENTS.sunset.dark),
} satisfies Record<string, Palette>;

export type ThemeName = keyof typeof PALETTES;
export const THEME_NAMES = Object.keys(PALETTES) as ThemeName[];
export const DEFAULT_FAMILY: Family = 'pastell';
/** Following the phone is the default: the app goes dark in the evening on its own. */
export const DEFAULT_MODE: Mode = 'system';
export const DEFAULT_THEME: ThemeName = 'pastell';

/** The palette key for a family and a resolved (never `system`) mode. */
export function themeNameOf(family: Family, dark: boolean): ThemeName {
  return (dark ? `${family}Dark` : family) as ThemeName;
}

/**
 * What an older stored value meant. Before #140 the five palettes were flat, and "night"
 * was a family rather than a mode — a device that kept it gets pastell + dark, which is
 * what it was showing.
 */
export function familyModeOf(stored: string | null | undefined): { family: Family; mode: Mode } {
  switch (stored) {
    case 'night':
      return { family: 'pastell', mode: 'dark' };
    case 'pastellSoft':
      return { family: 'pastell', mode: 'light' };
    case 'forest':
    case 'ocean':
    case 'sunset':
      return { family: stored, mode: 'light' };
    default:
      return { family: DEFAULT_FAMILY, mode: DEFAULT_MODE };
  }
}

export function paletteOf(name: ThemeName | null | undefined): Palette {
  return PALETTES[name ?? DEFAULT_THEME] ?? PALETTES[DEFAULT_THEME];
}

// ─────────────── what a palette derives into ───────────────
// Pure functions of a palette: no live object, no module state. The provider builds them
// once per palette and hands them out through useTheme() (issue #29, layer 3).

/** The pastel tints a subject can wear (one per kind, never a free colour). */
export const SUBJECT_TONES = [
  'lavender',
  'peach',
  'mint',
  'blush',
  'sky',
  'butter',
  'rose',
] as const;
export type SubjectTone = (typeof SUBJECT_TONES)[number];

/** Figures in questions (components/math/FigureView.tsx): calm, printed-schoolbook look. */
export type Figure = {
  paper: string;
  axis: string;
  grid: string;
  gridStrong: string;
  stroke: string;
  label: string;
  /** Shaded parts of a fraction, bars, filled polygons. */
  fill: string;
  fillSoft: string;
  empty: string;
  point: string;
  /**
   * Series colours stay distinguishable for common colour-vision deficiencies and are
   * never the only signal (each graph also has a label and its own dash pattern).
   */
  series: string[];
  /** Climate chart: temperature line, precipitation columns, the compressed part above 100 mm. */
  warm: string;
  wet: string;
  wetDeep: string;
  /** A map's mountain ranges (#429). */
  relief: string;
  /** Pie slices and the two halves of a population pyramid; the tints of euro notes. */
  slices: string[];
  /** Euro coins: copper, brass, silver (issue #254). */
  coins: readonly [string, string, string];
  /** Itten's colour wheel, clockwise from yellow (issue #261). */
  hues: readonly string[];
};

export function toneBgOf(p: Palette): Record<SubjectTone, string> {
  return {
    lavender: p.lavender,
    peach: p.peach,
    mint: p.mint,
    blush: p.blush,
    sky: p.sky,
    butter: p.butter,
    rose: p.rose,
  };
}

export function toneDeepOf(p: Palette): Record<SubjectTone, string> {
  return {
    lavender: p.lavenderDeep,
    peach: p.peachDeep,
    mint: p.mintDeep,
    blush: p.blushDeep,
    sky: p.skyDeep,
    butter: p.butterDeep,
    rose: p.lavenderDeep, // no rose-deep in the palette; reuse lavender-deep
  };
}

export function figureOf(p: Palette): Figure {
  return {
    paper: p.paper,
    axis: p.ink2,
    grid: p.figure.grid,
    gridStrong: p.figure.gridStrong,
    stroke: p.ink,
    label: p.ink2,
    fill: p.figure.fill,
    fillSoft: p.figure.fillSoft,
    empty: p.paper,
    point: p.primaryDk,
    series: [...p.figure.series],
    warm: p.figure.warm,
    wet: p.figure.wet,
    wetDeep: p.figure.wetDeep,
    relief: p.figure.relief,
    slices: [...p.figure.slices],
    coins: p.figure.coins,
    hues: p.figure.hues,
  };
}
