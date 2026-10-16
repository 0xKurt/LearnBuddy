// Practice presentation shared by answer options and structured boards.
import type { ViewStyle } from 'react-native';

import { UI } from './components.js';
import type { Palette } from './palettes.js';
import { RADIUS } from './radius.js';
import { SPACE, TOUCH } from './space.js';

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim';

const COLUMN_CELL_AIR = 1;

/** How far below the progress bar the question stands, in every form (rule 19, #642). */
const QUESTION_TOP = 18;

export const PRACTICE = {
  ordinaryBody: {
    gap: 10,
    paddingTop: QUESTION_TOP,
    paddingBottom: SPACE.lg,
    feedbackGap: 14,
    feedbackTop: 6,
  },
  /** The question column of the board forms (cloze, order, match …): the same top. */
  questionColumn: { paddingTop: QUESTION_TOP },
  optionHeight: 56,
  boardLineGap: SPACE.xs / 2,
  lineMarkWidth: 16,
  drill: {
    shortPromptMax: 7,
    mediumPromptMax: 11,
  },
  badgeSize: 32,
  figureBadgeSize: 28,
  badgeIcon: 16,
  verdictIcon: 18,
  essaySign: 22,
  essaySignIcon: 14,
  quoteRule: 3,
  actionIcon: 24,
  staffGlyphSize: 32,
  hiddenSize: 1,
  optionCharacterEm: 0.64,
  border: UI.border,
  selectedBorder: UI.selectedBorder,
  pressOpacity: UI.pressed.surface,
  disabledOpacity: UI.disabledOpacity,
  contentGap: SPACE.md,
  optionPadding: SPACE.md,
  optionPaddingStart: 10,
  optionPaddingEnd: 14,
  optionRowGap: 10,
  optionDimOpacity: 0.6,
  optionGap: SPACE.sm,
  figureChoiceHeight: 120,
  figureChoiceShare: 0.12,
  figureShare: 0.14,
  imageShare: 0.2,
  imageHeight: 180,
  passageShare: 0.26,
  passageShareShort: 0.15,
  boardShare: 0.45,
  cardReach: 0.5,
  checkboxSize: 20,
  checkboxRadius: 6,
  checkboxBorder: 1.5,
  checkboxIcon: 14,
  orderColumns: 4,
  orderGridTextMax: 6,
  tableWordColumn: 76,
  tableBrickWidth: 64,
  fractionBarExtraHeight: 12,
  fractionBarRadius: RADIUS.sm,
  writingChrome: 270,
  writingRows: { min: 4, max: 24 },
  staffGapMin: 12,
  staffGapMax: 26,
  columnRule: 2,
  columnCellAir: COLUMN_CELL_AIR,
  columnDigitTarget: TOUCH + 2 * COLUMN_CELL_AIR,
  speechNoteGap: 6,
  passageLineAir: SPACE.xs / 2,
  markLetterCell: 30,
  markUnderline: 3,
  narrowPhone: 360,
  gridChoiceMax: 4,
  gridBasis: '45%' as const,
} as const;

export function optionLook(p: Palette, state: OptionState): ViewStyle {
  const borderWidth =
    state === 'idle' || state === 'dim' ? PRACTICE.border : PRACTICE.selectedBorder;
  const backgroundColor =
    state === 'selected'
      ? p.primaryLt
      : state === 'correct'
        ? p.mint
        : state === 'wrong'
          ? p.blush
          : p.paper;
  const borderColor =
    state === 'selected'
      ? p.primary
      : state === 'correct'
        ? p.success
        : state === 'wrong'
          ? p.danger
          : state === 'idle'
            ? p.hairlineStrong
            : p.hairline;
  return {
    minHeight: PRACTICE.optionHeight,
    borderRadius: RADIUS.md,
    borderWidth,
    borderColor,
    backgroundColor,
    paddingLeft: PRACTICE.optionPaddingStart,
    paddingRight: PRACTICE.optionPaddingEnd,
    paddingVertical: SPACE.sm,
  };
}
