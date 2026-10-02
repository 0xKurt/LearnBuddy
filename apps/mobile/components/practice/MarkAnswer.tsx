// Markieren (issue #234): sie tippt Wörter an, die Lücke zwischen zwei Wörtern (wo ein Komma
// hingehört) oder einen Buchstaben, nach dem eine Silbe endet. Ein zweiter Tipp nimmt die
// Markierung zurück — rückgängig statt bestätigen (docs/UX-PRINCIPLES.md). Gibt es Kategorien
// (Subjekt, Prädikat, Objekt), wählt sie zuerst die Kategorie — die erste ist schon gewählt —
// und dann die Wörter. „Prüfen" schickt die Markierungen als `parts`; geprüft wird auf dem
// Server, als Menge und ohne Modell (apps/api/src/modules/practice/mark.ts).
//
// Farbe ist nie das einzige Signal (Issue #234): ein markiertes Wort ist unterstrichen und trägt
// mit Kategorien deren Nummer; darunter steht, was markiert ist, in Worten („1 Subjekt: der
// Hund"). Ein gesetztes Komma ist ein Komma, eine Silbengrenze ein Bindestrich. Ein Screenreader
// hört „Hund, markiert als Subjekt" bzw. „Lücke nach „Hund", Komma gesetzt".
//
// Platz (Regel 16, 360×740): jedes Ziel ist mindestens 44 pt hoch und breit. Wörter fließen wie
// Text und brechen um; die Lücke zwischen zwei Wörtern ist schmal gezeichnet und greift mit
// `hitSlop` in die Wörter daneben, die selbst nicht antippbar sind — so ist sie 44 pt breit, ohne
// den Satz auseinanderzuziehen. Silben: jeder Buchstabe ist eine 44-pt-Kachel („nach diesem
// Buchstaben trennen"), sieben passen in eine Zeile. Die Grenzen in contracts/structured.ts
// (MARK_*) sind so gewählt, dass das Größte ohne Scrollen passt — gemessen im Walkthrough.

import type {
  MarkPick,
  MarkTaskView,
  MarkWord,
  StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { BottomBar } from './BottomBar.js';
import { PartsArea } from './PartsArea.js';

/** The narrow drawn slot between two words; `hitSlop` makes it a full target (see above). */
const GAP_WIDTH = 20;
const GAP_SLOP = (TOUCH - GAP_WIDTH) / 2;
/** A word is never narrower than the slop that reaches into it, so two gaps never overlap. */
const WORD_MIN = GAP_SLOP * 2;
/** A letter tile (syllables): one target, at the floor. */
const TILE = TOUCH;
/** The small number a marked word carries for its category. */
const BADGE = 18;

/** Every place she can tap in this view, in reading order (the server's ids, issue #234). */
export function targetsOf(view: Pick<MarkTaskView, 'mode' | 'words'>): string[] {
  switch (view.mode) {
    case 'words':
      return view.words.map((w) => w.id);
    case 'gaps':
      return view.words.slice(0, -1).map((_, i) => `g${i + 1}`);
    case 'syllables':
      return view.words.flatMap((w, wi) =>
        [...w.text].slice(0, -1).map((_, li) => `w${wi + 1}_${li + 1}`),
      );
  }
}

/**
 * One tap, as a pure step: a marked place loses its mark; with categories, a place marked in
 * another category moves to the chosen one; an unmarked place is marked (with the chosen one).
 */
export function toggleMark(
  marks: readonly MarkPick[],
  at: string,
  category: string | null,
): MarkPick[] {
  const had = marks.find((m) => m.at === at);
  if (!had) return [...marks, { at, category }];
  if (had.category === category) return marks.filter((m) => m !== had);
  return marks.map((m) => (m === had ? { at, category } : m));
}

/** Her marks as kept in the draft, with anything not of this task left out. */
export function marksFrom(kept: string, view: MarkTaskView): MarkPick[] {
  const targets = new Set(targetsOf(view));
  const cats = new Set(view.categories.map((c) => c.id));
  try {
    const list: unknown = JSON.parse(kept || '[]');
    if (!Array.isArray(list)) return [];
    const out: MarkPick[] = [];
    for (const x of list) {
      if (typeof x !== 'object' || x === null) continue;
      const { at, category } = x as Record<string, unknown>;
      if (typeof at !== 'string' || !targets.has(at) || out.some((m) => m.at === at)) continue;
      const ok =
        cats.size === 0 ? category === null : typeof category === 'string' && cats.has(category);
      if (ok) out.push({ at, category: category as string | null });
    }
    return out;
  } catch {
    return [];
  }
}

/** Words that stand next to each other read as one ("der Hund"); runs apart with a comma. */
function runs(words: readonly MarkWord[], ids: ReadonlySet<string>): string {
  const out: string[][] = [];
  let last = -2;
  words.forEach((w, i) => {
    if (!ids.has(w.id)) return;
    if (i === last + 1 && out.length > 0) out[out.length - 1]!.push(w.text);
    else out.push([w.text]);
    last = i;
  });
  return out.map((r) => r.join(' ')).join(', ');
}

/** What she marked, in words — the line under the text, and the answer in the conversation. */
export function marksText(view: MarkTaskView, marks: readonly MarkPick[]): string {
  if (view.mode === 'gaps') {
    const at = new Set(marks.map((m) => m.at));
    return view.words
      .map((w, i) => `${w.lead}${w.text}${at.has(`g${i + 1}`) ? ',' : ''}${w.tail}`)
      .join(' ');
  }
  if (view.mode === 'syllables') {
    const at = new Set(marks.map((m) => m.at));
    return view.words
      .map((w, wi) =>
        [...w.text].map((ch, li) => (at.has(`w${wi + 1}_${li + 1}`) ? `${ch}-` : ch)).join(''),
      )
      .join(' ');
  }
  if (view.categories.length === 0) return runs(view.words, new Set(marks.map((m) => m.at)));
  return view.categories
    .map((c) => {
      const ids = new Set(marks.filter((m) => m.category === c.id).map((m) => m.at));
      return ids.size === 0 ? null : `${c.name}: ${runs(view.words, ids)}`;
    })
    .filter((x): x is string => x !== null)
    .join('; ');
}

type Props = {
  view: MarkTaskView;
  /** Where her marks are kept (`lib/drafts.ts`): a theme change remounts the tree. */
  draftKey: string;
  disabled: boolean;
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function MarkAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const { text: chosenKept, setText: choose } = useDraft(`${draftKey}.category`);
  const marks = marksFrom(kept, view);
  const categories = view.categories;
  const chosen =
    categories.length === 0
      ? null
      : (categories.find((c) => c.id === chosenKept)?.id ?? categories[0]!.id);
  const numberOf = (category: string | null) =>
    category === null ? null : categories.findIndex((c) => c.id === category) + 1;
  const nameOf = (category: string | null) => categories.find((c) => c.id === category)?.name ?? '';
  const markOf = (at: string) => marks.find((m) => m.at === at);
  const tap = (at: string) =>
    keep((now) => JSON.stringify(toggleMark(marksFrom(now, view), at, chosen)));

  return (
    <>
      <PartsArea>
        <View style={{ gap: SPACE.sm }}>
          {/* How to mark, only until the first mark: after that the marks say it. */}
          {marks.length === 0 ? (
            <Text style={[TYPE.small, { color: palette.ink2 }]}>{t(`mark.how_${view.mode}`)}</Text>
          ) : null}
          {categories.length > 0 ? (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('mark.categories')}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}
            >
              {categories.map((c, i) => (
                <Btn
                  key={c.id}
                  size="sm"
                  pill
                  variant={c.id === chosen ? 'soft' : 'outline'}
                  selected={c.id === chosen}
                  disabled={disabled}
                  onPress={() => choose(c.id)}
                  accessibilityLabel={t('mark.category', { name: c.name })}
                  label={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <NumberBadge n={i + 1} on={c.id === chosen} />
                      <Text
                        style={{
                          color: c.id === chosen ? palette.primaryDk : palette.ink,
                          fontSize: 15,
                          lineHeight: 20,
                          fontWeight: '600',
                        }}
                      >
                        {c.name}
                      </Text>
                    </View>
                  }
                >
                  {c.name}
                </Btn>
              ))}
            </View>
          ) : null}
          <View
            testID="mark-text"
            style={{
              backgroundColor: palette.paper,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: palette.hairline,
              paddingHorizontal: SPACE.sm,
              paddingVertical: SPACE.xs,
            }}
          >
            {view.mode === 'syllables' ? (
              <View style={{ gap: SPACE.sm, paddingVertical: SPACE.xs }}>
                {view.words.map((w, wi) => (
                  <View key={w.id} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {[...w.text].map((ch, li, all) => {
                      const at = `w${wi + 1}_${li + 1}`;
                      const last = li === all.length - 1;
                      const cut = !last && markOf(at) !== undefined;
                      const before = all.slice(0, li + 1).join('');
                      return last ? (
                        <LetterTile key={at} letter={ch} cut={false} />
                      ) : (
                        <Pressable
                          key={at}
                          accessibilityRole="button"
                          accessibilityLabel={t(cut ? 'mark.cut_on' : 'mark.cut_off', {
                            before,
                            word: w.text,
                          })}
                          accessibilityState={{ selected: cut, disabled }}
                          disabled={disabled}
                          onPress={() => tap(at)}
                        >
                          {({ pressed }) => <LetterTile letter={ch} cut={cut} pressed={pressed} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                {view.words.map((w, i) => {
                  const last = i === view.words.length - 1;
                  if (view.mode === 'gaps') {
                    const at = `g${i + 1}`;
                    const set = markOf(at) !== undefined;
                    return (
                      // A word and the gap after it stay together on a line.
                      <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text
                          style={[
                            TYPE.body,
                            { minWidth: WORD_MIN, textAlign: 'center', color: palette.ink },
                          ]}
                        >
                          {`${w.lead}${w.text}${w.tail}`}
                        </Text>
                        {last ? (
                          <View style={{ width: SPACE.sm }} />
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(set ? 'mark.gap_on' : 'mark.gap_off', {
                              word: w.text,
                            })}
                            accessibilityState={{ selected: set, disabled }}
                            hitSlop={{ left: GAP_SLOP, right: GAP_SLOP }}
                            disabled={disabled}
                            onPress={() => tap(at)}
                          >
                            {({ pressed }) => <GapSlot set={set} pressed={pressed} />}
                          </Pressable>
                        )}
                      </View>
                    );
                  }
                  const mark = markOf(w.id);
                  const n = mark ? numberOf(mark.category) : null;
                  return (
                    <Pressable
                      key={w.id}
                      accessibilityRole="button"
                      accessibilityLabel={
                        mark
                          ? categories.length > 0
                            ? t('mark.word_in', { word: w.text, name: nameOf(mark.category) })
                            : t('mark.word_on', { word: w.text })
                          : t('mark.word_off', { word: w.text })
                      }
                      accessibilityState={{ selected: mark !== undefined, disabled }}
                      disabled={disabled}
                      onPress={() => tap(w.id)}
                    >
                      {({ pressed }) => (
                        <WordChip word={w} marked={mark !== undefined} n={n} pressed={pressed} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          {/* What is marked, in words (never colour alone) — words mode only: commas and
              hyphens are characters in the text already. */}
          {view.mode === 'words' && marks.length > 0 ? (
            <Text
              testID="mark-summary"
              numberOfLines={2}
              style={[TYPE.small, { color: palette.ink2 }]}
            >
              {t('mark.marked', { list: marksText(view, marks) })}
            </Text>
          ) : null}
        </View>
      </PartsArea>
      <BottomBar>
        <Btn
          pill
          full
          disabled={disabled || marks.length === 0}
          onPress={() => onSubmit({ type: 'mark', marks }, marksText(view, marks))}
          accessibilityHint={marks.length === 0 ? t('mark.check_waits') : undefined}
        >
          {t('check')}
        </Btn>
      </BottomBar>
    </>
  );
}

function NumberBadge({ n, on }: { n: number; on: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: BADGE,
        height: BADGE,
        borderRadius: BADGE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? palette.primary : palette.paper,
        borderWidth: on ? 0 : 1.5,
        borderColor: palette.field,
      }}
    >
      <Text
        style={{
          color: on ? palette.paper : palette.ink2,
          fontSize: 11,
          lineHeight: 14,
          fontWeight: '700',
        }}
      >
        {n}
      </Text>
    </View>
  );
}

function WordChip({
  word,
  marked,
  n,
  pressed,
}: {
  word: MarkWord;
  marked: boolean;
  n: number | null;
  pressed: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        minHeight: TOUCH,
        minWidth: TOUCH,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACE.xs,
        borderRadius: 10,
        backgroundColor: marked ? palette.primaryLt : pressed ? palette.canvas : 'transparent',
      }}
    >
      {word.lead ? <Text style={[TYPE.body, { color: palette.ink }]}>{word.lead}</Text> : null}
      <View>
        <Text
          style={[
            TYPE.body,
            {
              color: marked ? palette.primaryDk : palette.ink,
              fontWeight: marked ? '700' : '400',
            },
          ]}
        >
          {word.text}
        </Text>
        {/* The underline: a bar, not a text decoration — it reads the same on every platform. */}
        <View
          style={{
            height: 3,
            borderRadius: 2,
            marginTop: 1,
            backgroundColor: marked ? palette.primary : 'transparent',
          }}
        />
      </View>
      {word.tail ? <Text style={[TYPE.body, { color: palette.ink }]}>{word.tail}</Text> : null}
      {n !== null ? (
        <View style={{ marginLeft: SPACE.xs }}>
          <NumberBadge n={n} on />
        </View>
      ) : null}
    </View>
  );
}

function GapSlot({ set, pressed }: { set: boolean; pressed: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: GAP_WIDTH,
        height: TOUCH,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        backgroundColor: set ? palette.primaryLt : pressed ? palette.canvas : 'transparent',
      }}
    >
      {set ? (
        <Text style={{ color: palette.primaryDk, fontSize: 24, lineHeight: 28, fontWeight: '800' }}>
          ,
        </Text>
      ) : (
        // An empty slot: a short dotted mark where a comma could go.
        <View
          style={{
            width: 2,
            height: 18,
            borderRadius: 1,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: palette.field,
          }}
        />
      )}
    </View>
  );
}

function LetterTile({ letter, cut, pressed }: { letter: string; cut: boolean; pressed?: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: TILE,
        height: TILE,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: pressed ? palette.canvas : 'transparent',
      }}
    >
      <Text style={{ color: palette.ink, fontSize: 24, lineHeight: 30, fontWeight: '500' }}>
        {letter}
      </Text>
      {/* The cut after this letter, as a character: never colour alone. */}
      {cut ? (
        <Text
          style={{
            color: palette.primaryDk,
            fontSize: 24,
            lineHeight: 30,
            fontWeight: '800',
            marginLeft: 2,
          }}
        >
          -
        </Text>
      ) : null}
    </View>
  );
}
