// Multiple choice: every option is a full-width, tappable white card with a
// round letter (A, B, C – the letters voice mode reads out). An option that
// was already tried (and wasn't it) stays visible but can't be picked again:
// it fades, its letter turns into a quiet dash and "Schon ausprobiert" stands
// under it (never colour alone) – the conversation above says what happened
// with it. Choices may hold math ($…$).
// In voice mode SpokenChoiceBar pins a big mic under the options: what she
// says is sent as a text answer (the server matches it to a choice by its text).

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
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
  const voice = useVoiceInput({ purpose: 'answer', lang: null, context: prompt, onText });
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
  /** Absent when the session never shows the solution (homework help). */
  onReveal?: () => void;
  /** The quiet side option's words (default "Lösung zeigen"; "Überspringen" in a test). */
  revealLabel?: string;
  /** "Tipp": the next prepared hint; absent when none is left. */
  onHint?: () => void;
};

export function ChoiceList({
  choices,
  tried,
  disabled,
  onChoose,
  onReveal,
  revealLabel,
  onHint,
}: Props) {
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  // Short options (a number, a fraction, a word) sit two by two: all of them and the
  // question fit on the screen without scrolling.
  const grid = choices.length <= 4 && choices.every((c) => shortChoice(c));
  return (
    <View style={{ gap: 10 }}>
      <View style={grid ? { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } : { gap: 10 }}>
        {choices.map((choice, index) => {
          const wasTried = tried.has(choice);
          return (
            // The white card and its shadow sit around the button (Btn clips what is inside it).
            <View
              key={`${index}:${choice}`}
              style={[
                { borderRadius: CARD_RADIUS, backgroundColor: wasTried ? LB.canvas : LB.paper },
                grid ? { flexBasis: '45%', flexGrow: 1 } : null,
                wasTried ? null : SHADOW.soft,
              ]}
            >
              <Btn
                variant="ghost"
                pill
                full
                wrap
                disabled={disabled || wasTried}
                onPress={() => onChoose(index, choice)}
                accessibilityHint={wasTried ? t('choice_tried') : undefined}
                // Math in a choice is set properly; a screen reader hears it in words.
                label={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <LetterBadge letter={letterFor(index)} tried={wasTried} />
                    <View style={{ flexShrink: 1, gap: 2 }}>
                      <MathText
                        text={choice}
                        accessible={false}
                        style={{
                          color: wasTried ? LB.ink2 : LB.ink,
                          fontSize: 17,
                          lineHeight: 23,
                          fontWeight: '600',
                        }}
                      />
                      {wasTried ? (
                        <Text style={[TYPE.label, { color: LB.ink2, fontWeight: '500' }]}>
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
      {onReveal || onHint ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {onHint ? (
            <Btn
              variant="ghost"
              pill
              onPress={onHint}
              disabled={disabled}
              accessibilityLabel={t('hint_label')}
            >
              {t('hint')}
            </Btn>
          ) : null}
          {onReveal ? (
            <Btn variant="ghost" pill center onPress={onReveal} disabled={disabled}>
              {revealLabel ?? t('show_solution')}
            </Btn>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A number, a fraction or a word or two: what fits half the width. */
function shortChoice(choice: string): boolean {
  const plain = choice.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/[$\\{}]/g, '');
  return plain.trim().length <= 14;
}

/** Rounded, but still a card and not a pill (Btn's md pill radius: the card follows the button). */
const CARD_RADIUS = 24;
const BADGE = 34;

/** A, B, C … (after Z it simply goes on counting: 27, 28 …). */
function letterFor(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** The round letter in front of a choice; a tried one shows a dash instead (not only a paler colour). */
function LetterBadge({ letter, tried }: { letter: string; tried: boolean }) {
  return (
    <View
      style={{
        width: BADGE,
        height: BADGE,
        borderRadius: BADGE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tried ? LB.paper : LB.lavender,
        borderWidth: tried ? 1 : 0,
        borderColor: LB.ink4,
      }}
    >
      <Text
        style={{
          color: tried ? LB.ink3 : LB.primaryDk,
          fontSize: 15,
          lineHeight: 19,
          fontWeight: '700',
        }}
      >
        {tried ? '–' : letter}
      </Text>
    </View>
  );
}
