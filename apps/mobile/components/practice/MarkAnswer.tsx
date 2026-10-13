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
// eine Silbengrenze ein Bindestrich hinter dem Buchstaben. Jede Stelle ist ein Ziel mit
// `checked` — ein Screenreader hört „Hund, markiert" bzw. „Komma nach „ankamen"", angekreuzt.
//
// Aussehen (#599, Design components/practice/Answers.jsx `MarkText`, ui_kits/app/Extra.jsx
// `mark`): die Wörter stehen als Text auf einer Papierfläche, ohne Rahmen um jedes Wort; ein
// markiertes Wort ist hell-violett hinterlegt und unterstrichen. Wörter und Zeilen sind die eine
// Brett-Kachel in ihrer Textform (`components/lb/Tile.tsx`), die Kategorien ihre Wort-Pillen, die
// umbrechen. Die eine Zeile Anleitung steht UNTER dem Text. Das Design zeichnet weder Kategorien
// noch Kommas noch Silben: die bleiben, wie sie vor dem Redesign waren (Owner-Regel 2). Schrift
// (17) und Seitenabstand (8) der Wörter bleiben, weil der Vertrag damit die Zeilen zählt
// (`markRows`); das Design hätte 19 und 16.
//
// Platz (Regel 16, 360×740): jedes Ziel ist 44 pt hoch und nie schmaler als 44 pt. Die Ziele
// berühren sich ohne Lücke, so liest sich der Satz als Satz und jeder Punkt der Zeile ist ein Ziel. Die Ziffer einer Kategorie steht UNTER dem Wort, nicht
// daneben: eine Markierung macht eine Kachel nie breiter, die Zeilen stehen, bevor sie tippt, und
// ein Satzglieder-Satz von 12 Wörtern passt in zwei Zeilen (#368; vorher sieben Wörter). Die Grenzen
// im Vertrag (MARK_*, `markRows`) sind so gewählt, dass das Größte ohne Scrollen passt — gemessen in
// tests/web/mark.spec.ts.
// Ihr Stand liegt im Entwurf (`lib/drafts.ts`): er übersteht hell/dunkel und einen Neustart.
//
// Belegstelle (Zeilen, #368): sie tippt die Zeilen eines langen Lesetexts an, in denen eine Aussage
// steht — irgendwo im Text. Der Text ist hier die Antwortfläche: er steht in seinem eigenen
// Kasten, der als einziges scrollt („nur ein Text scrollt", `scroll-text`), mit denselben Zeilen
// wie über einer Lesefrage (`LineText` aus PassagePanel), jede Zeile ein Ziel. Über der Frage
// steht er dann nicht noch einmal (der Server schickt ihn dort erst, wenn die Frage zu ist).

import { PRACTICE_SCREEN } from '../../lib/theme/practiceScreen.js';
import { PRACTICE } from '../../lib/theme/practice.js';
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
import { BOARD } from '../../lib/theme/board.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BoardHint } from '../lb/BoardHint.js';
import { Btn } from '../lb/Btn.js';
import { Tile } from '../lb/Tile.js';
import { TileChoice } from '../lb/TileChoice.js';
import { AnswerShell } from './AnswerShell.js';
import { LineText } from './PassagePanel.js';
import type { FormProps } from './formProps.js';

/**
 * A word's tile: its own padding (`Btn bare`), the smallest step — the tiles touch, so this is the
 * air between two words of the sentence (`markRows` in the contract counts with it) — and never
 * narrower than a touch target.
 */
const WORD_PAD = SPACE.xs;
/**
 * The surface the letters of a word stand on, and the paper panel of a text's words (Extra.jsx
 * `mark`: paper, the card's corners). Both keep the side padding the contract's width model counts
 * with (`markRows`: 328 − 2 × 8).
 */
const SURFACE = { paddingHorizontal: SPACE.sm, borderRadius: RADIUS.md } as const;
const PANEL = { paddingHorizontal: SPACE.sm, borderRadius: RADIUS.lg } as const;
/**
 * One letter of a word to split: the longest word (MARK_SYLLABLE_LETTERS_MAX) fills a 360-pt
 * phone in one row with these cells — narrower than 44 pt, but the cells touch, so every point of
 * the row is a target (issue #234: a word is never wrapped, it must read as one word).
 */
const LETTER_CELL = PRACTICE.markLetterCell;
/** The bar that ends a syllable. */
const UNDERLINE = PRACTICE.markUnderline;
/** The line under a marked word (Answers.jsx MarkText): a bar, the same on every platform. */
const WORD_LINE = BOARD.mark.underline;
/**
 * A Belegstelle's text never shrinks below four lines' targets: it scrolls in its box, and the
 * conversation above gives way first (the answer shell's `keeps`).
 */
const LINES_KEEP = PRACTICE_SCREEN.markedPassageMin;
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
          {categories.length > 0 ? (
            // One chosen at a time, each with the digit its words carry: word pills that wrap,
            // so a long term ("Präpositionalobjekt") stays whole on a row of its own.
            <TileChoice
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
          {/* What a tap does, one line under the board for every kind of marking — until the
              first "Prüfen": then Buddy's reply says how it went, and on 360×740 it needs the
              room (the same as the one line of a select-all task, #240). */}
          {checkedOnce ? null : (
            <BoardHint testID="mark-how">
              {t(categories.length > 0 ? 'mark.how_sorted' : `mark.how_${view.mode}`)}
            </BoardHint>
          )}
          {/* What is marked, in words (never colour alone). Commas stand in the sentence. With
              categories the names lead the line ("Subjekt: die Oma"), so it needs no prefix —
              on 360×740 that word was the line too many. */}
          {view.mode !== 'gaps' && marks.length > 0 ? (
            <Text
              testID="mark-summary"
              numberOfLines={3}
              style={[TYPE.meta, { color: palette.ink2 }]}
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

/**
 * Words and commas: the sentence on a paper panel, every word a target, the targets touching and
 * flowing like text. A marked word takes the light primary and a line under it (Answers.jsx
 * MarkText) — no frame around a word.
 */
function Words({ view, marks, categories, disabled, tap }: Own & { view: MarkTaskView }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const gaps = view.mode === 'gaps';
  const sorted = categories.length > 0;
  return (
    <View
      testID="mark-text"
      style={[PANEL, { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: palette.paper }]}
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
          <Tile
            key={w.id}
            shape="text"
            state={mark ? 'picked' : 'tile'}
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
          </Tile>
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
  return (
    <View style={{ minWidth: TOUCH, paddingHorizontal: WORD_PAD, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        {word.lead ? <Text style={[TYPE.body, { color: palette.ink }]}>{word.lead}</Text> : null}
        <View>
          {/* Never bold when marked: a bolder word is a wider tile, and the rows would move. */}
          <Text style={[TYPE.body, { color: palette.ink }]}>{word.text}</Text>
          <View
            style={{
              height: WORD_LINE,
              borderRadius: WORD_LINE,
              backgroundColor: marked ? palette.primary : 'transparent',
            }}
          />
        </View>
        {comma ? <Text style={[TYPE.markPunctuation, { color: palette.primaryDk }]}>,</Text> : null}
        {word.tail ? <Text style={[TYPE.body, { color: palette.ink }]}>{word.tail}</Text> : null}
      </View>
      {digit === null ? null : (
        // A no-break space keeps the row on an unmarked tile: an empty text has no height.
        <Text style={[TYPE.label, { color: palette.ink }]}>{digit || '\u00A0'}</Text>
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
        borderRadius: RADIUS.md,
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
          <Tile
            key={i}
            shape="text"
            full
            state={marked ? 'picked' : 'tile'}
            checked={marked}
            disabled={disabled}
            onPress={() => tap(at)}
            accessibilityLabel={`${t('reading.line', { n })}: ${line}`}
            label={<LineText n={n} line={line} lit={marked} numberShown={marked} />}
          >
            {line}
          </Tile>
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
      <Text style={[TYPE.markLetter, { textAlign: 'center', color: palette.ink }]}>{letter}</Text>
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
