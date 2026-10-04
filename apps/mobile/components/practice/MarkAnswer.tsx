// Markieren (issue #234): sie tippt Wörter an, das Wort, hinter das ein Komma gehört, oder den
// Buchstaben, nach dem eine Silbe endet. Ein zweiter Tipp nimmt die Markierung zurück —
// rückgängig statt bestätigen (docs/UX-PRINCIPLES.md). Gibt es Kategorien (Subjekt, Prädikat,
// Objekt), wählt sie zuerst die Kategorie — die erste ist schon gewählt — und dann die Wörter.
// „Prüfen" in der Antworthülle (`AnswerShell`, #310) schickt die Markierungen als `parts`;
// geprüft wird auf dem Server, als Menge und ohne Modell (apps/api/src/modules/practice/mark.ts).
//
// Farbe ist nie das einzige Signal: ein markiertes Wort ist unterstrichen und trägt mit
// Kategorien deren Ziffer (①②③, dieselbe wie auf ihrer Schaltfläche); darunter steht in Worten,
// was markiert ist („Subjekt: die alte Oma"). Ein gesetztes Komma ist ein Komma hinter dem Wort,
// eine Silbengrenze ein Bindestrich hinter dem Buchstaben. Jede Stelle ist ein `<Btn>` mit
// `checked` — ein Screenreader hört „Hund, markiert" bzw. „Komma nach „ankamen"", angekreuzt.
//
// Platz (Regel 16, 360×740): jedes Ziel ist ein Btn der kleinen Größe, also 44 pt hoch, und nie
// schmaler als 44 pt. Wörter fließen wie Text und brechen um; Silben: jeder Buchstabe eine
// 44-pt-Kachel, ein Wort in einer ruhigen Fläche, die in sich umbricht. Die Grenzen im Vertrag
// (MARK_*) sind so gewählt, dass das Größte ohne Scrollen passt — gemessen in tests/web/mark.spec.ts.
// Ihr Stand liegt im Entwurf (`lib/drafts.ts`): er übersteht hell/dunkel und einen Neustart.

import {
  cutId,
  gapId,
  markedText,
  markTargets,
  type MarkCategory,
  type MarkPick,
  type MarkTaskView,
  type MarkWord,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BTN_PAD_COMPACT, Btn } from '../lb/Btn.js';
import { Segmented } from '../lb/Segmented.js';
import { AnswerShell } from './AnswerShell.js';

/** The label inside a compact Btn is never narrower than this: the target stays 44 pt wide. */
const LABEL_MIN = TOUCH - 2 * BTN_PAD_COMPACT;
/** The underline under a marked word: a bar, so it reads the same on every platform. */
const UNDERLINE = 3; // token-exempt: a stroke, not a gap — thick enough to see at arm's length
/** The digit a category carries, on its button and on every word marked with it. */
const DIGITS = ['①', '②', '③'];

/** A category as its button says it: "① Subjekt". */
function categoryLabel(c: MarkCategory, index: number): string {
  return `${DIGITS[index] ?? ''} ${c.name}`;
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

/** Her marks as kept in the draft, with anything that is not of this task left out. */
export function marksFrom(kept: string, view: MarkTaskView): MarkPick[] {
  const targets = new Set(markTargets(view));
  const cats = new Set(view.categories.map((c) => c.id));
  try {
    const list: unknown = JSON.parse(kept || '[]');
    if (!Array.isArray(list)) return [];
    const out: MarkPick[] = [];
    for (const x of list as unknown[]) {
      if (typeof x !== 'object' || x === null) continue;
      const { at, category } = x as Record<string, unknown>;
      if (typeof at !== 'string' || !targets.has(at) || out.some((m) => m.at === at)) continue;
      if (cats.size === 0 && category === null) out.push({ at, category: null });
      else if (typeof category === 'string' && cats.has(category)) out.push({ at, category });
    }
    return out;
  } catch {
    return [];
  }
}

type Props = {
  view: MarkTaskView;
  /** Where her marks are kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": at least one mark; `shown` is what she marked in words, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function MarkAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const { text: chosenKept, setText: choose } = useDraft(`${draftKey}.category`);
  const marks = marksFrom(kept, view);
  const { categories } = view;
  const chosen =
    categories.length === 0
      ? null
      : (categories.find((c) => c.id === chosenKept)?.id ?? categories[0]!.id);
  const tap = (at: string) =>
    keep((now) => JSON.stringify(toggleMark(marksFrom(now, view), at, chosen)));
  const own = { marks, categories, disabled, tap };

  return (
    <AnswerShell
      keeps="whole"
      flush
      answer={
        <View style={{ gap: SPACE.sm }}>
          {/* How to mark, only until the first mark: after that the marks say it. With
              categories, their buttons above the words say it (one is already chosen). */}
          {marks.length === 0 && categories.length === 0 ? (
            <Text style={[TYPE.small, { color: palette.ink2 }]}>{t(`mark.how_${view.mode}`)}</Text>
          ) : null}
          {categories.length > 0 ? (
            // One chosen at a time, each with the digit its words carry (the shared choice row).
            <Segmented
              size="sm"
              options={categories.map((c, i) => ({ value: c.id, label: categoryLabel(c, i) }))}
              value={chosen}
              onChange={choose}
            />
          ) : null}
          {view.mode === 'syllables' ? (
            <Syllables words={view.words} {...own} />
          ) : (
            <Words view={view} {...own} />
          )}
          {/* What is marked, in words (never colour alone). Commas stand in the sentence. With
              categories the names lead the line ("Subjekt: die Oma"), so it needs no prefix —
              on 360×740 that word was the line too many. */}
          {view.mode !== 'gaps' && marks.length > 0 ? (
            <Text
              testID="mark-summary"
              numberOfLines={3}
              style={[TYPE.small, { color: palette.ink2 }]}
            >
              {categories.length > 0
                ? markedText(view, marks)
                : t(view.mode === 'syllables' ? 'mark.split' : 'mark.marked', {
                    list: markedText(view, marks),
                  })}
            </Text>
          ) : null}
        </View>
      }
      action={{
        ready: marks.length > 0,
        disabled,
        onPress: () => onSubmit({ type: 'mark', marks }, markedText(view, marks)),
        waitsHint: t('mark.check_waits'),
      }}
    />
  );
}

type Own = {
  marks: readonly MarkPick[];
  categories: readonly MarkCategory[];
  disabled: boolean;
  tap: (at: string) => void;
};

/** Words and commas: every word a tile, flowing like text. */
function Words({ view, marks, categories, disabled, tap }: Own & { view: MarkTaskView }) {
  const { t } = useTranslation('practice');
  const gaps = view.mode === 'gaps';
  return (
    <View
      testID="mark-text"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.xs }}
    >
      {view.words.map((w, i) => {
        if (gaps && i === view.words.length - 1) {
          // No comma after the last word: it is read, never tapped.
          return <PlainWord key={w.id} word={w} />;
        }
        const at = gaps ? gapId(i) : w.id;
        const mark = marks.find((m) => m.at === at);
        const digit = mark?.category
          ? (DIGITS[categories.findIndex((c) => c.id === mark.category)] ?? null)
          : null;
        const name = categories.find((c) => c.id === mark?.category)?.name;
        return (
          <Btn
            key={w.id}
            size="sm"
            compact
            variant={mark ? 'soft' : 'outline'}
            checked={mark !== undefined}
            disabled={disabled}
            onPress={() => tap(at)}
            accessibilityLabel={
              gaps
                ? t('mark.gap', { word: w.text })
                : name
                  ? t('mark.word_in', { word: w.text, name })
                  : w.text
            }
            label={
              <WordLabel word={w} marked={!gaps && !!mark} comma={gaps && !!mark} digit={digit} />
            }
          >
            {w.text}
          </Btn>
        );
      })}
    </View>
  );
}

/** A word in its tile: the punctuation around it shown, underlined when marked. */
function WordLabel({
  word,
  marked,
  comma,
  digit,
}: {
  word: MarkWord;
  marked: boolean;
  comma: boolean;
  digit: string | null;
}) {
  const { palette } = useTheme();
  const ink = marked || comma ? palette.primaryDk : palette.ink;
  return (
    <View style={{ minWidth: LABEL_MIN, flexDirection: 'row', alignItems: 'baseline' }}>
      {word.lead ? <Text style={[TYPE.body, { color: palette.ink }]}>{word.lead}</Text> : null}
      <View>
        <Text style={[TYPE.body, { color: ink, fontWeight: marked ? '700' : '400' }]}>
          {word.text}
        </Text>
        <View
          style={{
            height: UNDERLINE,
            borderRadius: UNDERLINE,
            backgroundColor: marked ? palette.primary : 'transparent',
          }}
        />
      </View>
      {comma ? (
        <Text style={[TYPE.body, { color: palette.primaryDk, fontWeight: '800' }]}>,</Text>
      ) : null}
      {word.tail ? <Text style={[TYPE.body, { color: palette.ink }]}>{word.tail}</Text> : null}
      {/* The category's digit sits in the tile's top corner, in its padding: beside the word it
          made every marked tile wider, and the largest task took a row more on 360×740. */}
      {digit ? (
        <Text
          style={[
            TYPE.label,
            {
              position: 'absolute',
              top: -SPACE.sm,
              right: -BTN_PAD_COMPACT,
              color: palette.primaryDk,
            },
          ]}
        >
          {digit}
        </Text>
      ) : null}
    </View>
  );
}

/** The last word of a comma sentence: read with the rest, never a target. */
function PlainWord({ word }: { word: MarkWord }) {
  const { palette } = useTheme();
  return (
    <View
      style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: BTN_PAD_COMPACT }}
    >
      <Text
        style={[TYPE.body, { color: palette.ink }]}
      >{`${word.lead}${word.text}${word.tail}`}</Text>
    </View>
  );
}

/** Syllables: each word in a quiet field, each letter but its last a 44-pt target. */
function Syllables({ words, marks, disabled, tap }: Own & { words: readonly MarkWord[] }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <View testID="mark-text" style={{ gap: SPACE.sm }}>
      {words.map((w, wi) => {
        const letters = [...w.text];
        return (
          <View
            key={w.id}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: SPACE.xs,
              padding: SPACE.xs,
              borderRadius: RADIUS.frame,
              backgroundColor: palette.canvas,
            }}
          >
            {letters.map((ch, li) => {
              const at = cutId(wi, li + 1);
              const cut = marks.some((m) => m.at === at);
              const label = (
                <Text
                  style={[
                    TYPE.title,
                    { minWidth: LABEL_MIN, textAlign: 'center', color: palette.ink },
                  ]}
                >
                  {ch}
                  {cut ? (
                    <Text style={{ color: palette.primaryDk, fontWeight: '800' }}>-</Text>
                  ) : null}
                </Text>
              );
              if (li === letters.length - 1) {
                return (
                  <View
                    key={at}
                    style={{
                      minHeight: TOUCH,
                      justifyContent: 'center',
                      paddingHorizontal: BTN_PAD_COMPACT,
                    }}
                  >
                    {label}
                  </View>
                );
              }
              return (
                <Btn
                  key={at}
                  size="sm"
                  compact
                  variant={cut ? 'soft' : 'outline'}
                  checked={cut}
                  disabled={disabled}
                  onPress={() => tap(at)}
                  accessibilityLabel={t('mark.cut', {
                    before: letters.slice(0, li + 1).join(''),
                    word: w.text,
                  })}
                  label={label}
                >
                  {ch}
                </Btn>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
