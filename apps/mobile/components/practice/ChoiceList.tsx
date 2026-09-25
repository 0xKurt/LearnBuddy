// Multiple choice: every option is a full-width button. An option that was
// already tried (and wasn't it) stays visible but can't be picked again –
// the conversation above says what happened with it. Choices may hold math ($…$).
// In voice mode SpokenChoiceBar pins a big mic under the options: what she
// says is sent as a text answer (the server matches it to a choice by its text).

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { LB } from '../../lib/theme/colors.js';
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
};

/** Voice mode: the pinned bar under the options – say the answer instead of tapping it. */
export function SpokenChoiceBar({ prompt, disabled, onText }: SpokenChoiceProps) {
  const { t } = useTranslation('common');
  const voice = useVoiceInput({ purpose: 'answer', lang: null, context: prompt, onText });
  return (
    <BottomBar>
      <MicStatus voice={voice} />
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={[TYPE.small, { textAlign: 'center' }]}>{t('voice.or_say')}</Text>
        <MicButton voice={voice} size="lg" label={t('voice.answer')} disabled={disabled} />
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
};

export function ChoiceList({ choices, tried, disabled, onChoose, onReveal }: Props) {
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  return (
    <View style={{ gap: 10 }}>
      {choices.map((choice, index) => {
        const wasTried = tried.has(choice);
        return (
          <Btn
            key={`${index}:${choice}`}
            variant="outline"
            full
            wrap
            disabled={disabled || wasTried}
            onPress={() => onChoose(index, choice)}
            accessibilityHint={wasTried ? t('choice_tried') : undefined}
            // Math in a choice is set properly; a screen reader hears it in words.
            label={
              <MathText
                text={choice}
                accessible={false}
                style={{ color: LB.ink, fontSize: 16, lineHeight: 22, fontWeight: '600' }}
              />
            }
          >
            {speakMathText(choice, words)}
          </Btn>
        );
      })}
      {onReveal ? (
        <View style={{ alignItems: 'center' }}>
          <Btn variant="ghost" center onPress={onReveal} disabled={disabled}>
            {t('show_solution')}
          </Btn>
        </View>
      ) : null}
    </View>
  );
}
