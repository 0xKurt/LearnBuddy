// The field for typed answers (short, long, numeric, formula, vocab) with
// "Prüfen" and "Lösung zeigen" (not in homework help: there is no solution to show). A number's unit stands next to the field.
// Autocorrect is off so the phone never "fixes" what the learner actually
// wrote. For math questions a row of keys (², √, π, …) sits above the field
// and inserts at the cursor.

import type { ItemKind } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View, type KeyboardTypeOptions, type TextInput } from 'react-native';

import { hasMath } from '../../lib/math/parse.js';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { BottomBar } from './BottomBar.js';

/** AnswerRequest.text allows at most 2000 characters. */
const MAX_ANSWER_LENGTH = 2000;

type Props = {
  /** 'speak' questions use their own recorder; here they fall back to a plain text answer. */
  kind: ItemKind;
  /** The question text: a short answer to a question with math ($…$) gets the math keys too. */
  prompt?: string;
  unit: string | null;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onCheck: () => void;
  /** Absent when the session never shows the solution (homework help). */
  onReveal?: () => void;
};

export function AnswerComposer({
  kind,
  prompt = '',
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
  const showKeys = exact || (kind === 'short' && hasMath(prompt));
  const inputRef = useRef<TextInput>(null);
  // Where the cursor is (reported by the field); set `forced` once after an insert to move it.
  const selection = useRef<Selection | null>(null);
  const [forced, setForced] = useState<Selection | undefined>(undefined);

  const insert = (insertion: Insertion) => {
    const next = insertAtCursor(value, selection.current, insertion);
    if (next.value.length > MAX_ANSWER_LENGTH) return;
    selection.current = next.selection;
    onChange(next.value);
    setForced(next.selection);
    inputRef.current?.focus();
  };
  const canCheck = !disabled && value.trim().length > 0;
  // iOS number pads lack minus, comma and letters (units); this one has them all.
  const keyboardType: KeyboardTypeOptions =
    kind === 'numeric' && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

  return (
    <BottomBar>
      {showKeys ? <MathKeys onInsert={insert} disabled={disabled} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <LbTextInput
            ref={inputRef}
            value={value}
            onChangeText={onChange}
            selection={forced}
            onSelectionChange={(e) => {
              selection.current = e.nativeEvent.selection;
              if (forced) setForced(undefined);
            }}
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
        {onReveal ? (
          <Btn variant="ghost" onPress={onReveal} disabled={disabled}>
            {t('show_solution')}
          </Btn>
        ) : null}
        <View style={{ flex: 1 }}>
          <Btn full onPress={onCheck} disabled={!canCheck}>
            {t('check')}
          </Btn>
        </View>
      </View>
    </BottomBar>
  );
}
