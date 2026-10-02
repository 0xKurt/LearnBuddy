// Schriftlich rechnen (issue #260): die Zahlen stehen untereinander wie im Rechenheft, eine Ziffer
// pro Kästchen, der Strich über dem Ergebnis. Sie tippt ein Kästchen an und dann eine Ziffer auf
// dem Ziffernblock darunter; das nächste Kästchen ist dann schon gewählt — in der Zeile eins nach
// links, so wie man rechnet, von den Einern aus. Die kleinen Kästchen über dem Strich sind für
// die Überträge: freiwillig, aber wer einen hinschreibt, dem wird er geprüft. Nach einem Übertrag
// springt die Auswahl auf das Ergebnis derselben Spalte — die Reihenfolge im Heft.
//
// Die Ziffern und Überträge prüft der Server, Spalte für Spalte und ohne Modell
// (apps/api/src/modules/practice/written.ts); die Antwort nennt die Spalte („bei den Zehnern
// fehlt der Übertrag"). Was sie geschrieben hat, bleibt im Entwurf: nach der Antwort ändert sie
// nur die eine Ziffer.
//
// Ein eigener Ziffernblock statt der Tastatur: die Tastatur eines Telefons nähme die halbe Höhe
// und deckte das Rechenkästchen zu (Regel 16, 360×740). Zehn Ziffern in zwei Reihen
// zu je sechs gleich breiten Plätzen, „Prüfen" auf den letzten zwei wie das „=" eines
// Taschenrechners, jede Taste mindestens 44 pt. Gelöscht wird ohne Taste: ein zweiter Tipp auf
// das gewählte Kästchen leert es, eine neue Ziffer ersetzt die alte.
//
// Ein Screenreader liest jede Zahl der Aufgabe als Zahl und jedes Kästchen mit Zeile und Stelle
// („Ergebnis, Zehner, leer"); Farbe ist nie das einzige Signal — das gewählte Kästchen hat einen
// dicken Rand und heißt „ausgewählt".

import type {
  StructuredAnswer,
  WrittenBox,
  WrittenCalcTaskView,
  WrittenRow,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { BottomBar } from './BottomBar.js';
import { PartsArea } from './PartsArea.js';

function isBox(cell: WrittenRow['cells'][number]): cell is WrittenBox {
  return cell !== null && 'id' in cell;
}

/** Every box of the grid, row by row, each with its row. */
export function boxesIn(view: WrittenCalcTaskView): Array<WrittenBox & { row: number }> {
  return view.rows.flatMap((r, row) => r.cells.filter(isBox).map((b) => ({ ...b, row })));
}

/**
 * Her digits as kept in the draft (a JSON object id → digit), with anything that is not a box
 * of this grid — or not a single digit — left out.
 */
export function digitsFrom(kept: string, ids: ReadonlySet<string>): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(kept || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, digit] of Object.entries(parsed)) {
      if (ids.has(id) && typeof digit === 'string' && /^[0-9]$/.test(digit)) out[id] = digit;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Where the selection goes after a digit: a carry hands over to the result of its column; any
 * other box to the next place on its left, and from the end of a row to the start (the Einer)
 * of the next row that is filled in. Null when there is nowhere left to go.
 */
export function nextBox(view: WrittenCalcTaskView, id: string): string | null {
  const all = boxesIn(view);
  const at = all.find((b) => b.id === id);
  if (!at) return null;
  const role = view.rows[at.row]?.role;
  if (role === 'carry') {
    const below = all.find(
      (b) => b.row > at.row && view.rows[b.row]?.role === 'result' && b.place === at.place,
    );
    return below?.id ?? null;
  }
  const left = all.find((b) => b.row === at.row && b.place === at.place + 1);
  if (left) return left.id;
  const later = all.filter((b) => b.row > at.row && view.rows[b.row]?.role !== 'carry');
  const nextRow = later[0]?.row;
  if (nextRow === undefined) return null;
  return later.filter((b) => b.row === nextRow).sort((x, y) => x.place - y.place)[0]?.id ?? null;
}

/**
 * The box she goes on in: the first empty one in the order she fills them (rows top to bottom,
 * each from the Einer up; carries are optional and never waited for). A remount — a theme change
 * rebuilds the tree — must not send her back to the start, where the next digit would overwrite
 * one she has written (found in the walkthrough, #260).
 */
export function openBox(view: WrittenCalcTaskView, digits: Record<string, string>): string | null {
  const order = boxesIn(view)
    .filter((b) => view.rows[b.row]?.role !== 'carry')
    .sort((x, y) => x.row - y.row || x.place - y.place);
  return order.find((b) => digits[b.id] === undefined)?.id ?? firstBox(view);
}

/** The box she starts in: the Einer of the first row she fills (a partial product or the result). */
export function firstBox(view: WrittenCalcTaskView): string | null {
  const all = boxesIn(view).filter((b) => view.rows[b.row]?.role !== 'carry');
  const row = all[0]?.row;
  return all.filter((b) => b.row === row).sort((x, y) => x.place - y.place)[0]?.id ?? null;
}

/** The calculation as it reads in one line: "476 + 358", "352 · 24". */
export function termOf(view: WrittenCalcTaskView): string {
  return view.rows
    .filter((r) => r.role === 'given')
    .map((r) =>
      r.cells
        .map((c) => (c !== null && !isBox(c) ? c.text : ''))
        .join('')
        .replace(/([+−·])/g, ' $1 ')
        .trim(),
    )
    .join(' ')
    .replace(/\s+/g, ' ');
}

/** What the card around the grid takes of the width: its padding (2 × SPACE.sm) and border. */
const CARD_INSET = 2 * SPACE.sm + 2;
/** A digit box of the grid: as wide as a column allows, never below a touch target. */
const BOX_MAX = 48;
/** How a carry box looks: small, like the small digits written above the line. */
const CARRY_BOX = 28;
/**
 * How tall a row is. A row with boxes is a touch target (TOUCH); a carry row's boxes are drawn
 * small but still tapped over 36 pt — the row above and below it holds no other target; a row of
 * the task is read, never tapped, so it is only as tall as its digits (measured on 360×740 with
 * Buddy's reply on screen: at 48 pt per row the grid had to scroll by 36 pt).
 */
const ROW_BOX = TOUCH;
const ROW_CARRY = 36;
const ROW_GIVEN = 32;
/** The digits she writes and the digits she reads: the same calm size. */
const DIGIT_SIZE = 24;

type Props = {
  view: WrittenCalcTaskView;
  /** Where her digits are kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": at least one digit in the result; `shown` is her result line, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function WrittenCalcAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const boxes = boxesIn(view);
  const ids = new Set(boxes.map((b) => b.id));
  const digits = digitsFrom(kept, ids);
  const [chosen, setChosen] = useState<string | null>(() => openBox(view, digits));
  // The kept digits arrive a moment after a remount (`useDraft` reads them from storage): until
  // she taps something herself, the choice follows them to the first empty box.
  const acted = useRef(false);
  useEffect(() => {
    if (!acted.current)
      setChosen(openBox(view, digitsFrom(kept, new Set(boxesIn(view).map((b) => b.id)))));
  }, [kept, view]);
  const [width, setWidth] = useState(0);
  const resultIds = boxes.filter((b) => view.rows[b.row]?.role === 'result').map((b) => b.id);
  const complete = resultIds.some((id) => digits[id] !== undefined);
  // The columns share the width; a box is never wider than BOX_MAX nor narrower than a target.
  const col = Math.max(
    TOUCH,
    Math.min(BOX_MAX, width > 0 ? Math.floor((width - CARD_INSET) / view.cols) : BOX_MAX),
  );

  const write = (id: string, digit: string | null) =>
    keep((now) => {
      const next = { ...digitsFrom(now, ids) };
      if (digit === null) delete next[id];
      else next[id] = digit;
      return JSON.stringify(next);
    });

  const press = (digit: string) => {
    if (disabled || chosen === null) return;
    acted.current = true;
    write(chosen, digit);
    const next = nextBox(view, chosen);
    if (next !== null) setChosen(next);
  };
  /**
   * A tap on a box chooses it; a tap on the chosen box empties it (a carry written by mistake,
   * a digit too many in front). Typing over a digit replaces it, so no erase key is needed.
   */
  const tapBox = (id: string) => {
    if (disabled) return;
    acted.current = true;
    if (chosen === id && digits[id] !== undefined) write(id, null);
    else setChosen(id);
  };

  const submit = () => {
    if (disabled || !complete) return;
    const result = boxes
      .filter((b) => view.rows[b.row]?.role === 'result')
      .sort((x, y) => y.place - x.place)
      .map((b) => digits[b.id] ?? '')
      .join('')
      .replace(/^0+(?=\d)/, '');
    onSubmit(
      {
        type: 'written_calc',
        boxes: boxes.flatMap((b) => (digits[b.id] ? [{ id: b.id, digit: digits[b.id]! }] : [])),
      },
      `${termOf(view)} = ${result === '' ? '…' : result}`,
    );
  };

  const placeName = (place: number) => t(`written.place.p${Math.min(place, 6)}`);
  const rowName = (row: number): string => {
    const role = view.rows[row]?.role;
    if (role === 'carry') return t('written.row_carry');
    if (role === 'result') return t('written.row_result');
    const partials = view.rows.slice(0, row + 1).filter((r) => r.role === 'partial').length;
    return t('written.row_partial', { n: partials });
  };

  /** A given row as a screen reader hears it: the number, with its sign. */
  const spokenRow = (r: WrittenRow): string =>
    r.cells
      .map((c) => (c !== null && !isBox(c) ? c.text : ' '))
      .join('')
      .replace(/·/g, ` ${t('written.times')} `)
      .replace(/−/g, `${t('written.minus')} `)
      .replace(/\+/g, `${t('written.plus')} `)
      .replace(/\s+/g, ' ')
      .trim();

  const box = (b: WrittenBox, row: number, carry: boolean) => {
    const on = chosen === b.id;
    const digit = digits[b.id];
    const size = carry ? CARRY_BOX : col - SPACE.xs;
    return (
      <Pressable
        key={b.id}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled }}
        accessibilityLabel={t('written.box', {
          row: rowName(row),
          place: placeName(b.place),
          value: digit ?? t('written.empty'),
        })}
        disabled={disabled}
        accessibilityHint={on && digit !== undefined ? t('written.hint_clear') : undefined}
        onPress={() => tapBox(b.id)}
        // The carry box is drawn small, as the small digits above the line are; it is still
        // tapped over the whole column and row.
        style={{
          width: col,
          height: carry ? ROW_CARRY : ROW_BOX,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size,
            height: carry ? CARRY_BOX : ROW_BOX - SPACE.xs,
            borderRadius: carry ? 8 : 10,
            borderWidth: on ? 2.5 : 1.5,
            borderColor: on ? palette.primary : carry ? ink.gridStrong : palette.field,
            backgroundColor: on ? palette.primaryLt : palette.paper,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: carry ? palette.primary : palette.primaryDk,
              fontSize: carry ? 15 : DIGIT_SIZE,
              lineHeight: carry ? 18 : 30,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            }}
          >
            {digit ?? ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  const grid = (
    <View style={{ alignSelf: 'center' }}>
      {view.rows.map((r, row) => {
        const carry = r.role === 'carry';
        const given = r.role === 'given';
        return (
          <View key={`row${row}`}>
            {r.rule_above ? (
              <View
                style={{
                  height: 2,
                  // Optical: the rule sits between rows, 3 pt each side reads as one line.
                  marginVertical: 3,
                  backgroundColor: palette.ink,
                  borderRadius: 1,
                }}
              />
            ) : null}
            <View
              accessible={given}
              accessibilityLabel={given ? spokenRow(r) : undefined}
              style={{ flexDirection: 'row' }}
            >
              {r.cells.map((c, i) =>
                isBox(c) ? (
                  box(c, row, carry)
                ) : (
                  <View
                    key={`c${i}`}
                    style={{
                      width: col,
                      height: carry ? ROW_CARRY : given ? ROW_GIVEN : ROW_BOX,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {c !== null ? (
                      <Text
                        accessible={false}
                        style={{
                          color: palette.ink,
                          fontSize: DIGIT_SIZE,
                          lineHeight: 30,
                          fontWeight: '600',
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {c.text}
                      </Text>
                    ) : null}
                  </View>
                ),
              )}
            </View>
          </View>
        );
      })}
    </View>
  );

  const key = (digit: string) => (
    <View key={digit} style={{ flex: 1 }}>
      <Btn
        variant="soft"
        size="sm"
        full
        disabled={disabled || chosen === null}
        onPress={() => press(digit)}
        accessibilityLabel={digit}
        label={
          <Text
            style={{ color: palette.primaryDk, fontSize: 20, lineHeight: 24, fontWeight: '700' }}
          >
            {digit}
          </Text>
        }
      >
        {digit}
      </Btn>
    </View>
  );

  return (
    <>
      <PartsArea>
        <View
          onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
          style={{ gap: SPACE.sm }}
        >
          {Object.keys(digits).length === 0 ? (
            <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('written.how')}</Text>
          ) : null}
          <View
            style={{
              alignSelf: 'center',
              paddingVertical: SPACE.xs,
              paddingHorizontal: SPACE.sm,
              borderRadius: 16,
              backgroundColor: ink.paper,
              borderWidth: 1,
              borderColor: palette.hairline,
            }}
          >
            {grid}
          </View>
        </View>
      </PartsArea>
      <BottomBar>
        {/* A calculator's layout: ten digits in two rows of six slots, "Prüfen" in the last two
            (its "="). One row less than digits plus a pinned "Prüfen" under them — the row the
            five-row multiplication needs on 360×740 with Buddy's reply above it. */}
        <View
          accessibilityRole="toolbar"
          accessibilityLabel={t('written.pad')}
          style={{ gap: SPACE.sm }}
        >
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            {['1', '2', '3', '4', '5', '6'].map(key)}
          </View>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            {['7', '8', '9', '0'].map(key)}
            <View style={{ flex: 2 }}>
              <Btn
                size="sm"
                full
                disabled={disabled || !complete}
                onPress={submit}
                accessibilityHint={complete ? undefined : t('written.check_waits')}
              >
                {t('check')}
              </Btn>
            </View>
          </View>
        </View>
      </BottomBar>
    </>
  );
}
