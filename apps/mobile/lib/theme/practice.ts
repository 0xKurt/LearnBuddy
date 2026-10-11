// Practice presentation shared by answer options and structured boards.
import type { ViewStyle } from 'react-native';

import type { Palette } from './palettes.js';
import { RADIUS } from './radius.js';
import { SPACE } from './space.js';

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim';
export type BoardState = 'tile' | 'picked' | 'placed' | 'slot' | 'correct' | 'wrong';

export const PRACTICE = {
  optionHeight: 56,
  boardLineGap: SPACE.xs / 2,
  lineMarkWidth: 16,
  drill: {
    shortPromptMax: 7,
    mediumPromptMax: 11,
    answerWidth: 144,
    answerHeight: 72,
    receiptHeight: 36,
    receiptRadius: 18,
    receiptPadExtra: 2,
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
  border: 1,
  selectedBorder: 2,
  pressOpacity: 0.85,
  disabledOpacity: 0.45,
  contentGap: SPACE.md,
  optionPadding: SPACE.md,
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
  orderBadgeSize: 26,
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
  columnCellAir: 1,
  speechNoteGap: 6,
  passageLineAir: SPACE.xs / 2,
  markLetterCell: 30,
  markUnderline: 3,
  narrowPhone: 360,
  gridChoiceMax: 4,
  successTint: 0.13,
  dangerTint: 0.1,
  gridBasis: '45%' as const,
} as const;

function tint(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/** State skins shared by existing board controls; no separate button implementation. */
export function boardSkin(p: Palette, state: BoardState) {
  const color =
    state === 'correct'
      ? p.successText
      : state === 'wrong'
        ? p.danger
        : state === 'picked' || state === 'placed'
          ? p.primaryDk
          : p.ink;
  return {
    bg:
      state === 'picked' || state === 'placed'
        ? p.primaryLt
        : state === 'slot'
          ? p.canvas
          : state === 'correct'
            ? tint(p.success, PRACTICE.successTint)
            : state === 'wrong'
              ? tint(p.danger, PRACTICE.dangerTint)
              : p.paper,
    color,
    borderColor:
      state === 'picked'
        ? p.primary
        : state === 'placed'
          ? p.primaryLt
          : state === 'correct'
            ? p.success
            : state === 'wrong'
              ? p.danger
              : p.hairlineStrong,
    borderWidth:
      state === 'picked' || state === 'correct' || state === 'wrong'
        ? PRACTICE.selectedBorder
        : state === 'slot'
          ? PRACTICE.checkboxBorder
          : PRACTICE.border,
    borderStyle: state === 'slot' ? ('dashed' as const) : ('solid' as const),
  };
}

export function optionLook(p: Palette, state: OptionState): ViewStyle {
  const borderWidth =
    state === 'idle' || state === 'dim' ? PRACTICE.border : PRACTICE.selectedBorder;
  const backgroundColor =
    state === 'selected'
      ? p.primaryLt
      : state === 'correct'
        ? tint(p.success, PRACTICE.successTint)
        : state === 'wrong'
          ? tint(p.danger, PRACTICE.dangerTint)
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
    paddingHorizontal: PRACTICE.optionPadding - (borderWidth - PRACTICE.border),
    paddingVertical: SPACE.sm,
  };
}
