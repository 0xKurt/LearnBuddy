// First-visit Home presentation (#548); existing status mark keeps its compact shape.
export const HOME = {
  sections: 28,
  greetingGap: 10,
  practiced: { horizontal: 9, vertical: 3, icon: 13 },
  /**
   * A way to start in a sheet (components/practice/Modes.jsx `ChoiceList`): a paper row of at
   * least 64 with a 40 pt tone tile and its sign at 20.
   */
  choice: { row: 64, padX: 14, padY: 10, tile: 40, glyph: 20 },
} as const;
