// Ordinary choices are full-width vertical Option rows, with left-aligned text and the
// factual letter in a circular badge. Selecting drafts an answer; the Composer submits it.
// Settled rows stay read-only: correct/wrong replace the left letter with a check/cross,
// while their native hints retain ownership and verdict information. Real tried/unjudged
// states keep their factual caption; ordinary verdicts do not repeat it below the answer.
// Checkbox, figure and code/numbered-line choices retain their separate presentation and
// payload paths. Mathematical text still uses the shared renderer, without enlarging or
// centring ordinary choices. No grading or session state is inferred here.

import { SELECT_MAX, type Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View, type TextStyle } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { useFigureNames } from '../../lib/math/useFigureNames.js';
import type { ChoiceMark } from '../../lib/practice/choiceMarks.js';
import { FigureSizingReport, useFigureSizing } from '../../lib/math/figureSizing.js';
import { usePictureCap } from '../../lib/practice/screenRoom.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { circle } from '../../lib/theme/radius.js';
import { fontFace, TYPE } from '../../lib/theme/type.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { Tile } from '../lb/Tile.js';
import { Option, type OptionState } from '../lb/Option.js';
import { PRACTICE } from '../../lib/theme/practice.js';
import { Icon } from '../lb/Icon.js';
import { ZoomViewer } from '../lb/ZoomViewer.js';
import { keepSpaces } from './CodeBlock.js';
import { describeFigure } from '../math/describeFigure.js';
import { FigureView } from '../math/FigureView.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';

type Props = {
  choices: string[];
  /**
   * One picture per option, parallel to `choices` (issue #231): the options ARE these
   * pictures, shown two by two instead of the texts. Ignored unless there is one per option.
   */
  figures?: readonly Figure[] | null;
  /** Options already answered and judged not right. */
  tried: ReadonlySet<string>;
  /**
   * Several may be right (select-all, issue #240): the options she has ticked, by index. Set,
   * every option is a checkbox and a tap ticks or unticks it; unset, a tap selects a draft for Composer Check.
   */
  ticked?: ReadonlySet<number>;
  /**
   * One option picked and kept picked (a line to correct, issue #260): every option is a radio,
   * the picked one tinted, and they stand one under the other. Unset, a tap selects a draft for Composer Check.
   */
  picked?: number | null;
  /** A single drafted answer, independent of the conversation field. */
  selected?: number | null;
  /**
   * What stands in the letter's column instead of A, B, C (a line's number, #260), and how a
   * screen reader names it ("Zeile 2").
   */
  marks?: ReadonlyArray<{ mark: string; label: string }>;
  /** A line above the options, numbered like them but not one to tap (the task, #260). */
  lead?: { mark: string; text: string; label: string } | null;
  /** The options are lines of code (#262): monospace, spaces kept, one under the other. */
  code?: boolean;
  /**
   * The question is closed (issue #521): what each option says now, parallel to `choices`
   * (`choiceMarks`). Set, nothing is tappable; unset, the options are open.
   */
  settled?: readonly ChoiceMark[] | null;
  disabled: boolean;
  /** A tap on an option; absent where nothing is to be chosen (a closed question, `settled`). */
  onChoose?: (index: number, choice: string) => void;
};

export function ChoiceList({
  choices,
  figures,
  tried,
  ticked,
  disabled,
  onChoose,
  settled = null,
  ...line
}: Props) {
  if (figures && figures.length === choices.length && choices.length > 0) {
    return (
      <FigureChoices
        choices={choices}
        figures={figures}
        tried={tried}
        settled={settled}
        selected={line.selected}
        disabled={disabled}
        onChoose={onChoose}
      />
    );
  }
  return (
    <TextChoices
      choices={choices}
      tried={tried}
      settled={settled}
      {...(ticked ? { ticked } : {})}
      {...line}
      disabled={disabled}
      onChoose={onChoose}
    />
  );
}

function TextChoices({
  choices,
  tried,
  ticked,
  picked,
  selected,
  marks,
  lead = null,
  code = false,
  settled = null,
  disabled,
  onChoose,
}: Props) {
  const { palette } = useTheme();
  const words = useSpokenWords();
  const said = useMarkWords();
  // Ordinary choices are full-width vertical rows. The separate checkbox branch retains its
  // short-option grid when every option fits; SELECT_MAX bounds its six selections.
  // Code and numbered lines retain their own vertical presentation.
  const lines = picked !== undefined || code;
  const grid = Boolean(ticked) && !lines && twoColumnChoices(choices, SELECT_MAX);
  return (
    <View
      style={
        grid
          ? { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }
          : { gap: lines ? PRACTICE.boardLineGap : ticked ? CARD_GAP : PRACTICE.optionRowGap }
      }
    >
      {lead ? (
        <View
          testID="choice-lead"
          accessible
          accessibilityLabel={`${lead.label}: ${speakMathText(lead.text, words)}`}
          style={{
            flexDirection: 'row',
            gap: LETTER_GAP,
            paddingHorizontal: PRACTICE.optionPadding,
          }}
        >
          <LetterMark letter={lead.mark} tried={false} />
          <MathText
            text={lead.text}
            accessible={false}
            style={[TYPE.option, { color: palette.ink }]}
          />
        </View>
      ) : null}
      {choices.map((choice, index) => {
        const state = markOf(choice, index, tried, settled);
        const { mine } = standing(state);
        const on = (ticked?.has(index) ?? false) || picked === index || selected === index;
        const note = said(state);
        // The separate checkbox branch retains its large centred mathematical choices.
        // Ordinary mathematical choices use the same left-aligned option role as plain text.
        const big = Boolean(ticked) && !lines && mathOnly(choice);
        const mark = marks?.[index];
        if (lines) {
          return (
            <Tile
              key={`${index}:${choice}`}
              shape="row"
              state={on || mine ? 'picked' : 'tile'}
              grow
              selected={on || mine}
              disabled={disabled || settled !== null || state === 'tried'}
              onPress={() => onChoose?.(index, choice)}
              accessibilityLabel={
                mark
                  ? `${mark.label}: ${code ? choice.trim() : speakMathText(choice, words)}`
                  : speakMathText(choice, words)
              }
              accessibilityHint={note?.hint}
              label={
                <View
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
                >
                  <Text
                    aria-hidden
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      TYPE.label,
                      { width: PRACTICE.lineMarkWidth, textAlign: 'center', color: palette.ink2 },
                    ]}
                  >
                    {mark?.mark ?? letterFor(index)}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0, gap: SPACE.xs }}>
                    {code ? (
                      <Text accessible={false} style={TYPE.code}>
                        {keepCodeIndent(choice)}
                      </Text>
                    ) : (
                      <MathText
                        text={choice}
                        accessible={false}
                        style={[TYPE.body, { color: palette.ink }]}
                      />
                    )}
                    {note ? <MarkWords state={state} text={note.text} /> : null}
                  </View>
                </View>
              }
            >
              {choice}
            </Tile>
          );
        }
        return (
          <Option
            key={`${index}:${choice}`}
            state={optionState(state, on)}
            checked={on || mine}
            radio={!ticked}
            readOnly={settled !== null || state === 'tried'}
            disabled={disabled && settled === null}
            style={grid ? { flexBasis: PRACTICE.gridBasis, flexGrow: 1 } : null}
            onPress={() => onChoose?.(index, choice)}
            accessibilityHint={note?.hint}
            accessibilityLabel={
              mark
                ? `${mark.label}: ${code ? choice.trim() : speakMathText(choice, words)}`
                : speakMathText(choice, words)
            }
            letter={ticked ? undefined : (mark?.mark ?? letterFor(index))}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: big ? 'center' : 'flex-start',
                gap: LETTER_GAP,
              }}
            >
              {ticked ? <TickBox on={on} /> : null}
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  gap: SPACE.xs,
                  alignItems: big ? 'center' : 'flex-start',
                }}
              >
                {code ? (
                  <Text accessible={false} style={TYPE.code}>
                    {keepCodeIndent(choice)}
                  </Text>
                ) : (
                  <MathText
                    text={choice}
                    accessible={false}
                    style={[
                      {
                        ...(big ? TYPE.question : TYPE.option),
                        color: palette.ink,
                      },
                      wholeWordsFit(choice, grid) ? WHOLE_WORDS : null,
                    ]}
                  />
                )}
                {note && (ticked || state === 'tried' || state === 'mine') ? (
                  <MarkWords state={state} text={note.text} />
                ) : null}
              </View>
            </View>
          </Option>
        );
      })}
    </View>
  );
}

// ─────────────── pictures as options (issue #231) ───────────────
//
// "Welcher Graph passt zu f(x) = x² − 1?": the options are four drawings, two by two, each in
// the same white tile as a text option. The letter stands in the tile's own top row, in the same
// quiet mark as on a text option — never on the drawing, where it covered an axis like a sticker
// (issue #288). A tap selects a draft for Composer Check, exactly as with words — one obvious way to use the form (#224,
// "Minimalismus"). Holding a tile opens its picture large in the viewer every figure already has
// (`ZoomViewer`): no extra button, no legend, nothing new to learn. The option's TEXT is not
// shown: it may be the very formula the question asks about. A screen reader hears the letter and
// the picture in words, by points the graph passes — never its formula (FigureView `bare`).
//
// The size, on the narrow phone of rule 16 (what fits 360 fits 390):
//   (360 − 2 × 16 − 8) / 2 = 160 pt a tile − 2 × 12 pt padding = 136 pt for the drawing,
//   a graph 4 : 5 as high as wide: ≈ 109 pt; with the letter's row (LETTER_LINE + 4) and the
//   padding a tile is ≈ 157 pt, two rows ≈ 322 pt.
//
// The height, on the short phone: once she has tried one, Buddy's reply and "Lösung zeigen"
// stand between question and tiles (#286: the board directly under them), and at 360×740 the
// second row ran 24 pt past the screen. So a drawing is never taller than 12 % of the window:
// 89 pt at 740 (the two rows give back ≈ 40 pt), 101 pt at 844 — and no taller than the room
// the screen measures left (`usePictureCap`, #599).

/** No option picture taller than this — an odd figure (a long table) is scaled down to it. */
const FIGURE_CHOICE_MAX_HEIGHT = PRACTICE.figureChoiceHeight;
/** Share of the window's height one option picture may take (see above). */
const FIGURE_CHOICE_SCREEN_SHARE = PRACTICE.figureChoiceShare;

function FigureChoices({
  choices,
  figures,
  tried,
  settled = null,
  selected,
  disabled,
  onChoose,
}: Props & { figures: readonly Figure[] }) {
  const { t } = useTranslation('practice');
  const { t: tm } = useTranslation('math');
  const said = useMarkWords();
  const words = useSpokenWords();
  const names = useFigureNames(...figures);
  const [zoomed, setZoomed] = useState<number | null>(null);
  // What is on screen (issue #289): a tapped question has no keyboard up, so this is the window.
  const { visible: screenHeight } = useVisibleHeight();
  // At most the share above; less where the screen measures less room (#599): a drawing in the
  // card over four pictures ran the bar 30 pt past 360×740. Two pictures to a row share it.
  // The pictures report their full height (`FigureSizingReport`): the room is taken from the
  // height they stand at, not from a cap they stand under.
  const sizing = useFigureSizing();
  const pictureMax = usePictureCap(
    `${choices.join('|')}:${screenHeight}`,
    Math.min(FIGURE_CHOICE_MAX_HEIGHT, Math.round(screenHeight * FIGURE_CHOICE_SCREEN_SHARE)),
    Math.ceil(choices.length / 2),
    false,
    sizing.natural,
  );
  // What each option shows, in words (the letter first, as voice mode names them).
  const spoken = useMemo(
    () =>
      figures.map(
        (f, i) =>
          `${letterFor(i)}: ${describeFigure(f, tm, names, (x) => speakMathText(x, words), { formulas: false })}`,
      ),
    [figures, tm, names, words],
  );
  const open = zoomed !== null ? figures[zoomed] : undefined;
  return (
    <View testID="figure-choices" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
      <FigureSizingReport.Provider value={sizing.value}>
        {choices.map((choice, index) => {
          const state = markOf(choice, index, tried, settled);
          const { back, mine } = standing(state);
          const note = said(state);
          const figure = figures[index]!;
          return (
            // A tried picture keeps its white ground and steps back by its hairline (`Option`)
            // and by fading the drawing.
            <Option
              key={`${index}:${choice}`}
              state={optionState(state, selected === index)}
              checked={selected === index || mine}
              readOnly={settled !== null || state === 'tried'}
              disabled={disabled}
              style={{ flexBasis: PRACTICE.gridBasis, flexGrow: 1 }}
              onPress={() => onChoose?.(index, choice)}
              onLongPress={() => setZoomed(index)}
              accessibilityHint={note?.hint ?? t('choice_zoom_hint')}
              accessibilityLabel={spoken[index]!}
            >
              <View style={{ gap: SPACE.xs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.xs,
                    minHeight: TYPE.option.lineHeight,
                  }}
                >
                  {note ? (
                    <MarkWords state={state} text={note.text} />
                  ) : settled ? null : (
                    <LetterMark
                      letter={letterFor(index)}
                      tried={false}
                      selected={selected === index}
                      size={PRACTICE.figureBadgeSize}
                    />
                  )}
                </View>
                <View style={{ opacity: back ? PRACTICE.disabledOpacity : 1 }}>
                  <FigureView figure={figure} bare maxHeight={pictureMax} />
                </View>
              </View>
            </Option>
          );
        })}
      </FigureSizingReport.Provider>
      <ZoomViewer
        visible={open !== undefined}
        onClose={() => setZoomed(null)}
        label={zoomed !== null ? (spoken[zoomed] ?? '') : ''}
      >
        {open ? (
          <View style={{ alignSelf: 'stretch' }}>
            <FigureView figure={open} bare />
          </View>
        ) : null}
      </ZoomViewer>
    </View>
  );
}

// ─────────────── what fits half a line (issues #203, #288) ───────────────
//
// In the owner's video "the homework" stood as "the / homewor / k": three lines, broken inside
// the word, and the card taller than its neighbour (#203). And even when no word broke, a grid in
// which one tile wraps to two lines and its neighbour does not looked restless (#288, finding 3).
// So two by two only when EVERY option fits ONE line of half a screen; otherwise one under the
// other, full width, where a longer option has a whole line.
//
// The conservative room budget follows actual theme geometry on the narrow phone: the page
// gutters and grid gap, asymmetric control padding, maximum selected border, badge and gap.
// Plain text uses TYPE.option; mathematical expressions keep TYPE.question.

/**
 * A math-only option ($\frac{2}{3}$, $x^{2}$): larger than the question's own 21 pt line, so a
 * stacked fraction's digits are not smaller than the sentence that asks about them.
 */

/** The gap between the tiles, across and down. */
const CARD_GAP = SPACE.sm;
/** The padding `app/practice/[id].tsx` puts around the options, left and right. */
const SCREEN_PAD = SPACE.lg;
/** The small Android of rule 16; 390 is wider, so whatever fits here fits there too. */
const NARROW_PHONE = PRACTICE.narrowPhone;
/**
 * The letter's column: as wide as its widest letter at LETTER_FONT (a "W" ≈ 15 pt), so the texts
 * of all options start on one vertical line whatever letter stands before them. 16 is a width,
 * not spacing.
 */
const LETTER_COL = PRACTICE.badgeSize;
const LETTER_GAP = SPACE.md;

/**
 * How wide one character of an option is at most, as a share of the font size.
 *
 * Measured, not guessed: the 6193 distinct words of the app's own five locale files
 * (`apps/mobile/locales/**`), set at 17 pt / weight 600 in the walkthrough's Chromium with
 * react-native-web's system font stack. Half of them sit at 0.52 em per character; the widest
 * nine-letter word ("Empecemos") is 98.0 pt = 0.64 em per character, and the widest ten-letter
 * one ("Angekommen") 110.3 pt. (A short pair like "mm" is wider per character — 0.89 — but far too
 * short to overflow anything, which is why the bound is taken at the length it decides about.)
 */
const EM_PER_CHAR = PRACTICE.optionCharacterEm;

/**
 * The room an option's text has in one line, by variant, on the narrow phone. Only options she
 * ticks stand two by two (`TextChoices`), so a grid tile's mark is their box (`TickBox`), not the
 * letter's badge: counted with the badge, the budget was eight characters, one short of the
 * contract's short option (`SELECT_SHORT_CHARS`) — "Nominativ" sent six cases to one column.
 */
const GRID_TEXT_ROOM =
  (NARROW_PHONE - 2 * SCREEN_PAD - CARD_GAP) / 2 -
  (PRACTICE.optionPaddingStart + PRACTICE.optionPaddingEnd) -
  2 * PRACTICE.selectedBorder -
  PRACTICE.checkboxSize -
  LETTER_GAP;
const LIST_TEXT_ROOM =
  NARROW_PHONE -
  2 * SCREEN_PAD -
  (PRACTICE.optionPaddingStart + PRACTICE.optionPaddingEnd) -
  2 * PRACTICE.selectedBorder -
  LETTER_COL -
  LETTER_GAP;

/** How many single-choice options may stand two by two (two rows). */
const CHOICE_GRID_MAX = PRACTICE.gridChoiceMax;

/** The longest plain option that fits one line of a grid tile. */
export function gridCharsMax(): number {
  return Math.floor(GRID_TEXT_ROOM / (TYPE.option.fontSize * EM_PER_CHAR));
}
/** The full-width word budget uses the same actual control geometry. */

/**
 * Do these options go two by two? Only up to `max` of them (four to choose one, six to tick), and
 * only when every one fits one line of half a screen — one that cannot sends all of them to the
 * full width, because a grid with one taller tile is the very thing #203 and #288 are about.
 */
export function twoColumnChoices(
  choices: readonly string[],
  max: number = CHOICE_GRID_MAX,
): boolean {
  return choices.length > 0 && choices.length <= max && choices.every((c) => fitsHalfLine(c));
}

/** One option in one line of a grid tile, at the size it is set in. */
function fitsHalfLine(choice: string): boolean {
  const font = mathOnly(choice) ? TYPE.question.fontSize : TYPE.option.fontSize;
  return plainWidth(choice) * font * EM_PER_CHAR <= GRID_TEXT_ROOM;
}

/**
 * Whether this option may be set with whole words only. True whenever its longest word fits
 * the line of the variant it is in — which the grid guarantees, so there it is always true.
 * A word longer than even the full width keeps the browser's last-resort break: a word wider
 * than the screen has to be cut somewhere, and cutting it is better than letting it run out of
 * the tile.
 */
function wholeWordsFit(choice: string, grid: boolean): boolean {
  return (
    grid ||
    longestWord(plainChoice(choice)) <=
      Math.floor(LIST_TEXT_ROOM / (TYPE.option.fontSize * EM_PER_CHAR))
  );
}

/** An option that is nothing but one piece of math ("$\frac{2}{3}$", "$x^{2}$"). */
export function mathOnly(choice: string): boolean {
  return /^\s*\$[^$]+\$\s*$/.test(choice);
}

/** The option as the learner reads it: math written out (`\frac{2}{3}` → `2/3`), no LaTeX marks. */
function plainChoice(choice: string): string {
  return choice
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/[$\\{}]/g, '')
    .trim();
}

/**
 * How many characters wide the option is drawn. A stacked fraction is as wide as the longer of
 * its two lines, not as "2/3" written in a row.
 */
function plainWidth(choice: string): number {
  const stacked = choice.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (_m, a: string, b: string) =>
    'x'.repeat(Math.max(a.length, b.length)),
  );
  return plainChoice(stacked).length;
}

/** The longest run without a space — the part that has to fit a line in one piece. */
function longestWord(text: string): number {
  return text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
}

/**
 * Never break inside a word.
 *
 * react-native-web's `Text` ships `word-wrap: break-word`, which is what produced
 * "homewor / k"; this takes it back to `normal`, so a line ends at a space or not at all.
 * Web only, and shaped like the other web-only style in the design system
 * (`components/lb/EdgeFade.tsx`): on a phone React Native breaks a Latin word only when it
 * cannot fit at all, which `twoColumnChoices` has already ruled out — **not verified on a
 * device in this change** (no iOS/Android run here), the rule above is what guarantees it.
 */
const WHOLE_WORDS: TextStyle | null =
  Platform.OS === 'web'
    ? ({ wordWrap: 'normal', overflowWrap: 'normal', wordBreak: 'normal' } as unknown as TextStyle)
    : null;

/**
 * The square box of an option to tick (issue #240): square with soft corners, because round
 * reads as "one of these" — the questionnaire's convention for "tick several". It stands in the
 * letter's column, centred on the first text line; at TICK_BOX it is 4 pt wider than the letter,
 * which still leaves a grid tile room for GRID_CHARS_MAX characters ((160 − 24 − 20 − 12) / 10.88
 * = 9.6). Ticked, it is filled and carries the check mark — never colour alone.
 */
function TickBox({ on }: { on: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ height: TYPE.option.lineHeight, justifyContent: 'center' }}>
      <View
        testID="choice-box"
        style={{
          width: TICK_BOX,
          height: TICK_BOX,
          borderRadius: PRACTICE.checkboxRadius,
          borderWidth: PRACTICE.checkboxBorder,
          borderColor: on ? palette.primary : palette.field,
          backgroundColor: on ? palette.primary : palette.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <Icon name="check" size={PRACTICE.checkboxIcon} color={palette.onPrimary} /> : null}
      </View>
    </View>
  );
}

/** The box's side: a mark, not a target — the whole tile is what she taps. */
const TICK_BOX = PRACTICE.checkboxSize;

/** A, B, C … (after Z it simply goes on counting: 27, 28 …). */
function letterFor(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/**
 * The letter before an option — the name voice mode reads out. A quiet mark in a column of its
 * own, not a badge on the content (issue #288): the accent's dark tone, no circle. A tried
 * option shows a dash instead (and says "Schon ausprobiert" in words — never colour alone).
 */
function LetterMark({
  letter,
  tried,
  selected = false,
  size = PRACTICE.badgeSize,
}: {
  letter: string;
  tried: boolean;
  selected?: boolean;
  size?: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: circle(size),
        backgroundColor: selected ? palette.primary : palette.canvas,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        testID="choice-letter"
        style={[
          TYPE.label,
          { color: tried ? palette.ink3 : selected ? palette.onPrimary : palette.primaryDk },
        ]}
      >
        {tried ? '–' : letter}
      </Text>
    </View>
  );
}

// ─────────────── a closed question's options (issue #521) ───────────────

/** How an option stands: open (`undefined`), tried while open, or what `choiceMarks` says. */
function markOf(
  choice: string,
  index: number,
  tried: ReadonlySet<string>,
  settled: readonly ChoiceMark[] | null,
): ChoiceMark | undefined {
  if (settled) return settled[index] ?? null;
  return tried.has(choice) ? 'tried' : undefined;
}

/** It steps back (tried, or not hers and not the right one), or it is hers (tinted). */
function standing(state: ChoiceMark | undefined): { back: boolean; mine: boolean } {
  return {
    back: state === 'tried' || state === null,
    mine: state === 'mine' || state === 'mine_right' || state === 'mine_wrong',
  };
}

/**
 * What an option says in words, and what a screen reader hears: "Schon ausprobiert", "Deine Wahl"
 * (with its verdict where one is shown), "Lösung"; null for an open or plain option.
 */
function useMarkWords(): (state: ChoiceMark | undefined) => { text: string; hint: string } | null {
  const { t } = useTranslation('practice');
  return (state) => {
    if (state === undefined || state === null) return null;
    if (state === 'tried') return { text: t('choice_tried'), hint: t('choice_tried') };
    // The word the solution card used to say it with (it has none for a multiple choice now).
    if (state === 'right') return { text: t('solution.title'), hint: t('solution.title') };
    const text = t('choice_mine');
    if (state === 'mine') return { text, hint: text };
    return {
      text,
      hint: `${text}, ${t(state === 'mine_right' ? 'verdict.correct' : 'verdict.incorrect')}`,
    };
  };
}

/**
 * The words under an option (or in a picture's row), after the shape of how it went: a check
 * (hers and right, or the right one), a cross (hers, not it) — like the verdict chip's check
 * before "Richtig". Quiet for a tried one, hers in the accent of her tinted tile, the right one in
 * the "right" green.
 */
function MarkWords({ state, text }: { state: ChoiceMark | undefined; text: string }) {
  const { palette } = useTheme();
  const color =
    state === 'right' ? palette.successText : state === 'tried' ? palette.ink2 : palette.primaryDk;
  const icon =
    state === 'right' || state === 'mine_right' ? 'check' : state === 'mine_wrong' ? 'close' : null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        minWidth: 0,
        gap: SPACE.xs,
      }}
    >
      {icon ? <Icon name={icon} size={MARK_ICON} color={color} /> : null}
      <Text
        style={[
          TYPE.label,
          // The label's size, a step lighter than its own 700: 500 for a tried one, 600 else.
          fontFace(state === 'tried' ? '500' : '600'),
          { flex: 1, minWidth: 0, color },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

/** The check or cross: a little larger than the words' line, so its shape reads at a glance. */
const MARK_ICON = PRACTICE.verdictIcon;

/** Server verdicts are distinct from a locally selected draft. */
function optionState(mark: ChoiceMark | undefined, selected: boolean): OptionState {
  if (mark === 'right' || mark === 'mine_right') return 'correct';
  if (mark === 'mine_wrong') return 'wrong';
  if (mark === 'tried' || mark === null) return 'dim';
  return selected || mark === 'mine' ? 'selected' : 'idle';
}

/** Preserve indentation while allowing ordinary code whitespace to wrap between words. */
function keepCodeIndent(line: string): string {
  const indent = line.match(/^\s*/)?.[0] ?? '';
  return keepSpaces(indent) + line.slice(indent.length);
}
