// Each kind of subject keeps its pastel, so a subject looks the same everywhere in
// "Dein Material" — on its card in the list and over the sheets inside it.

import type { SubjectKind } from '@learnbuddy/shared-types/contracts';

import type { SubjectTone } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import type { DiscTint } from '../lb/IconDisc.js';

export const KIND_TONE: Record<SubjectKind, SubjectTone> = {
  math: 'sky',
  physics: 'sky',
  computer_science: 'sky',
  chemistry: 'mint',
  biology: 'mint',
  geography: 'mint',
  german: 'peach',
  english: 'lavender',
  french: 'lavender',
  spanish: 'lavender',
  latin: 'lavender',
  other_language: 'lavender',
  history: 'butter',
  economics: 'butter',
  social_studies: 'butter',
  art_music: 'blush',
  religion_ethics: 'rose',
  other: 'rose',
};

/** The sheets with no subject yet ("Ohne Fach") stand on paper, not in a subject's pastel. */
export type CardTone = SubjectTone | 'paper';

/**
 * The round mark (`IconDisc`) of a subject, an exercise or a sheet: one size everywhere in
 * "Dein Material" (issue #311), as the subject's card and the sheet's card used to draw it each.
 */
export const MARK = { size: 44, iconSize: 20 } as const;

/** A card tone as its mark's tint: the subject's pastel with a deeper edge, or paper. */
export function useMarkTint(tone: CardTone): DiscTint {
  const { palette, tones } = useTheme();
  return tone === 'paper'
    ? { fill: palette.canvas, edge: palette.hairline }
    : { fill: tones.bg[tone], edge: tones.deep[tone] };
}
