// Reihenfolge (issue #228): sie tippt die Elemente der Reihe nach an. Ein Tipp auf etwas
// Gelegtes nimmt es zurück, und alles, was danach kam, gleich mit: rückgängig statt bestätigen
// (docs/UX-PRINCIPLES.md). Sind alle gelegt, schickt „Prüfen" die Reihenfolge als `parts` —
// geprüft wird auf dem Server, exakt und ohne Modell (apps/api/src/modules/practice/structured.ts).
//
// Zwei Formen derselben Geste:
//   · Schritte (Text) bleiben, wo sie stehen, und bekommen ihre Platz-Nummer im Kreis davor.
//   · Kurze Dinge (Zahlen) als Plätze und Vorrat (Gestaltung #286): oben stehen nummerierte
//     Plätze, die Nummer ÜBER dem Feld und nie daneben — „1" vor „−12" las sich wie eine Zahl,
//     „4 ¾" wie ein gemischter Bruch. Unten liegt der Vorrat in gleich breiten Kacheln; ein Tipp
//     legt eine Kachel auf den nächsten freien Platz.
//
// Farbe ist nie das einzige Signal: der Platz steht als Ziffer da, und ein Screenreader hört
// „…, Platz 2" bzw. „…, noch ohne Platz". Regel 16: acht Zahlen und acht Schritte passen auf
// 360×740 (der Walkthrough misst es).

import type { OrderTaskView } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { Btn } from '../lb/Btn.js';
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

/** The round number in front of an element; an empty ring while it has no place. */
const BADGE = 26;

/**
 * The words on an element, in the grid and in the list.
 * token-exempt: 15/20, TYPE.small's size on a line one point tighter.
 */
const ELEMENT_TEXT = { fontSize: 15, lineHeight: 20 } as const;

function PlaceBadge({ n }: { n: number | null }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: BADGE,
        height: BADGE,
        borderRadius: circle(BADGE),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: n === null ? palette.paper : palette.primary,
        borderWidth: n === null ? 1.5 : 0,
        borderColor: palette.field,
      }}
    >
      {n === null ? null : (
        // token-exempt: the place's digit, 14/18 inside the 26 pt badge
        <Text style={{ color: palette.paper, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>
          {n}
        </Text>
      )}
    </View>
  );
}

/** Short things (numbers, single short words) stand four to a row. */
const GRID_COLS = 4;
/** Plain characters a thing may have to stand in the grid (a fraction counts as its digits). */
const GRID_TEXT_MAX = 6;

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

  /** One element as a tile: placed (in a slot) or in the pool. Same name, same tap. */
  const tile = (id: string, n: number | null) => {
    const text = textOf.get(id) ?? '';
    const spoken = speakMathText(text, words);
    return (
      <Btn
        key={id}
        variant={n === null ? 'outline' : 'soft'}
        size="sm"
        full
        compact
        disabled={disabled}
        onPress={() => keep((now) => JSON.stringify(placeOrTake(placedFrom(now, ids), id)))}
        accessibilityLabel={
          n === null
            ? t('order.element_open', { text: spoken })
            : t('order.element_placed', { text: spoken, n })
        }
        accessibilityHint={
          n === null ? t('order.hint_open', { n: placed.length + 1 }) : t('order.hint_placed')
        }
        label={
          // Centred as a block too: a fraction is drawn as a column, not as a line of text.
          <View style={{ alignItems: 'center' }}>
            <MathText
              text={text}
              accessible={false}
              style={{
                flexShrink: 1,
                textAlign: 'center',
                color: n === null ? palette.ink : palette.primaryDk,
                ...ELEMENT_TEXT,
                fontWeight: '600',
              }}
            />
          </View>
        }
      >
        {spoken}
      </Btn>
    );
  };

  /** The next free place: a dashed outline, nothing to tap — the pool fills it. */
  const emptySlot = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        minHeight: TOUCH,
        // A tile's corners, like the small `Btn` that drops into it.
        borderRadius: RADIUS.tile,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: palette.field,
      }}
    />
  );

  /** A place's number, above the place — never on the content ("1" beside "−12" reads as one number). */
  const placeNumber = (n: number) => (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[TYPE.caption, { fontWeight: '700', color: palette.ink2 }, { textAlign: 'center' }]}
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
            style={{ gap: SPACE.md }}
            onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
          >
            {/* The one line of instruction, only until she has started. */}
            {placed.length === 0 ? (
              <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('order.how')}</Text>
            ) : null}
            {grid ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {slots.map((id, i) => (
                    <View key={`slot-${i}`} style={{ width: cell, gap: SPACE.xs }}>
                      {placeNumber(i + 1)}
                      {id === null ? emptySlot : tile(id, i + 1)}
                    </View>
                  ))}
                </View>
                {pool.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                    {pool.map((e) => (
                      <View key={e.id} style={{ width: cell }}>
                        {tile(e.id, null)}
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              // Steps (text): as they were (the owner, #286: these look fine) — every step stays
              // where it stands and gets its place number.
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                {view.elements.map((e) => {
                  const at = placed.indexOf(e.id);
                  const n = at === -1 ? null : at + 1;
                  const spoken = speakMathText(e.text, words);
                  return (
                    // The wrapper keeps a long step inside the screen: it may take the whole line
                    // and wrap, a short number sits next to its neighbours.
                    <View key={e.id} style={{ maxWidth: '100%' }}>
                      <Btn
                        variant={n === null ? 'outline' : 'soft'}
                        size="sm"
                        wrap
                        compact
                        disabled={disabled}
                        onPress={() =>
                          keep((now) => JSON.stringify(placeOrTake(placedFrom(now, ids), e.id)))
                        }
                        accessibilityLabel={
                          n === null
                            ? t('order.element_open', { text: spoken })
                            : t('order.element_placed', { text: spoken, n })
                        }
                        accessibilityHint={
                          n === null
                            ? t('order.hint_open', { n: placed.length + 1 })
                            : t('order.hint_placed')
                        }
                        label={
                          <View
                            style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
                          >
                            <PlaceBadge n={n} />
                            <MathText
                              text={e.text}
                              accessible={false}
                              style={{
                                flexShrink: 1,
                                color: n === null ? palette.ink : palette.primaryDk,
                                ...ELEMENT_TEXT,
                                fontWeight: '600',
                              }}
                            />
                          </View>
                        }
                      >
                        {spoken}
                      </Btn>
                    </View>
                  );
                })}
              </View>
            )}
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
