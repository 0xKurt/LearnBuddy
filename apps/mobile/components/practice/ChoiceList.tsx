// Multiple choice: every option is a tappable white tile with its letter in a quiet column of
// its own (A, B, C – the letters voice mode reads out). Options that each fit one line of half
// a screen stand two by two, all others one under the other, full width – which of the two it
// is, is arithmetic, see "what fits half a line" below. A fraction or term on its own is set
// large and centred. An option that was already tried (and wasn't it) stays visible but can't
// be picked again: it fades, its letter turns into a quiet dash and "Schon ausprobiert" stands
// under it (never colour alone) – the conversation above says what happened with it. Choices
// may hold math ($…$).
// Several right answers (issue #240, `SelectAllAnswer`): the same tiles, but each one a checkbox
// she ticks and unticks — a square box in the letter's column instead of the letter, the tile
// tinted while ticked (the box's check mark says it too, never colour alone). Up to six short
// options stand two by two; "Prüfen" sends the set.
// The lines of a worked solution whose wrong line she taps (Fehlerdetektiv, issue #260,
// `FindErrorAnswer`): the same tiles, one under the other, each with its line's number in the
// letter's column; the one she picks stays picked (a radio, the tile tinted) while she writes it
// right below. The task itself stands above them, numbered the same, but no tile: it is not one to
// pick.
// In voice mode `SpokenChoice` puts the mic in the answer shell's voice slot, pinned at the
// bottom where "Prüfen" stands for every other form (`CheckBar`, issue #310): what she says is
// sent as a text answer (the server matches it to a choice by its text).

import { SELECT_MAX, type Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View, type TextStyle } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { AnswerTile } from '../lb/AnswerTile.js';
import { Btn, BTN_PAD_COMPACT } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { ZoomViewer } from '../lb/ZoomViewer.js';
import { describeFigure, FigureView } from '../math/FigureView.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';

type SpokenChoiceProps = {
  /** The question (sent as context, so a short spoken answer is heard right). */
  prompt: string;
  disabled: boolean;
  onText: (text: string) => void;
  /** Read the question again (next to the mic: the voice controls together). */
  onReadAgain?: () => void;
};

/** Voice mode: the spoken way to answer options — say it instead of tapping it. */
export function SpokenChoice({ prompt, disabled, onText, onReadAgain }: SpokenChoiceProps) {
  const { t } = useTranslation('common');
  // Hands-free: listening ends when she pauses (on the phone), and starts again by itself.
  const voice = useVoiceInput({
    purpose: 'answer',
    lang: null,
    context: prompt,
    onText,
    untilPause: true,
  });
  useHandsFreeMic(voice, disabled, prompt);
  return (
    <View style={{ gap: SPACE.sm, alignItems: 'center' }}>
      <MicStatus voice={voice} />
      {/* One row next to the options' actions: the options stay on screen. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.md,
        }}
      >
        {onReadAgain ? (
          <Btn size="sm" variant="soft" pill icon="speak" onPress={onReadAgain}>
            {t('voice.read_again')}
          </Btn>
        ) : (
          <Text style={[TYPE.small, { flexShrink: 1 }]}>{t('voice.or_say')}</Text>
        )}
        <MicButton voice={voice} filled label={t('voice.answer')} disabled={disabled} />
      </View>
    </View>
  );
}

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
   * every option is a checkbox and a tap ticks or unticks it; unset, a tap answers.
   */
  ticked?: ReadonlySet<number>;
  /**
   * One option picked and kept picked (a line to correct, issue #260): every option is a radio,
   * the picked one tinted, and they stand one under the other. Unset, a tap answers.
   */
  picked?: number | null;
  /**
   * What stands in the letter's column instead of A, B, C (a line's number, #260), and how a
   * screen reader names it ("Zeile 2").
   */
  marks?: ReadonlyArray<{ mark: string; label: string }>;
  /** A line above the options, numbered like them but not one to tap (the task, #260). */
  lead?: { mark: string; text: string; label: string } | null;
  disabled: boolean;
  onChoose: (index: number, choice: string) => void;
};

export function ChoiceList({
  choices,
  figures,
  tried,
  ticked,
  disabled,
  onChoose,
  ...line
}: Props) {
  if (figures && figures.length === choices.length && choices.length > 0) {
    return (
      <FigureChoices
        choices={choices}
        figures={figures}
        tried={tried}
        disabled={disabled}
        onChoose={onChoose}
      />
    );
  }
  return (
    <TextChoices
      choices={choices}
      tried={tried}
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
  marks,
  lead = null,
  disabled,
  onChoose,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  // Short options (a word, a number, a fraction) sit two by two — but only when EVERY one of
  // them fits one line of half a screen, so the tiles of the grid are equally tall (issue #288).
  // What fits is arithmetic, not a feeling (see "what fits half a line" below). Options to tick
  // may be six: three rows of short ones (contracts/structured.ts, SELECT_MAX).
  // Lines to pick from are read top to bottom: never two by two, never set large and centred.
  const lines = picked !== undefined;
  const grid = !lines && twoColumnChoices(choices, ticked ? SELECT_MAX : CHOICE_GRID_MAX);
  return (
    <View
      style={grid ? { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP } : { gap: CARD_GAP }}
    >
      {lead ? (
        <View
          testID="choice-lead"
          accessible
          accessibilityLabel={`${lead.label}: ${speakMathText(lead.text, words)}`}
          style={{ flexDirection: 'row', gap: LETTER_GAP, paddingHorizontal: BTN_PAD_COMPACT }}
        >
          <LetterMark letter={lead.mark} tried={false} />
          <MathText
            text={lead.text}
            accessible={false}
            style={{ color: palette.ink, fontSize: CHOICE_FONT, lineHeight: CHOICE_LINE }}
          />
        </View>
      ) : null}
      {choices.map((choice, index) => {
        const wasTried = tried.has(choice);
        const on = (ticked?.has(index) ?? false) || picked === index;
        // A fraction or a term on its own is the thing to look at: set large and centred, at
        // least as large as the question's own line (issue #288, finding 4).
        const big = !lines && mathOnly(choice);
        const mark = marks?.[index];
        return (
          <AnswerTile
            key={`${index}:${choice}`}
            tried={wasTried}
            ticked={on}
            style={grid ? { flexBasis: '45%', flexGrow: 1 } : null}
          >
            <Btn
              variant="ghost"
              full
              wrap
              compact
              // The button fills its card: the tiles of a row are equally tall, and the whole
              // white area is tappable, not just its top.
              grow
              disabled={disabled || wasTried}
              onPress={() => onChoose(index, choice)}
              {...(ticked ? { checked: on } : {})}
              {...(lines ? { selected: on } : {})}
              accessibilityHint={wasTried ? t('choice_tried') : undefined}
              // Math in a choice is set properly; a screen reader hears it in words.
              label={
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: big ? 'center' : 'flex-start',
                    gap: LETTER_GAP,
                  }}
                >
                  {ticked ? (
                    <TickBox on={on} />
                  ) : (
                    <LetterMark letter={mark?.mark ?? letterFor(index)} tried={wasTried} />
                  )}
                  <View style={{ flex: 1, gap: 2, alignItems: big ? 'center' : 'flex-start' }}>
                    <MathText
                      text={choice}
                      accessible={false}
                      style={[
                        {
                          color: wasTried ? palette.ink2 : on ? palette.primaryDk : palette.ink,
                          fontSize: big ? MATH_CHOICE_FONT : CHOICE_FONT,
                          lineHeight: big ? MATH_CHOICE_LINE : CHOICE_LINE,
                          fontWeight: CHOICE_WEIGHT,
                        },
                        wholeWordsFit(choice, grid) ? WHOLE_WORDS : null,
                      ]}
                    />
                    {wasTried ? (
                      <Text style={[TYPE.label, { color: palette.ink2, fontWeight: '500' }]}>
                        {t('choice_tried')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              }
            >
              {mark
                ? `${mark.label}: ${speakMathText(choice, words)}`
                : speakMathText(choice, words)}
            </Btn>
          </AnswerTile>
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
// (issue #288). A tap answers, exactly as with words — one obvious way to use the form (#224,
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
// 89 pt at 740 (the two rows give back ≈ 40 pt), 101 pt at 844.

/** No option picture taller than this — an odd figure (a long table) is scaled down to it. */
const FIGURE_CHOICE_MAX_HEIGHT = 120;
/** Share of the window's height one option picture may take (see above). */
const FIGURE_CHOICE_SCREEN_SHARE = 0.12;

function FigureChoices({
  choices,
  figures,
  tried,
  disabled,
  onChoose,
}: Props & { figures: readonly Figure[] }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { t: tm } = useTranslation('math');
  const words = useSpokenWords();
  const [zoomed, setZoomed] = useState<number | null>(null);
  // What is on screen (issue #289): a tapped question has no keyboard up, so this is the window.
  const { visible: screenHeight } = useVisibleHeight();
  const pictureMax = Math.min(
    FIGURE_CHOICE_MAX_HEIGHT,
    Math.round(screenHeight * FIGURE_CHOICE_SCREEN_SHARE),
  );
  // What each option shows, in words (the letter first, as voice mode names them).
  const spoken = useMemo(
    () =>
      figures.map(
        (f, i) =>
          `${letterFor(i)}: ${describeFigure(f, tm, (x) => speakMathText(x, words), { formulas: false })}`,
      ),
    [figures, tm, words],
  );
  const open = zoomed !== null ? figures[zoomed] : undefined;
  return (
    <View testID="figure-choices" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
      {choices.map((choice, index) => {
        const wasTried = tried.has(choice);
        const figure = figures[index]!;
        return (
          // A tried picture keeps its white ground and steps back by its hairline (AnswerTile)
          // and by fading the drawing.
          <AnswerTile
            key={`${index}:${choice}`}
            tried={wasTried}
            picture
            style={{ flexBasis: '45%', flexGrow: 1 }}
          >
            <Btn
              variant="ghost"
              full
              wrap
              compact
              grow
              disabled={disabled || wasTried}
              onPress={() => onChoose(index, choice)}
              onLongPress={() => setZoomed(index)}
              accessibilityHint={wasTried ? t('choice_tried') : t('choice_zoom_hint')}
              label={
                <View style={{ gap: SPACE.xs }}>
                  {/* The letter's own row. A tried option says so in words there instead — at
                      360 pt "– Schon ausprobiert" did not fit next to a mark, and the words are
                      what carries it (never colour alone). */}
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', minHeight: CHOICE_LINE }}
                  >
                    {wasTried ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          TYPE.label,
                          { flexShrink: 1, color: palette.ink2, fontWeight: '600' },
                        ]}
                      >
                        {t('choice_tried')}
                      </Text>
                    ) : (
                      <LetterMark letter={letterFor(index)} tried={false} />
                    )}
                  </View>
                  <View style={{ opacity: wasTried ? 0.45 : 1 }}>
                    <FigureView figure={figure} bare maxHeight={pictureMax} />
                  </View>
                </View>
              }
            >
              {spoken[index]!}
            </Btn>
          </AnswerTile>
        );
      })}
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
// The arithmetic, on the NARROW phone, because the same decision has to hold on both sizes of
// CLAUDE.md rule 16 (what fits 360 fits 390):
//
//     360 pt                 the small Android
//   −   2 × 16 pt            the padding around the options (app/practice/[id].tsx)
//   −       8 pt             the gap between the two tiles of a row
//   ───────────── / 2
//   =     160 pt             one tile
//   −   2 × 12 pt            the tile's padding (BTN_PAD_COMPACT)
//   −      16 pt             the letter's column (LETTER_COL)
//   −      12 pt             letter to text (LETTER_GAP)
//   ─────────────
//   =     108 pt             the text's own room, in one line
//
// At 0.64 em per character (EM_PER_CHAR) and 17 pt type that is 108 / 10.88 = 9.9 → an option of
// at most nine characters is certain to fit one line. A math-only option is set larger
// (MATH_CHOICE_FONT) and measured at that size.

/** The option's own type: 17 pt semibold (`CHOICE_WEIGHT` is what EM_PER_CHAR was measured at). */
const CHOICE_FONT = 17;
const CHOICE_LINE = 23;
const CHOICE_WEIGHT = '600';
/**
 * A math-only option ($\frac{2}{3}$, $x^{2}$): larger than the question's own 21 pt line, so a
 * stacked fraction's digits are not smaller than the sentence that asks about them.
 */
const MATH_CHOICE_FONT = 22;
const MATH_CHOICE_LINE = 29;
/** The gap between the tiles, across and down. */
const CARD_GAP = SPACE.sm;
/** The padding `app/practice/[id].tsx` puts around the options, left and right. */
const SCREEN_PAD = SPACE.lg;
/** The small Android of rule 16; 390 is wider, so whatever fits here fits there too. */
const NARROW_PHONE = 360;
/**
 * The letter's column: as wide as its widest letter at LETTER_FONT (a "W" ≈ 15 pt), so the texts
 * of all options start on one vertical line whatever letter stands before them. 16 is a width,
 * not spacing.
 */
const LETTER_COL = 16;
const LETTER_FONT = 15;
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
const EM_PER_CHAR = 0.64;

/** The room an option's text has in one line, by variant, on the narrow phone. */
const GRID_TEXT_ROOM =
  (NARROW_PHONE - 2 * SCREEN_PAD - CARD_GAP) / 2 - 2 * BTN_PAD_COMPACT - LETTER_COL - LETTER_GAP;
const LIST_TEXT_ROOM =
  NARROW_PHONE - 2 * SCREEN_PAD - 2 * BTN_PAD_COMPACT - LETTER_COL - LETTER_GAP;

/** How many single-choice options may stand two by two (two rows). */
const CHOICE_GRID_MAX = 4;

/** The longest option that still fits ONE line of a grid tile: 9 characters. */
export const GRID_CHARS_MAX = Math.floor(GRID_TEXT_ROOM / (CHOICE_FONT * EM_PER_CHAR));
/** The longest word that fits one line of a full-width tile: 22 characters. */
const LIST_WORD_MAX = Math.floor(LIST_TEXT_ROOM / (CHOICE_FONT * EM_PER_CHAR));

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
  const font = mathOnly(choice) ? MATH_CHOICE_FONT : CHOICE_FONT;
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
  return grid || longestWord(plainChoice(choice)) <= LIST_WORD_MAX;
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
    <View style={{ height: CHOICE_LINE, justifyContent: 'center' }}>
      <View
        testID="choice-box"
        style={{
          width: TICK_BOX,
          height: TICK_BOX,
          borderRadius: 6, // token-exempt: the lb Checkbox's corner (9 on 26 pt), scaled to 20 pt
          borderWidth: 1.5,
          borderColor: on ? palette.primary : palette.field,
          backgroundColor: on ? palette.primary : palette.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <Icon name="check" size={14} color={palette.paper} /> : null}
      </View>
    </View>
  );
}

/** The box's side: a mark, not a target — the whole tile is what she taps. */
const TICK_BOX = 20;

/** A, B, C … (after Z it simply goes on counting: 27, 28 …). */
function letterFor(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/**
 * The letter before an option — the name voice mode reads out. A quiet mark in a column of its
 * own, not a badge on the content (issue #288): the accent's dark tone, no circle. A tried
 * option shows a dash instead (and says "Schon ausprobiert" in words — never colour alone).
 */
function LetterMark({ letter, tried }: { letter: string; tried: boolean }) {
  const { palette } = useTheme();
  return (
    <Text
      testID="choice-letter"
      style={{
        width: LETTER_COL,
        color: tried ? palette.ink3 : palette.primaryDk,
        fontSize: LETTER_FONT,
        // The first text line's height, so the letter sits on that line, not above it.
        lineHeight: CHOICE_LINE,
        fontWeight: '700',
      }}
    >
      {tried ? '–' : letter}
    </Text>
  );
}
