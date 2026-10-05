// Schriftlich rechnen (issue #260): the numbers stand in columns as on squared paper, and every
// digit she writes — of the result, of each carry, of every step — is a cell of its own, the
// table's cell (`LbTextInput` variant cell, as in `TableAnswer`). The layout is the server's
// (apps/api/src/modules/practice/columnCalc.ts): which cells there are, where the line goes, and
// the order she writes them in. A digit typed moves her on to the next cell in that order — right
// to left, the carry before the digit, step by step — so the phone's number pad is all she needs.
//
// Nothing else: no legend, no labels, no switches (minimalism, owner 02.10.). The small row
// between the numbers and the line is where carries go, as in her exercise book; a cell left
// empty means no carry, or no leading zero. "Prüfen" waits for the first digit; the server checks
// every cell and names the first place that is not right yet. What she wrote stays in the draft.
//
// The columns are as wide as the phone allows, up to square cells; the contract keeps a task to
// what fits a 360-pt phone with every digit column at its narrowest (`columnsFit`), and to rows a
// 360×740 phone holds (COLUMN_ROWS_MAX) — the board never has to scroll.

import {
  columnResultText,
  COLUMN_DIGIT_MIN,
  COLUMN_SIGN,
  signColumn,
  type ColumnCalcTaskView,
  type ColumnGap,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { around, RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';
import { AnswerShell } from './AnswerShell.js';
import { PartsArea } from './PartsArea.js';
// The same reading of a kept object of cells as a table's: known ids only, texts only.
import { cellsFrom } from './TableAnswer.js';

/** A row of the grid: a cell she types in, one touch high, and a little air around its frame. */
const ROW = TOUCH + SPACE.xs;
/** The line under the numbers: drawn, not a hairline — it is what the sum stands under. */
const RULE = 2; // token-exempt: a stroke's width, not spacing

function isGap(cell: ColumnCalcTaskView['rows'][number]['cells'][number]): cell is ColumnGap {
  return 'id' in cell;
}

/** The last digit she typed into a cell, or nothing: one digit per cell, a new one replaces it. */
export function digitOf(typed: string): string {
  return typed.replace(/[^0-9]/g, '').slice(-1);
}

type Props = {
  view: ColumnCalcTaskView;
  /** Where her digits are kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": every cell goes, empty or not; `shown` is her result, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function ColumnAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const ids = new Set(view.order);
  const digits = cellsFrom(kept, ids);
  const [width, setWidth] = useState(0);
  const inputs = useRef(new Map<string, LbTextInputRef>());
  const places = t('column.places', { returnObjects: true }) as unknown as string[];
  const quotientDigits = view.rows.flatMap((r) =>
    r.cells.filter((c) => isGap(c) && c.part === 'quotient'),
  ).length;

  const cols = Math.max(...view.rows.map((r) => r.cells.length));
  const signs = Array.from({ length: cols }, (_, c) => signColumn(view.rows, c));
  const signCount = signs.filter(Boolean).length;
  // As wide as the phone allows, never wider than a square, never narrower than the contract's.
  const digitWidth =
    width > 0
      ? Math.max(
          COLUMN_DIGIT_MIN,
          Math.min(ROW, Math.floor((width - signCount * COLUMN_SIGN) / (cols - signCount))),
        )
      : COLUMN_DIGIT_MIN;
  const colWidth = (c: number) => (signs[c] ? COLUMN_SIGN : digitWidth);
  const gridWidth = Array.from({ length: cols }, (_, c) => colWidth(c)).reduce((a, b) => a + b, 0);

  const ready = Object.values(digits).some((d) => d !== '');
  const submit = () => {
    if (disabled || !ready) return;
    onSubmit(
      { type: 'column_calc', cells: view.order.map((id) => ({ id, digit: digits[id] ?? '' })) },
      columnResultText(view, digits),
    );
  };

  const setDigit = (id: string, typed: string) => {
    const digit = digitOf(typed);
    keep((now) => JSON.stringify({ ...cellsFrom(now, ids), [id]: digit }));
    // On to the next cell she writes: right to left, the carry before the digit.
    if (digit !== '') {
      const next = view.order[view.order.indexOf(id) + 1];
      if (next) inputs.current.get(next)?.focus();
    }
  };

  // What names a cell for a screen reader: what it is part of and its place, in words.
  const labelOf = (gap: ColumnGap): string => {
    const place = places[gap.place] ?? String(gap.place + 1);
    switch (gap.part) {
      case 'quotient':
        return t('column.quotient', { n: quotientDigits - gap.place });
      case 'partial':
      case 'product':
      case 'difference':
        return t(`column.${gap.part}`, { step: gap.step, place });
      case 'carry':
      case 'result':
        return t(`column.${gap.part}`, { place });
    }
  };

  const cell = (gap: ColumnGap) => (
    <LbTextInput
      variant="cell"
      testID={`column-${gap.id}`}
      ref={(input) => {
        if (input) inputs.current.set(gap.id, input);
        else inputs.current.delete(gap.id);
      }}
      value={digits[gap.id] ?? ''}
      editable={!disabled}
      onChangeText={(typed) => setDigit(gap.id, typed)}
      // Two characters, so a digit typed over a digit replaces it (`digitOf` keeps the last).
      maxLength={2}
      keyboardType="number-pad"
      inputMode="numeric"
      returnKeyType="done"
      onSubmitEditing={submit}
      selectTextOnFocus={Platform.OS !== 'web'}
      accessibilityLabel={labelOf(gap)}
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
    />
  );

  const grid = (
    <View style={{ alignSelf: 'center', width: gridWidth }}>
      {view.rows.map((row, r) => {
        const printed = row.cells.every((c) => !isGap(c));
        // A row she only reads is one thing to a screen reader: "4721", "+ 1389".
        const said = printed
          ? row.cells
              .map((c) => (isGap(c) ? '' : c.text))
              .join('')
              .trim()
          : undefined;
        return (
          <View key={`r${r}`}>
            {row.rule ? (
              <View
                testID="column-rule"
                style={{ height: RULE, backgroundColor: ink.stroke, borderRadius: RULE }}
              />
            ) : null}
            <View
              style={{ flexDirection: 'row', height: ROW }}
              accessible={printed}
              {...(said ? { accessibilityLabel: said } : {})}
            >
              {row.cells.map((c, col) => (
                <View
                  key={`c${col}`}
                  style={{
                    width: colWidth(col),
                    alignItems: 'center',
                    justifyContent: 'center',
                    // The air between two cells she types in: their frames never touch.
                    // token-exempt: hairline of air between frames, not a step of the scale
                    paddingHorizontal: isGap(c) ? 1 : 0,
                  }}
                >
                  {isGap(c) ? (
                    cell(c)
                  ) : (
                    <Text
                      accessible={!printed}
                      style={[TYPE.body, { color: signs[col] ? palette.ink2 : palette.ink }]}
                    >
                      {c.text}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <AnswerShell
      answer={
        <PartsArea>
          <View
            testID="column-paper"
            onLayout={(e) =>
              setWidth(Math.floor(e.nativeEvent.layout.width) - 2 * SPACE.sm - 2 /* frame */)
            }
            style={{
              backgroundColor: ink.paper,
              borderWidth: 1,
              borderColor: ink.gridStrong,
              borderRadius: around(RADIUS.cell, SPACE.sm),
              padding: SPACE.sm,
            }}
          >
            {grid}
          </View>
        </PartsArea>
      }
      action={{ ready, disabled, onPress: submit, waitsHint: t('column.check_waits') }}
    />
  );
}
