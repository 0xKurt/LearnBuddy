// Tabelle ausfüllen (issue #230): die Tabelle steht da, wie im Heft, und die leeren Felder
// sind kleine Eingabefelder. Eine Zahl oder ein Term bekommt die Mathe-Tasten, ein Wort die
// Tastatur; Enter springt ins nächste leere Feld, im letzten prüft es. „Prüfen" wartet, bis
// jedes Feld etwas enthält — geprüft wird auf dem Server, Feld für Feld und ohne Modell
// (apps/api/src/modules/practice/table.ts).
//
// Aussehen (#599, Design components/practice/Tasks.jsx `FillTable`): eine Papierkarte, der Kopf
// auf Canvas, zwischen zwei Zeilen eine Haarlinie und KEINE Linie zwischen zwei Spalten; die erste
// Spalte benennt die Zeile (600 15). Darunter eine Zeile Anleitung, bis sie das erste Feld antippt
// oder füllt (ui_kits/app/Tasks.jsx `Hint`). Die Zahlenmauer zeichnet das Design nicht: sie bleibt.
//
// Mehr gibt es nicht: keine Schalter, keine Legende (Minimalismus, Owner 02.10.: „Möglichst
// einfach bedienbar"). Was sie eingetippt
// hat, bleibt im Entwurf — nach „2 von 3 Feldern stimmen" ändert sie nur das eine Feld, und
// ein Themenwechsel (Remount) oder ein beendeter Prozess nimmt ihr nichts weg.
//
// Breiter als der Bildschirm wird eine Tabelle nur mit vielen Wortspalten; dann — und nur
// dann — lässt sie sich in sich selbst waagerecht schieben. Eine Zahlenmauer steht als
// Mauer da: Reihe für Reihe mittig, Stein auf Stein.

import { formDensity } from '../../lib/keyboard.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { PRACTICE } from '../../lib/theme/practice.js';
import {
  TABLE_ANSWER_MAX,
  TABLE_JOIN,
  type TableFillTaskView,
  type TableViewCell,
  type TableViewGap,
} from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View, type KeyboardTypeOptions } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { BOARD } from '../../lib/theme/board.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { cellKeys } from '../../lib/math/keys.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { BoardHint } from '../lb/BoardHint.js';
import { Card } from '../lb/Card.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';
import { AnswerShell } from './AnswerShell.js';
import { PartsArea } from './PartsArea.js';
import type { FormProps } from './formProps.js';

function isGap(cell: TableViewCell): cell is TableViewGap {
  return 'id' in cell;
}

/** The gaps in reading order: row by row, left to right — the order Enter walks. */
export function gapsIn(view: TableFillTaskView): TableViewGap[] {
  return view.rows.flatMap((cells) => cells.filter(isGap));
}

/**
 * Her cells as kept in the draft (a JSON object id → text), with anything that is not a gap
 * of this table — or not an object of texts at all — left out.
 */
export function cellsFrom(kept: string, ids: ReadonlySet<string>): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(kept || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, text] of Object.entries(parsed)) {
      if (ids.has(id) && typeof text === 'string') out[id] = text.slice(0, TABLE_ANSWER_MAX);
    }
    return out;
  } catch {
    return {};
  }
}

/** A column is never narrower than a touch target plus its padding … */
const MIN_COL = TOUCH + SPACE.sm;
/** … and a column with a word to type in has room for a word. */
const MIN_WORD_COL = PRACTICE.tableWordColumn;
/** What stands around a field in its cell, so a row of fields is as tall as a row of text. */
const GAP_PAD = (BOARD.table.row - TOUCH) / 2;
/** A brick of a number wall: wide enough for a three-digit number, never wider. */
const BRICK = PRACTICE.tableBrickWidth;

/** "Prüfen": every gap filled; `shown` is her cells in reading order, for the thread. */
export function TableAnswer({ view, draftKey, disabled, onSubmit }: FormProps<TableFillTaskView>) {
  const { palette, figure: ink } = useTheme();
  const seen = useVisibleHeight();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const { text: kept, setText: keep } = useDraft(draftKey);
  const gaps = gapsIn(view);
  const ids = new Set(gaps.map((g) => g.id));
  const cells = cellsFrom(kept, ids);
  const complete = gaps.every((g) => (cells[g.id] ?? '').trim() !== '');
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const inputs = useRef(new Map<string, LbTextInputRef>());
  // Where the cursor stands in the focused cell (reported by the field), and once after a
  // math key where it has to go.
  const selection = useRef<Selection | null>(null);
  const [forced, setForced] = useState<{ id: string; at: Selection } | null>(null);

  const setCell = (id: string, value: string) =>
    keep((now) =>
      JSON.stringify({ ...cellsFrom(now, ids), [id]: value.slice(0, TABLE_ANSWER_MAX) }),
    );

  const submit = () => {
    if (disabled || !complete) return;
    onSubmit(
      {
        type: 'table_fill',
        cells: gaps.map((g) => ({ id: g.id, text: (cells[g.id] ?? '').trim() })),
      },
      gaps.map((g) => (cells[g.id] ?? '').trim()).join(TABLE_JOIN),
    );
  };

  const focusedGap = gaps.find((g) => g.id === focused) ?? null;
  const insert = (insertion: Insertion) => {
    if (!focusedGap) return;
    const id = focusedGap.id;
    const next = insertAtCursor(cells[id] ?? '', selection.current, insertion);
    if (next.value.length > TABLE_ANSWER_MAX) return;
    selection.current = next.selection;
    setCell(id, next.value);
    setForced({ id, at: next.selection });
    inputs.current.get(id)?.focus();
  };

  // What names a cell for a screen reader: its row and its column, in words.
  const wall = view.layout === 'wall';
  const labelOf = (row: number, col: number): string => {
    if (wall) return t('table.brick', { row: row + 1, n: col + 1 });
    const first = view.rows[row]?.[0];
    const rowName = col > 0 && first && !isGap(first) && first.text !== '' ? first.text : null;
    const colName = view.header?.[col] ?? '';
    return rowName !== null && colName !== ''
      ? t('table.cell', {
          row: speakMathText(rowName, words),
          column: speakMathText(colName, words),
        })
      : t('table.cell_at', { row: row + 1, column: col + 1 });
  };

  const gap = (cell: TableViewGap, row: number, col: number) => {
    const at = gaps.findIndex((g) => g.id === cell.id);
    const last = at === gaps.length - 1;
    const next = gaps[at + 1];
    const math = cell.input === 'math';
    // A whole number is typed on the phone's own number pad (owner rule 8; the design's
    // FillTable, components/practice/Tasks.jsx:135) — its minus, which no pad has, is the one key
    // over the table. Any other number or term needs a comma, a fraction bar or a letter: iOS
    // number pads lack them, this keyboard has them all.
    const pad = math && cell.whole;
    const keyboardType: KeyboardTypeOptions = pad
      ? 'number-pad'
      : math && Platform.OS === 'ios'
        ? 'numbers-and-punctuation'
        : 'default';
    return (
      <LbTextInput
        variant="cell"
        ref={(input) => {
          if (input) inputs.current.set(cell.id, input);
          else inputs.current.delete(cell.id);
        }}
        value={cells[cell.id] ?? ''}
        editable={!disabled}
        onChangeText={(typed) => setCell(cell.id, typed)}
        selection={forced?.id === cell.id ? forced.at : undefined}
        onSelectionChange={(e) => {
          selection.current = e.nativeEvent.selection;
          if (forced) setForced(null);
        }}
        onFocus={() => {
          selection.current = null;
          setFocused(cell.id);
        }}
        onBlur={() => setFocused((now) => (now === cell.id ? null : now))}
        // Enter: on to the next gap; in the last one it checks, once every gap is filled.
        returnKeyType={last ? 'done' : 'next'}
        submitBehavior={last ? 'blurAndSubmit' : 'submit'}
        onSubmitEditing={() => {
          if (next) inputs.current.get(next.id)?.focus();
          else submit();
        }}
        accessibilityLabel={labelOf(row, col)}
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="none"
        keyboardType={keyboardType}
        {...(pad ? { inputMode: 'numeric' as const } : {})}
        maxLength={TABLE_ANSWER_MAX}
      />
    );
  };

  // What she reads, read out like any math text — a screen reader walks the table cell by cell,
  // the gaps named by their row and column. `head`: a column's head; `lead`: the first column,
  // which names the row; `brick`: a given stone of a number wall (as before the redesign).
  const shownText = (text: string, role: 'head' | 'lead' | 'cell' | 'brick') => (
    <MathText
      text={text}
      style={[
        role === 'head'
          ? TYPE.boardLabel
          : role === 'lead'
            ? TYPE.boardCompact
            : role === 'brick'
              ? TYPE.reviewTitle
              : TYPE.body,
        { textAlign: 'center' },
      ]}
    />
  );

  const cols = Math.max(view.header?.length ?? 0, ...view.rows.map((r) => r.length));
  const wordColumn = (col: number) =>
    view.rows.some((r) => {
      const c = r[col];
      return c !== undefined && isGap(c) && c.input === 'text';
    });
  const needed = Array.from({ length: cols }, (_, c) => (wordColumn(c) ? MIN_WORD_COL : MIN_COL));
  const tooWide = width > 0 && needed.reduce((a, b) => a + b, 0) > width;
  const column = (c: number) => ({
    flex: tooWide ? undefined : 1,
    width: tooWide ? needed[c] : undefined,
    minWidth: 0,
    justifyContent: 'center' as const,
  });

  // The table as the design draws it (components/practice/Tasks.jsx `FillTable`): one paper card
  // (the app's `Card`, which carries the shadow), the head on canvas, a hairline between two rows — and no line between two columns.
  const grid = (
    <Card
      padding={0}
      joined
      // Wider than the screen only when the columns need it; then the table scrolls.
      style={{ width: tooWide ? needed.reduce((a, b) => a + b, 0) : '100%' }}
    >
      {/* The clip is a box of its own: a clipped box would cut its own shadow off on iOS. */}
      <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden' }}>
        {view.header ? (
          <View style={{ flexDirection: 'row', backgroundColor: palette.canvas }}>
            {view.header.map((h, c) => (
              <View
                key={`h${c}`}
                style={{
                  ...column(c),
                  paddingVertical: BOARD.table.headPadY,
                  paddingHorizontal: BOARD.table.headPadX,
                }}
              >
                {shownText(h, 'head')}
              </View>
            ))}
          </View>
        ) : null}
        {view.rows.map((cellsInRow, r) => (
          <View
            key={`r${r}`}
            style={{
              flexDirection: 'row',
              borderTopWidth: view.header || r > 0 ? PRACTICE.border : 0,
              borderColor: palette.hairline,
            }}
          >
            {cellsInRow.map((cell, c) => (
              <View
                key={`c${c}`}
                style={{
                  ...column(c),
                  minHeight: BOARD.table.row,
                  // A field keeps its 44 pt (the design's is 40): with less around it the row
                  // is still the design's 52.
                  padding: isGap(cell) ? GAP_PAD : BOARD.table.cellPad,
                }}
              >
                {isGap(cell) ? gap(cell, r, c) : shownText(cell.text, c === 0 ? 'lead' : 'cell')}
              </View>
            ))}
          </View>
        ))}
      </View>
    </Card>
  );

  const brickWidth = Math.min(BRICK, width > 0 ? Math.floor(width / Math.max(1, cols)) : BRICK);
  const wallView = (
    <View style={{ alignItems: 'center', gap: SPACE.xs }}>
      {view.rows.map((cellsInRow, r) => (
        <View key={`w${r}`} style={{ flexDirection: 'row', gap: SPACE.xs }}>
          {cellsInRow.map((cell, c) => (
            <View
              key={`b${c}`}
              style={{
                width: brickWidth,
                minHeight: TOUCH,
                justifyContent: 'center',
                borderRadius: RADIUS.sm,
                borderWidth: isGap(cell) ? 0 : PRACTICE.border,
                borderColor: ink.gridStrong,
                backgroundColor: isGap(cell) ? 'transparent' : palette.lavender,
              }}
            >
              {isGap(cell) ? gap(cell, r, c) : shownText(cell.text, 'brick')}
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <AnswerShell
      boardEditing={focused !== null}
      answer={
        <PartsArea
          keyboardEditing={focused !== null && formDensity(seen.window, seen.overlap) === 'tight'}
        >
          <View
            style={{ gap: BOARD.gap }}
            onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
          >
            {wall ? (
              wallView
            ) : tooWide ? (
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="handled"
                accessibilityLabel={t('table.scroll')}
              >
                {grid}
              </ScrollView>
            ) : (
              grid
            )}
            {/* The one line of instruction — gone with the first cell she taps or fills, so the
                keyboard's tight room never has to hold it. */}
            {focused === null && Object.keys(cells).length === 0 ? (
              <BoardHint>{t('table.how')}</BoardHint>
            ) : null}
          </View>
        </PartsArea>
      }
      // The keys while a number or term cell has the focus. Only what its keyboard lacks: none
      // for a word, the minus for a whole number on the number pad, the minus and the exponent
      // for a term (#286 finding 5, #239, #599, lib/math/keys.ts).
      keys={
        focusedGap ? (
          <MathKeys
            keys={cellKeys(focusedGap.input, focusedGap.whole)}
            onInsert={insert}
            disabled={disabled}
          />
        ) : null
      }
      action={{ ready: complete, disabled, onPress: submit, waitsHint: t('table.check_waits') }}
    />
  );
}
