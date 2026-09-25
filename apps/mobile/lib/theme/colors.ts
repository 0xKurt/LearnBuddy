// LB design tokens: light and friendly pastels (pink · lilac · blue) with a
// violet accent — the "Pastell Soft" look the product owner chose (2026-09-25).
// Kept as a literal palette object so non-styled paths (SVG fills, native
// status bar, react-navigation themes) can pull from the same source as
// nativewind classes.

export const LB = {
  ink: '#1f1b2e',
  ink2: '#5d5873',
  ink3: '#8e89a3',
  ink4: '#d4d0e2',
  paper: '#ffffff',
  bg: '#faf7fd',
  canvas: '#f1edf8',
  hairline: 'rgba(60,40,120,0.09)',
  primary: '#6a48d7',
  primaryDk: '#5335b5',
  primaryLt: '#ebe5fc',
  // The soft violet halo around a focused field (components/lb/LbTextInput.tsx).
  ring: 'rgba(106,72,215,0.22)',
  // A text field's resting border: soft, but visible on white and on the page.
  field: 'rgba(60,40,120,0.16)',
  success: '#6b8d6a',
  warning: '#b58a3c',
  danger: '#b1493c',
  // Text on the pale success/warning tints (≥ 4.5:1).
  successText: '#46663f',
  warningText: '#7d5a16',
  // Subject pastels
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
} as const;

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

export const TONE_BG: Record<SubjectTone, string> = {
  lavender: LB.lavender,
  peach: LB.peach,
  mint: LB.mint,
  blush: LB.blush,
  sky: LB.sky,
  butter: LB.butter,
  rose: LB.rose,
};

export const TONE_DEEP: Record<SubjectTone, string> = {
  lavender: LB.lavenderDeep,
  peach: LB.peachDeep,
  mint: LB.mintDeep,
  blush: LB.blushDeep,
  sky: LB.skyDeep,
  butter: LB.butterDeep,
  rose: LB.lavenderDeep, // no rose-deep in source; reuse lavender-deep
};

// Figures in questions (components/math/FigureView.tsx): calm, printed-schoolbook look.
// Series colors stay distinguishable for common colour-vision deficiencies and are
// never the only signal (each graph also has a label and its own dash pattern).
export const FIGURE = {
  paper: LB.paper,
  axis: LB.ink2,
  grid: 'rgba(20,15,30,0.09)',
  gridStrong: 'rgba(20,15,30,0.18)',
  stroke: LB.ink,
  label: LB.ink2,
  /** Shaded parts of a fraction, bars, filled polygons. */
  fill: '#b9a4f0',
  fillSoft: 'rgba(106,72,215,0.14)',
  empty: LB.paper,
  point: LB.primaryDk,
  series: ['#6a48d7', '#2f7fb8', '#3f8a5c'],
} as const;
