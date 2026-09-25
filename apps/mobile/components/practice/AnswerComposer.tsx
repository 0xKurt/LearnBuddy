// The field for typed answers (short, long, numeric, formula) with "Prüfen"
// and "Lösung zeigen". A number's unit stands next to the field. Autocorrect
// is off so the phone never "fixes" what the learner actually wrote.

import type { ItemKind } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View, type KeyboardTypeOptions } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { BottomBar } from './BottomBar.js';

/** AnswerRequest.text allows at most 2000 characters. */
const MAX_ANSWER_LENGTH = 2000;

type Props = {
  kind: ItemKind;
  unit: string | null;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onCheck: () => void;
  onReveal: () => void;
};

export function AnswerComposer({
  kind,
  unit,
  value,
  disabled,
  onChange,
  onCheck,
  onReveal,
}: Props) {
  const { t } = useTranslation('practice');
  const long = kind === 'long';
  const exact = kind === 'numeric' || kind === 'formula';
  const canCheck = !disabled && value.trim().length > 0;
  // iOS number pads lack minus, comma and letters (units); this one has them all.
  const keyboardType: KeyboardTypeOptions =
    kind === 'numeric' && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

  return (
    <BottomBar>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <LbTextInput
            value={value}
            onChangeText={onChange}
            placeholder={t('answer.placeholder')}
            accessibilityLabel={t('answer.label')}
            accessibilityHint={unit ? t('answer.unit_hint', { unit }) : undefined}
            multiline
            maxLength={MAX_ANSWER_LENGTH}
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize={exact ? 'none' : 'sentences'}
            keyboardType={keyboardType}
            // Short answers go out with the return key; long ones need new lines.
            submitBehavior={long ? 'newline' : 'submit'}
            returnKeyType={long ? 'default' : 'send'}
            onSubmitEditing={() => {
              if (!long && canCheck) onCheck();
            }}
            style={{
              height: 'auto',
              minHeight: long ? 88 : 52,
              maxHeight: 150,
              paddingTop: 14,
              paddingBottom: 14,
              fontSize: 16,
              textAlignVertical: 'top',
            }}
          />
        </View>
        {unit ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[TYPE.body, { color: LB.ink2 }]}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      {/* One main action: "Prüfen" takes the room; "Lösung zeigen" stays a quiet side option. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Btn variant="ghost" onPress={onReveal} disabled={disabled}>
          {t('show_solution')}
        </Btn>
        <View style={{ flex: 1 }}>
          <Btn full onPress={onCheck} disabled={!canCheck}>
            {t('check')}
          </Btn>
        </View>
      </View>
    </BottomBar>
  );
}
