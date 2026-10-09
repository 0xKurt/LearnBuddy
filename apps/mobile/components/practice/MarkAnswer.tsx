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
// schmaler als 44 pt. Wörter stehen wie Text auf einer ruhigen Fläche — dieselbe wie ein Wort zum
// Trennen —, ihre Kacheln berühren sich ohne Rahmen und Lücke, so liest sich der Satz als Satz und
// jeder Punkt der Zeile ist ein Ziel. Die Ziffer einer Kategorie steht UNTER dem Wort, nicht
// daneben: eine Markierung macht eine Kachel nie breiter, die Zeilen stehen, bevor sie tippt, und
// ein Satzglieder-Satz von 12 Wörtern passt in zwei Zeilen (#368; vorher sieben Wörter). Die Grenzen
// im Vertrag (MARK_*, `markRows`) sind so gewählt, dass das Größte ohne Scrollen passt — gemessen in
// tests/web/mark.spec.ts.
// Ihr Stand liegt im Entwurf (`lib/drafts.ts`): er übersteht hell/dunkel und einen Neustart.
//
// Belegstelle (Zeilen, #368): sie tippt die Zeilen eines langen Lesetexts an, in denen eine Aussage
// steht — irgendwo im Text. Der Text ist hier die Antwortfläche: er steht in seinem eigenen
// Kasten, der als einziges scrollt („nur ein Text scrollt", `scroll-text`), mit denselben Zeilen
// wie über einer Lesefrage (`LineText` aus PassagePanel), jede Zeile ein Btn. Über der Frage
// steht er dann nicht noch einmal (der Server schickt ihn dort erst, wenn die Frage zu ist).

import {
  cutId,
  gapId,
  lineId,
  lineNumbers,
  markedText,
  markTargets,
  type MarkCategory,
  type MarkPick,
  type MarkTaskView,
  type MarkWord,
} from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Segmented } from '../lb/Segmented.js';
import { AnswerShell } from './AnswerShell.js';
import { LineText } from './PassagePanel.js';
import type { FormProps } from './formProps.js';

/**
 * A word's tile: its own padding (`Btn bare`), the smallest step — the tiles touch, so this is the
 * air between two words of the sentence (`markRows` in the contract counts with it) — and never
 * narrower than a touch target.
 */
const WORD_PAD = SPACE.xs;
/** The calm surface the words of a text, or the letters of a word, stand on. */
const SURFACE = { paddingHorizontal: SPACE.sm, borderRadius: RADIUS.frame } as const;
/**
 * One letter of a word to split: the longest word (MARK_SYLLABLE_LETTERS_MAX) fills a 360-pt
 * phone in one row with these cells — narrower than 44 pt, but the cells touch, so every point of
 * the row is a target (issue #234: a word is never wrapped, it must read as one word).
 */
const LETTER_CELL = 30; // token-exempt: a letter's width, measured against MARK_SYLLABLE_LETTERS_MAX
/** The underline under a marked word: a bar, so it reads the same on every platform. */
const UNDERLINE = 3; // token-exempt: a stroke, not a gap — thick enough to see at arm's length
/**
 * A Belegstelle's text never shrinks below four lines' targets: it scrolls in its box, and the
 * conversation above gives way first (the answer shell's `keeps`).
 */
const LINES_KEEP = TOUCH * 4;
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

/** "Prüfen": at least one mark; `shown` is what she marked in words, for the thread. */
export function MarkAnswer({ view, draftKey, disabled, onSubmit }: FormProps<MarkTaskView>) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const { text: chosenKept, setText: choose } = useDraft(`${draftKey}.category`);
  // Whether she has pressed "Prüfen" here before (then Buddy's reply says how it went).
  const { text: checkedOnce, setText: markChecked } = useDraft(`${draftKey}.checked`);
  const marks = marksFrom(kept, view);
  const { categories } = view;
  const chosen =
    categories.length === 0
      ? null
      : (categories.find((c) => c.id === chosenKept)?.id ?? categories[0]!.id);
  const tap = (at: string) =>
    keep((now) => JSON.stringify(toggleMark(marksFrom(now, view), at, chosen)));
  const own = { marks, categories, disabled, tap };
  const lines = view.mode === 'lines';
  // What is marked, in words — the lines as "Z. 15–16" in her language.
  const said = lines ? t('mark.lines', { list: markedText(view, marks) }) : markedText(view, marks);

  return (
    <AnswerShell
      keeps={lines ? LINES_KEEP : 'whole'}
      answer={
        <View style={{ gap: SPACE.sm, flexShrink: 1, minHeight: 0 }}>
          {/* What a tap does, one line in the same place for every kind of marking — until the
              first "Prüfen": then Buddy's reply says how it went, and on 360×740 it needs the
              room (the same as the one line of a select-all task, #240). */}
          {checkedOnce ? null : (
            <Text testID="mark-how" style={[TYPE.small, { color: palette.ink2 }]}>
              {t(categories.length > 0 ? 'mark.how_sorted' : `mark.how_${view.mode}`)}
            </Text>
          )}
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
          ) : lines ? (
            <Lines lines={view.lines} {...own} />
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
                ? said
                : t(view.mode === 'syllables' ? 'mark.split' : 'mark.marked', { list: said })}
            </Text>
          ) : null}
        </View>
      }
      action={{
        ready: marks.length > 0,
        disabled,
        onPress: () => {
          markChecked('1');
          onSubmit({ type: 'mark', marks }, said);
        },
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

/** Words and commas: every word a tile, the tiles touching, flowing like text. */
function Words({ view, marks, categories, disabled, tap }: Own & { view: MarkTaskView }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const gaps = view.mode === 'gaps';
  const sorted = categories.length > 0;
  return (
    <View
      testID="mark-text"
      style={[SURFACE, { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: palette.canvas }]}
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
            bare
            variant={mark ? 'soft' : 'ghost'}
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
              <WordLabel
                word={w}
                marked={!gaps && !!mark}
                comma={gaps && !!mark}
                digit={sorted ? (digit ?? '') : null}
              />
            }
          >
            {w.text}
          </Btn>
        );
      })}
    </View>
  );
}

/**
 * A word in its tile: the punctuation around it shown, underlined when marked. With categories the
 * category's digit stands under the word — in the meta text's size and full ink (in a corner,
 * smaller and tinted, it could hardly be read, dark mode above all) — and its row is there on every
 * tile, marked or not, so the words stand still while she marks them. `digit` null: no categories.
 */
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
    <View style={{ minWidth: TOUCH, paddingHorizontal: WORD_PAD, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        {word.lead ? <Text style={[TYPE.body, { color: palette.ink }]}>{word.lead}</Text> : null}
        <View>
          {/* Never bold when marked: a bolder word is a wider tile, and the rows would move. */}
          <Text style={[TYPE.body, { color: ink }]}>{word.text}</Text>
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
      </View>
      {digit === null ? null : (
        // A no-break space keeps the row on an unmarked tile: an empty text has no height.
        <Text style={[TYPE.label, { color: palette.ink, fontWeight: '700' }]}>
          {digit || '\u00A0'}
        </Text>
      )}
    </View>
  );
}

/** The last word of a comma sentence (no categories there): read with the rest, never a target. */
function PlainWord({ word }: { word: MarkWord }) {
  return (
    <View style={{ minHeight: TOUCH, justifyContent: 'center' }}>
      <WordLabel word={word} marked={false} comma={false} digit={null} />
    </View>
  );
}

/**
 * A Belegstelle: the reading text in its own box, every printed line a target the width of the
 * box and at least 44 pt high; a paragraph break is a little air, as above a reading question.
 */
function Lines({ lines, marks, disabled, tap }: Own & { lines: readonly string[] }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const numbers = lineNumbers(lines);
  return (
    <ScrollView
      testID="scroll-text"
      nestedScrollEnabled
      // Reachable by keyboard, like the text above a reading question (axe
      // `scrollable-region-focusable`).
      focusable
      accessibilityLabel={t('reading.label')}
      accessibilityHint={t('reading.scroll_hint')}
      style={{
        flexGrow: 0,
        flexShrink: 1,
        borderRadius: RADIUS.frame,
        backgroundColor: palette.paper,
      }}
      contentContainerStyle={{ paddingVertical: SPACE.xs }}
    >
      {lines.map((line, i) => {
        const n = numbers[i] ?? null;
        if (n === null) return <View key={i} style={{ height: SPACE.sm }} />;
        const at = lineId(n);
        const marked = marks.some((m) => m.at === at);
        return (
          <Btn
            key={i}
            size="sm"
            bare
            full
            variant={marked ? 'soft' : 'ghost'}
            checked={marked}
            disabled={disabled}
            onPress={() => tap(at)}
            accessibilityLabel={`${t('reading.line', { n })}: ${line}`}
            label={<LineText n={n} line={line} lit={marked} numberShown={marked} />}
          >
            {line}
          </Btn>
        );
      })}
    </ScrollView>
  );
}

/**
 * Syllables: one word per row, never wrapped, its letters set as text so it still reads as one
 * word. Each letter but the last is a target the full 44 pt high and one letter cell wide; the
 * cells touch, so there is no dead space between them. A cut stands as a bar between the letters.
 */
function Syllables({ words, marks, disabled, tap }: Own & { words: readonly MarkWord[] }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <View testID="mark-text" style={{ gap: SPACE.xs }}>
      {words.map((w, wi) => {
        const letters = [...w.text];
        return (
          <View
            key={w.id}
            style={[
              SURFACE,
              { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: palette.canvas },
            ]}
          >
            {letters.map((ch, li) => {
              const at = cutId(wi, li + 1);
              const cut = marks.some((m) => m.at === at);
              const cell = <LetterCell letter={ch} cut={cut} />;
              if (li === letters.length - 1) return <View key={at}>{cell}</View>;
              return (
                <Btn
                  key={at}
                  size="sm"
                  bare
                  variant="ghost"
                  checked={cut}
                  disabled={disabled}
                  onPress={() => tap(at)}
                  accessibilityLabel={t('mark.cut', {
                    before: letters.slice(0, li + 1).join(''),
                    word: w.text,
                  })}
                  label={cell}
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

/** One letter in its cell; the bar on its right edge when a syllable ends after it. */
function LetterCell({ letter, cut }: { letter: string; cut: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: LETTER_CELL, minHeight: TOUCH, justifyContent: 'center' }}>
      <Text
        style={[TYPE.displaySm, { textAlign: 'center', color: palette.ink, fontWeight: '500' }]}
      >
        {letter}
      </Text>
      {cut ? (
        <View
          testID="syllable-cut"
          style={{
            position: 'absolute',
            right: 0,
            top: SPACE.sm,
            bottom: SPACE.sm,
            width: UNDERLINE,
            borderRadius: UNDERLINE,
            backgroundColor: palette.primary,
          }}
        />
      ) : null}
    </View>
  );
}
