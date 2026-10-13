// Reihenfolge (issue #228): sie tippt die Elemente der Reihe nach an. Ein Tipp auf etwas
// Gelegtes nimmt es zurück, und alles, was danach kam, gleich mit: rückgängig statt bestätigen
// (docs/UX-PRINCIPLES.md). Sind alle gelegt, schickt „Prüfen" die Reihenfolge als `parts` —
// geprüft wird auf dem Server, exakt und ohne Modell (apps/api/src/modules/practice/structured.ts).
//
// Zwei Formen derselben Geste:
//   · Schritte (Text) bleiben, wo sie stehen — eine Spalte ganzer Zeilen, jede mit ihrer
//     Platz-Nummer im Kreis davor (Design components/practice/Tasks.jsx `OrderList`): frei eine
//     Papier-Kachel mit leerem Kreis, gelegt hell-violett mit der Nummer; die Schrift bleibt Tinte.
//   · Kurze Dinge (Zahlen) als Plätze und Vorrat (Gestaltung #286; im Design nicht gezeichnet):
//     oben stehen nummerierte Plätze, die Nummer ÜBER dem Feld und nie daneben — „1" vor „−12" las
//     sich wie eine Zahl, „4 ¾" wie ein gemischter Bruch. Unten liegt der Vorrat in gleich breiten
//     Kacheln; ein Tipp legt eine Kachel auf den nächsten freien Platz.
//
// Alle Stücke sind die eine Brett-Kachel (`components/lb/Tile.tsx`, #599): frei · gelegt · leerer
// Platz. Die eine Zeile Anleitung steht UNTER dem Brett (ui_kits/app/Tasks.jsx `Hint`).
//
// Farbe ist nie das einzige Signal: der Platz steht als Ziffer da, und ein Screenreader hört
// „…, Platz 2" bzw. „…, noch ohne Platz". Regel 16: acht Zahlen passen auf 360×740 (der
// Walkthrough misst es).

import { PRACTICE } from '../../lib/theme/practice.js';
import type { OrderTaskView } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { BOARD } from '../../lib/theme/board.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BoardHint } from '../lb/BoardHint.js';
import { Tile } from '../lb/Tile.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { AnswerShell } from './AnswerShell.js';
import { PartsArea } from './PartsArea.js';
import type { FormProps } from './formProps.js';

/**
 * One tap: an element without a place gets the next one; an element with a place goes
 * back, together with every element placed after it (they depended on it).
 */
export function placeOrTake(placed: readonly string[], id: string): string[] {
  const at = placed.indexOf(id);
  return at === -1 ? [...placed, id] : placed.slice(0, at);
}

/**
 * Her arrangement as kept in the draft (a JSON list of ids), with anything that is not an
 * element of this task — or not a list at all — left out.
 */
export function placedFrom(kept: string, ids: ReadonlySet<string>): string[] {
  try {
    const list: unknown = JSON.parse(kept || '[]');
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const id of list)
      if (typeof id === 'string' && ids.has(id) && !out.includes(id)) out.push(id);
    return out;
  } catch {
    return [];
  }
}

/** Short things (numbers, single short words) stand four to a row. */
const GRID_COLS = PRACTICE.orderColumns;
/** Plain characters a thing may have to stand in the grid (a fraction counts as its digits). */
const GRID_TEXT_MAX = PRACTICE.orderGridTextMax;

/** Whether every element is short enough for the grid: numbers and the like. */
export function isShortList(texts: readonly string[]): boolean {
  // Markup is not length: `$\frac{3}{4}$` is three characters on screen, not fourteen.
  const plain = (x: string) => x.replace(/\$|\\[a-z]+|[{}\s]/gi, '');
  return texts.every((x) => plain(x).length <= GRID_TEXT_MAX);
}

/** "Prüfen": every element placed; `shown` is her order in words, for the thread. */
export function OrderAnswer({ view, draftKey, disabled, onSubmit }: FormProps<OrderTaskView>) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const { text: kept, setText: keep } = useDraft(draftKey);
  const ids = new Set(view.elements.map((e) => e.id));
  const placed = placedFrom(kept, ids);
  const total = view.elements.length;
  const complete = placed.length === total;
  const textOf = new Map(view.elements.map((e) => [e.id, e.text]));

  const pool = view.elements.filter((e) => !placed.includes(e.id));
  const grid = isShortList(view.elements.map((e) => e.text));
  const [width, setWidth] = useState(0);
  const cell = grid && width > 0 ? Math.floor((width - (GRID_COLS - 1) * SPACE.sm) / GRID_COLS) : 0;

  const press = (id: string) => () =>
    keep((now) => JSON.stringify(placeOrTake(placedFrom(now, ids), id)));
  /** What a screen reader hears of an element: its words, its place, what a tap does. */
  const said = (text: string, n: number | null) => {
    const spoken = speakMathText(text, words);
    return {
      children: spoken,
      accessibilityLabel:
        n === null
          ? t('order.element_open', { text: spoken })
          : t('order.element_placed', { text: spoken, n }),
      accessibilityHint:
        n === null ? t('order.hint_open', { n: placed.length + 1 }) : t('order.hint_placed'),
    };
  };

  /** A short thing as a tile: placed (in a slot) or in the pool. Same name, same tap. */
  const tile = (id: string, n: number | null) => {
    const text = textOf.get(id) ?? '';
    return (
      <Tile
        key={id}
        shape="cell"
        state={n === null ? 'tile' : 'placed'}
        disabled={disabled}
        onPress={press(id)}
        {...said(text, n)}
        label={(color) => (
          // Centred as a block too: a fraction is drawn as a column, not as a line of text.
          <View style={{ alignItems: 'center' }}>
            <MathText
              text={text}
              accessible={false}
              style={{ flexShrink: 1, textAlign: 'center', ...TYPE.boardCompact, color }}
            />
          </View>
        )}
      />
    );
  };

  /** The next free place: the board's empty slot, nothing to tap — the pool fills it. */
  const emptySlot = (
    <Tile shape="cell" state="slot">
      {''}
    </Tile>
  );

  /** A place's number, above the place — never on the content ("1" beside "−12" reads as one number). */
  const placeNumber = (n: number) => (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[TYPE.metaStrong, { color: palette.ink2 }, { textAlign: 'center' }]}
    >
      {`${n}.`}
    </Text>
  );

  /** Every place, in order: what she has put there, or null while it is free. */
  const slots = view.elements.map((_, i) => placed[i] ?? null);

  return (
    <AnswerShell
      answer={
        <PartsArea>
          <View
            style={{ gap: BOARD.blockGap }}
            onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
          >
            {grid ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BOARD.gap }}>
                  {slots.map((id, i) => (
                    <View key={`slot-${i}`} style={{ width: cell, gap: SPACE.xs }}>
                      {placeNumber(i + 1)}
                      {id === null ? emptySlot : tile(id, i + 1)}
                    </View>
                  ))}
                </View>
                {pool.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BOARD.gap }}>
                    {pool.map((e) => (
                      <View key={e.id} style={{ width: cell }}>
                        {tile(e.id, null)}
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              // Steps (text): every step stays where it stands, a whole row, and gets its place
              // number in the badge (Tasks.jsx `OrderList`).
              <View style={{ gap: BOARD.gap }}>
                {view.elements.map((e) => {
                  const at = placed.indexOf(e.id);
                  const n = at === -1 ? null : at + 1;
                  return (
                    <Tile
                      key={e.id}
                      state={n === null ? 'tile' : 'placed'}
                      badge={n}
                      disabled={disabled}
                      onPress={press(e.id)}
                      {...said(e.text, n)}
                      label={(color) => (
                        <MathText
                          text={e.text}
                          accessible={false}
                          style={{ ...TYPE.option, color }}
                        />
                      )}
                    />
                  );
                })}
              </View>
            )}
            {/* The one line of instruction, only until she has started — under the board. */}
            {placed.length === 0 ? <BoardHint>{t('order.how')}</BoardHint> : null}
          </View>
        </PartsArea>
      }
      action={{
        ready: complete,
        disabled,
        onPress: () =>
          onSubmit(
            { type: 'order', order: placed },
            placed.map((id) => textOf.get(id) ?? '').join(' → '),
          ),
        waitsHint: t('order.check_waits'),
      }}
    />
  );
}
