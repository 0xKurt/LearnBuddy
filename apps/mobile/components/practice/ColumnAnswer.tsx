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
//
// A division is written step by step, as in her exercise book (issue #413): the staircase shows the
// step she is at in full and the steps she has worked on above it, each shrunk to half-high lines
// she reads but no longer writes in; the steps she has not reached are not there yet. The step she
// is at follows the cell she writes in — a digit of the quotient opens its step again — so the
// server's writing order still leads her through, and every cell still goes to the check.
// A finished step is one target (two half rows, one touch high): a tap opens it again, a screen
// reader hears "Schritt 2 bearbeiten" (issue #420). After "Prüfen" the step Buddy's reply names
// opens by itself, her finger in its first cell — the reply has already said which step it is.

import {
  columnResultText,
  columnRowStep,
  COLUMN_DIGIT_MIN,
  COLUMN_SIGN,
  signColumn,
  type ColumnCalcTaskView,
  type ColumnGap,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { around, RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';
import { TapSurface } from '../lb/TapSurface.js';
import { AnswerShell } from './AnswerShell.js';
import { PartsArea } from './PartsArea.js';
// The same reading of a kept object of cells as a table's: known ids only, texts only.
import { cellsFrom } from './TableAnswer.js';

/** A row of the grid: a cell she types in, one touch high, and a little air around its frame. */
const ROW = TOUCH + SPACE.xs;
/** A line of a finished division step: two of them take one row (`columnRowsShown`). */
const HALF_ROW = ROW / 2;
/** The line under the numbers: drawn, not a hairline — it is what the sum stands under. */
const RULE = 2; // token-exempt: a stroke's width, not spacing

function isGap(cell: ColumnCalcTaskView['rows'][number]['cells'][number]): cell is ColumnGap {
  return 'id' in cell;
}

/** The last digit she typed into a cell, or nothing: one digit per cell, a new one replaces it. */
export function digitOf(typed: string): string {
  return typed.replace(/[^0-9]/g, '').slice(-1);
}

/** The division step a cell is written in (its quotient digit opens it), or 0 outside one. */
function stepOf(gap: ColumnGap, quotientDigits: number): number {
  if (gap.part === 'quotient') return quotientDigits - gap.place;
  return gap.part === 'product' || gap.part === 'difference' ? gap.step : 0;
}

/**
 * How a row of the grid is drawn while she is at a division step: in full, shrunk (a step she has
 * worked on), or not yet (a step she has not reached). Outside a staircase every row is in full.
 */
function rowMode(
  row: ColumnCalcTaskView['rows'][number],
  at: number,
  worked: ReadonlySet<number>,
): 'full' | 'done' | 'hidden' {
  const step = columnRowStep(row);
  if (step === 0 || step === at) return 'full';
  return step < at || worked.has(step) ? 'done' : 'hidden';
}

/** The step Buddy's reply names (`AnswerResponse.column_step`), keyed by that reply's turn. */
export type StepOpen = { step: number; turn: string };

type Props = {
  view: ColumnCalcTaskView;
  /** Where her digits are kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": every cell goes, empty or not; `shown` is her result, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
  /** The step to open after a check that was not right yet (#420); a new reply opens it again. */
  opens?: StepOpen | null;
};

export function ColumnAnswer({ view, draftKey, disabled, onSubmit, opens = null }: Props) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const ids = new Set(view.order);
  const digits = cellsFrom(kept, ids);
  const [width, setWidth] = useState(0);
  const inputs = useRef(new Map<string, LbTextInputRef>());
  const places = t('column.places', { returnObjects: true }) as unknown as string[];
  const gaps = view.rows.flatMap((r) => r.cells.filter(isGap));
  const quotientDigits = gaps.filter((c) => c.part === 'quotient').length;
  // The steps she has written in. She is at the step of the cell she last went to, or — until
  // then — at the last step she wrote in. The step is kept beside her digits, so a remount (a
  // theme switch) leaves her where she was, the step Buddy opened included (#420).
  const worked = new Set(
    gaps.filter((g) => (digits[g.id] ?? '') !== '').map((g) => stepOf(g, quotientDigits)),
  );
  const { text: wentKept, setText: keepWent } = useDraft(`${draftKey}.step`);
  const went = Number(wentKept) || null;
  const setAt = (step: number) => keepWent(String(step));
  const at = went ?? Math.max(1, ...worked);
  // A step opened by a tap or by Buddy's reply: her finger goes into its first cell once drawn.
  const focusIn = useRef<number | null>(null);
  const openStep = (step: number) => {
    setAt(step);
    focusIn.current = step;
  };
  useEffect(() => {
    if (opens) openStep(opens.step);
  }, [opens]);
  useEffect(() => {
    const step = focusIn.current;
    if (step === null) return;
    const first = gaps.find((g) => g.part !== 'quotient' && stepOf(g, quotientDigits) === step);
    const input = first ? inputs.current.get(first.id) : undefined;
    // Not drawn yet (the step opens in this very commit): the next render puts her there.
    if (!input) return;
    focusIn.current = null;
    input.focus();
  });

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
      onFocus={() => {
        const step = stepOf(gap, quotientDigits);
        if (step > 0) setAt(step);
      }}
      selectTextOnFocus={Platform.OS !== 'web'}
      accessibilityLabel={labelOf(gap)}
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
    />
  );

  // Each row drawn, with the division step it shows shrunk (0: drawn in full).
  const drawn = view.rows.flatMap((row, r) => {
    const mode = rowMode(row, at, worked);
    if (mode === 'hidden') return [];
    const done = mode === 'done';
    const printed = done || row.cells.every((c) => !isGap(c));
    // A row she only reads is one thing to a screen reader: "4721", "+ 1389", "12".
    const said = printed
      ? row.cells
          .map((c) => (isGap(c) ? (digits[c.id] ?? '') : c.text))
          .join('')
          .trim()
      : undefined;
    const el = (
      <View key={`r${r}`}>
        {row.rule ? (
          <View
            testID="column-rule"
            style={{ height: RULE, backgroundColor: ink.stroke, borderRadius: RULE }}
          />
        ) : null}
        <View
          testID={done ? 'column-done' : undefined}
          style={{ flexDirection: 'row', height: done ? HALF_ROW : ROW }}
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
                paddingHorizontal: isGap(c) && !done ? 1 : 0,
              }}
            >
              {isGap(c) && !done ? (
                cell(c)
              ) : (
                <Text
                  // A cell of a finished step is still that cell, only read now.
                  testID={isGap(c) ? `column-${c.id}` : undefined}
                  accessible={!printed}
                  style={[
                    done ? TYPE.small : TYPE.body,
                    { color: signs[col] ? palette.ink2 : palette.ink },
                  ]}
                >
                  {isGap(c) ? (digits[c.id] ?? '') : c.text}
                </Text>
              )}
            </View>
          ))}
        </View>
      </View>
    );
    return [{ step: done ? columnRowStep(row) : 0, el }];
  });

  // A finished step's lines together are one target to open it again (#420).
  const pieces: ReactNode[] = drawn.map(({ step, el }, i) => {
    if (step === 0) return el;
    if (drawn[i - 1]?.step === step) return null;
    return (
      <TapSurface
        key={`s${step}`}
        testID={`column-step-${step}`}
        onTap={() => openStep(step)}
        accessibilityRole="button"
        accessibilityLabel={t('column.reopen', { step })}
        disabled={disabled}
        // In the flow of the rows, not over them: the step's own lines give it its height.
        style={{ alignSelf: 'stretch' }}
      >
        {drawn.filter((d) => d.step === step).map((d) => d.el)}
      </TapSurface>
    );
  });

  const grid = <View style={{ alignSelf: 'center', width: gridWidth }}>{pieces}</View>;

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
