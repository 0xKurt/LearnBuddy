// Multiple choice: every option is a full-width button. An option that was
// already tried (and wasn't it) stays visible but can't be picked again –
// the conversation above says what happened with it. Choices may hold math ($…$).

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { LB } from '../../lib/theme/colors.js';
import { Btn } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';

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
