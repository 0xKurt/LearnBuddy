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

/** A card tone as its mark's tint: the subject's pastel with a deeper edge, or paper. */
export function useMarkTint(tone: CardTone): DiscTint {
  const { palette, tones } = useTheme();
  return tone === 'paper'
    ? { fill: palette.canvas, edge: palette.hairline }
    : { fill: tones.bg[tone], edge: tones.deep[tone] };
}
