// Multiple choice: every option is a full-width button. An option that was
// already tried (and wasn't it) stays visible but can't be picked again –
// the conversation above says what happened with it.

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Btn } from '../lb/Btn.js';

type Props = {
  choices: string[];
  /** Options already answered and judged not right. */
  tried: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (index: number, choice: string) => void;
  onReveal: () => void;
};

export function ChoiceList({ choices, tried, disabled, onChoose, onReveal }: Props) {
  const { t } = useTranslation('practice');
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
          >
            {choice}
          </Btn>
        );
      })}
      <View style={{ alignItems: 'center' }}>
        <Btn variant="ghost" center onPress={onReveal} disabled={disabled}>
          {t('show_solution')}
        </Btn>
      </View>
    </View>
  );
}
