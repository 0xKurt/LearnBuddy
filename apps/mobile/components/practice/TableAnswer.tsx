// Tabelle ausfüllen (issue #230): die Tabelle steht da, wie im Heft, und die leeren Felder
// sind kleine Eingabefelder. Eine Zahl oder ein Term bekommt die Mathe-Tasten, ein Wort die
// Tastatur; Enter springt ins nächste leere Feld, im letzten prüft es. „Prüfen" wartet, bis
// jedes Feld etwas enthält — geprüft wird auf dem Server, Feld für Feld und ohne Modell
// (apps/api/src/modules/practice/table.ts).
//
// Mehr gibt es nicht: keine Anleitung (die leeren Felder sagen es), keine Schalter, keine
// Legende (Minimalismus, Owner 02.10.: „Möglichst einfach bedienbar"). Was sie eingetippt
// hat, bleibt im Entwurf — nach „2 von 3 Feldern stimmen" ändert sie nur das eine Feld, und
// ein Themenwechsel (Remount) oder ein beendeter Prozess nimmt ihr nichts weg.
//
// Breiter als der Bildschirm wird eine Tabelle nur mit vielen Wortspalten; dann — und nur
// dann — lässt sie sich in sich selbst waagerecht schieben. Eine Zahlenmauer steht als
// Mauer da: Reihe für Reihe mittig, Stein auf Stein.

import {
  TABLE_ANSWER_MAX,
  TABLE_JOIN,
  type StructuredAnswer,
  type TableFillTaskView,
  type TableViewCell,
  type TableViewGap,
} from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View, type KeyboardTypeOptions } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { around, RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { cellKeys } from '../../lib/math/keys.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';
import { AnswerShell } from './AnswerShell.js';
import { PartsArea } from './PartsArea.js';

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
const MIN_WORD_COL = 76;
/** A brick of a number wall: wide enough for a three-digit number, never wider. */
const BRICK = 64;

type Props = {
  view: TableFillTaskView;
  /** Where her cells are kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": every gap filled; `shown` is her cells in reading order, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function TableAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette, figure: ink } = useTheme();
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
    // iOS number pads lack minus, comma and letters; this one has them all.
    const keyboardType: KeyboardTypeOptions =
      math && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';
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
        maxLength={TABLE_ANSWER_MAX}
      />
    );
  };

  // What she reads: as large as what she types, and read out like any math text — a screen
  // reader walks the table cell by cell, the gaps named by their row and column.
  const shownText = (text: string, header: boolean) => (
    <MathText
      text={text}
      style={[
        TYPE.body,
        { fontSize: 16, lineHeight: 22, textAlign: 'center', fontWeight: header ? '700' : '400' },
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

  const grid = (
    <View
      style={{
        borderWidth: 1,
        borderColor: ink.gridStrong,
        // Concentric with the cells it holds (their corners plus the padding around them).
        borderRadius: around(RADIUS.cell, SPACE.xs),
        overflow: 'hidden',
        // Wider than the screen only when the columns need it; then the table scrolls.
        width: tooWide ? needed.reduce((a, b) => a + b, 0) : '100%',
      }}
    >
      {view.header ? (
        <View style={{ flexDirection: 'row', backgroundColor: palette.lavender }}>
          {view.header.map((h, c) => (
            <View
              key={`h${c}`}
              style={{
                flex: tooWide ? undefined : 1,
                width: tooWide ? needed[c] : undefined,
                minWidth: 0,
                padding: SPACE.xs,
                justifyContent: 'center',
                borderRightWidth: c === cols - 1 ? 0 : 1,
                borderColor: ink.gridStrong,
              }}
            >
              {shownText(h, true)}
            </View>
          ))}
        </View>
      ) : null}
      {view.rows.map((cellsInRow, r) => (
        <View
          key={`r${r}`}
          style={{
            flexDirection: 'row',
            backgroundColor: ink.paper,
            borderTopWidth: view.header || r > 0 ? 1 : 0,
            borderColor: ink.gridStrong,
          }}
        >
          {cellsInRow.map((cell, c) => (
            <View
              key={`c${c}`}
              style={{
                flex: tooWide ? undefined : 1,
                width: tooWide ? needed[c] : undefined,
                minWidth: 0,
                minHeight: TOUCH + SPACE.sm,
                padding: SPACE.xs,
                justifyContent: 'center',
                borderRightWidth: c === cols - 1 ? 0 : 1,
                borderColor: ink.gridStrong,
              }}
            >
              {isGap(cell) ? gap(cell, r, c) : shownText(cell.text, false)}
            </View>
          ))}
        </View>
      ))}
    </View>
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
                borderRadius: RADIUS.cell,
                borderWidth: isGap(cell) ? 0 : 1,
                borderColor: ink.gridStrong,
                backgroundColor: isGap(cell) ? 'transparent' : palette.lavender,
              }}
            >
              {isGap(cell) ? gap(cell, r, c) : shownText(cell.text, true)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <AnswerShell
      answer={
        <PartsArea>
          <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
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
          </View>
        </PartsArea>
      }
      // The math keys while a number or term cell has the focus. Only what the gap needs: none
      // for a word, only the minus for a whole number — the phone's digits write the rest
      // (#286 finding 5, #239, lib/math/keys.ts).
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
