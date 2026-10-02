// Multiple choice: every option is a tappable white card with a round letter
// (A, B, C – the letters voice mode reads out). Short options stand two by two,
// longer ones one under the other, full width – which of the two it is, is
// arithmetic, see "what fits half a line" below. An option that was already
// tried (and wasn't it) stays visible but can't be picked again: it fades, its
// letter turns into a quiet dash and "Schon ausprobiert" stands under it (never
// colour alone) – the conversation above says what happened with it. Choices may
// hold math ($…$).
// In voice mode SpokenChoiceBar pins a big mic under the options: what she
// says is sent as a text answer (the server matches it to a choice by its text).

import { useTranslation } from 'react-i18next';
import { Platform, Text, View, type TextStyle } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn, BTN_PAD_COMPACT, BTN_PAD_MD } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { BottomBar } from './BottomBar.js';

type SpokenChoiceProps = {
  /** The question (sent as context, so a short spoken answer is heard right). */
  prompt: string;
  disabled: boolean;
  onText: (text: string) => void;
  /** Read the question again (next to the mic: the voice controls together). */
  onReadAgain?: () => void;
};

/** Voice mode: the pinned bar under the options – say the answer instead of tapping it. */
export function SpokenChoiceBar({ prompt, disabled, onText, onReadAgain }: SpokenChoiceProps) {
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
    <BottomBar>
      <MicStatus voice={voice} />
      {/* One row next to the options' actions: the options stay on screen. */}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}
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
    </BottomBar>
  );
}

type Props = {
  choices: string[];
  /** Options already answered and judged not right. */
  tried: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (index: number, choice: string) => void;
};

export function ChoiceList({ choices, tried, disabled, onChoose }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  // Short options (a number, a fraction, a word) sit two by two: all of them and the
  // question fit on the screen without scrolling. What counts as short is the arithmetic
  // below, not a character count alone (issue #203).
  const grid = twoColumnChoices(choices);
  return (
    <View style={{ gap: CARD_GAP }}>
      <View
        style={grid ? { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP } : { gap: CARD_GAP }}
      >
        {choices.map((choice, index) => {
          const wasTried = tried.has(choice);
          return (
            // The white card and its shadow sit around the button (Btn clips what is inside it).
            <View
              key={`${index}:${choice}`}
              style={[
                {
                  borderRadius: CARD_RADIUS,
                  backgroundColor: wasTried ? palette.canvas : palette.paper,
                },
                grid ? { flexBasis: '45%', flexGrow: 1 } : null,
                wasTried ? null : SHADOW.soft,
              ]}
            >
              <Btn
                variant="ghost"
                pill
                full
                wrap
                // In the grid the card gives the word every point it can spare, and the
                // button fills the card: two cards of a row are equally tall, so the whole
                // white area under the taller label is tappable and not just its top.
                compact={grid}
                grow={grid}
                disabled={disabled || wasTried}
                onPress={() => onChoose(index, choice)}
                accessibilityHint={wasTried ? t('choice_tried') : undefined}
                // Math in a choice is set properly; a screen reader hears it in words.
                label={
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: grid ? BADGE_GAP_GRID : BADGE_GAP,
                    }}
                  >
                    <LetterBadge letter={letterFor(index)} tried={wasTried} compact={grid} />
                    <View style={{ flexShrink: 1, gap: 2 }}>
                      <MathText
                        text={choice}
                        accessible={false}
                        style={[
                          {
                            color: wasTried ? palette.ink2 : palette.ink,
                            fontSize: CHOICE_FONT,
                            lineHeight: 23,
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
                {speakMathText(choice, words)}
              </Btn>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─────────────── what fits half a line (issue #203) ───────────────
//
// In the owner's video "the homework" stood as "the / homewor / k": three lines, broken
// inside the word, and the card taller than its neighbour. Two causes, both here. The
// decision to put options two by two counted CHARACTERS only (12 ≤ 14) and never asked
// whether the longest WORD fits a half-width line. And react-native-web gives every <Text>
// `word-wrap: break-word` (its own Text/index.js), so a word that did not fit was not moved
// to the next line — it was cut.
//
// So the grid is decided by arithmetic, on the NARROW phone, because the same decision has to
// hold on both sizes of CLAUDE.md rule 16 (what fits 360 fits 390):
//
//     360 pt                 the small Android
//   −   2 × 16 pt            the padding around the options (app/practice/[id].tsx)
//   −       8 pt             the gap between the two cards of a row
//   ───────────── / 2
//   =     160 pt             one card
//   −   2 × 12 pt            the compact pill's padding (BTN_PAD_COMPACT)
//   −      26 pt             the letter badge (BADGE_GRID)
//   −       8 pt             badge to text (BADGE_GAP_GRID)
//   ─────────────
//   =     102 pt             the text's own room, in one line
//
// At 0.64 em per character (EM_PER_CHAR) and 17 pt type that is 102 / 10.88 = 9.3 → a word of
// at most nine characters is certain to fit. A longer one sends the whole set to the full
// width, where there is a line it fits in.

/** The option's own type: 17 pt semibold (`CHOICE_WEIGHT` is what EM_PER_CHAR was measured at). */
const CHOICE_FONT = 17;
const CHOICE_WEIGHT = '600';
/** The gap between the cards, across and down. */
const CARD_GAP = SPACE.sm;
/** The padding `app/practice/[id].tsx` puts around the options, left and right. */
const SCREEN_PAD = SPACE.lg;
/** The small Android of rule 16; 390 is wider, so whatever fits here fits there too. */
const NARROW_PHONE = 360;
/** Rounded, but still a card and not a pill (Btn's md pill radius: the card follows the button). */
const CARD_RADIUS = 24;
/**
 * The round letter: 34 pt in the full-width list, 26 pt in the grid, where every point the
 * badge does not take is a point the word gets (issue #203). 26 and its 13 pt letter are
 * sizes, not spacing — the touch target is the card's, and `Btn`'s `minHeight` keeps that at
 * 48 pt (≥ TOUCH), which `tests/web/layout.spec.ts` measures.
 */
const BADGE = 34;
const BADGE_GRID = 26;
const BADGE_GAP = 14;
const BADGE_GAP_GRID = SPACE.sm;

/**
 * How wide one character of an option is at most, as a share of the font size.
 *
 * Measured, not guessed: the 6193 distinct words of the app's own five locale files
 * (`apps/mobile/locales/**`), set at 17 pt / weight 600 in the walkthrough's Chromium with
 * react-native-web's system font stack. Half of them sit at 0.52 em per character; the widest
 * nine-letter word ("Empecemos") is 98.0 pt = 0.64 em per character, and the widest ten-letter
 * one ("Angekommen") 110.3 pt. Against the 102 pt a card has, that is exactly the line this
 * budget has to draw. (A short pair like "mm" is wider per character — 0.89 — but far too
 * short to overflow anything, which is why the bound is taken at the length it decides about.)
 */
const EM_PER_CHAR = 0.64;

/** The room an option's text has in one line, by variant, on the narrow phone. */
const GRID_TEXT_ROOM =
  (NARROW_PHONE - 2 * SCREEN_PAD - CARD_GAP) / 2 -
  2 * BTN_PAD_COMPACT -
  BADGE_GRID -
  BADGE_GAP_GRID;
const LIST_TEXT_ROOM = NARROW_PHONE - 2 * SCREEN_PAD - 2 * BTN_PAD_MD - BADGE - BADGE_GAP;

/** The longest word that still fits one line of a card, by variant: 9 in the grid, 21 full width. */
export const GRID_WORD_MAX = Math.floor(GRID_TEXT_ROOM / (CHOICE_FONT * EM_PER_CHAR));
const LIST_WORD_MAX = Math.floor(LIST_TEXT_ROOM / (CHOICE_FONT * EM_PER_CHAR));

/**
 * How long a whole option may be for the grid. Unchanged: an option may still use two lines
 * of a card (and two short words often do), this only keeps a sentence out of the grid.
 */
export const GRID_CHARS_MAX = 14;

/**
 * Do these options go two by two? Only up to four of them (`max`), each short enough as a whole AND
 * with every word short enough for half a line — one word that cannot fit sends all of them
 * to the full width, because a grid with one three-line card is the very thing #203 is about.
 */
export function twoColumnChoices(
  choices: readonly string[],
  /** How many may stand two by two: four choices, six options to tick (three rows, #240). */
  max: number = 4,
): boolean {
  return choices.length > 0 && choices.length <= max && choices.every((c) => fitsHalfLine(c));
}

/** One option: short as a whole, and no word in it longer than half a line holds. */
function fitsHalfLine(choice: string): boolean {
  const text = plainChoice(choice);
  return text.length <= GRID_CHARS_MAX && longestWord(text) <= GRID_WORD_MAX;
}

/**
 * Whether this option may be set with whole words only. True whenever its longest word fits
 * the line of the variant it is in — which the grid guarantees, so there it is always true.
 * A word longer than even the full width (21 characters) keeps the browser's last-resort
 * break: a word wider than the screen has to be cut somewhere, and cutting it is better than
 * letting it run out of the card.
 */
function wholeWordsFit(choice: string, grid: boolean): boolean {
  return longestWord(plainChoice(choice)) <= (grid ? GRID_WORD_MAX : LIST_WORD_MAX);
}

/** The option as the learner reads it: math written out (`\frac{2}{3}` → `2/3`), no LaTeX marks. */
function plainChoice(choice: string): string {
  return choice
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/[$\\{}]/g, '')
    .trim();
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
 * The option cards' measures, for the select-all surface (issue #240): it sets its options on the
 * same cards, so the two kinds of choice look alike and the grid arithmetic above holds for both.
 */
export const CHOICE = {
  font: CHOICE_FONT,
  weight: CHOICE_WEIGHT,
  gap: CARD_GAP,
  radius: CARD_RADIUS,
  badgeGrid: BADGE_GRID,
  badgeGapGrid: BADGE_GAP_GRID,
} as const;

/** Whole words only where the option's longest word fits its line (see `wholeWordsFit`). */
export function wholeWordsStyle(choice: string, grid: boolean): TextStyle | null {
  return wholeWordsFit(choice, grid) ? WHOLE_WORDS : null;
}

/** A, B, C … (after Z it simply goes on counting: 27, 28 …). */
function letterFor(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** The round letter in front of a choice; a tried one shows a dash instead (not only a paler colour). */
function LetterBadge({
  letter,
  tried,
  compact,
}: {
  letter: string;
  tried: boolean;
  compact: boolean;
}) {
  const { palette } = useTheme();
  const size = compact ? BADGE_GRID : BADGE;
  const font = compact ? 13 : 15;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tried ? palette.paper : palette.lavender,
        borderWidth: tried ? 1 : 0,
        borderColor: palette.ink4,
      }}
    >
      <Text
        style={{
          color: tried ? palette.ink3 : palette.primaryDk,
          fontSize: font,
          // The letter's own line, one step above its size, so a 13 pt letter sits as
          // centred in its 26 pt circle as a 15 pt one does in 34.
          lineHeight: font + 4,
          fontWeight: '700',
        }}
      >
        {tried ? '–' : letter}
      </Text>
    </View>
  );
}
