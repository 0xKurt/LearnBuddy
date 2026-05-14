// LB design tokens. Source: handoff bundle components.jsx LB.
// Kept as a literal palette object so non-styled paths (SVG fills, native
// status bar, react-navigation themes) can pull from the same source as
// nativewind classes.

export const LB = {
  ink: '#1d1b22',
  ink2: '#5c5764',
  ink3: '#928d9c',
  ink4: '#cfcbd5',
  paper: '#fdfcfa',
  bg: '#f6f3ee',
  canvas: '#f0eee9',
  hairline: 'rgba(20,15,30,0.08)',
  primary: '#b1715c',
  primaryDk: '#985d4b',
  primaryLt: '#f4dccf',
  success: '#6b8d6a',
  warning: '#b58a3c',
  danger: '#b1493c',
  // Subject pastels
  lavender: '#ebe4f4',
  lavenderDeep: '#cdbde6',
  peach: '#f8e0d2',
  peachDeep: '#ecc2a8',
  mint: '#dceee2',
  mintDeep: '#b9d8c4',
  blush: '#f2dde2',
  blushDeep: '#e2bbc6',
  sky: '#dce6ef',
  skyDeep: '#b8cee0',
  butter: '#f3e8cf',
  butterDeep: '#ddc995',
  rose: '#dcd4e4',
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
