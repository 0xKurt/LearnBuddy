// The field for typed answers (short, long, numeric, formula, vocab) with
// "Prüfen" and "Lösung zeigen" (not in homework help: there is no solution to show). A number's unit stands next to the field.
// Autocorrect is off so the phone never "fixes" what the learner actually
// wrote. For math questions a row of keys (², √, π, …) sits above the field
// and inserts at the cursor.
//
// The field sits in one floating white pill with a filled mic, the same bar
// as Buddy's home composer (components/buddy/Composer.tsx).
//
// The mic next to the field writes what she said into it (numbers and
// fractions as such: "drei Viertel" → "3/4"), so she can check it. In voice
// mode the spoken answer is checked right away and the mic is the big main
// control; "Prüfen" and the field stay for typing.
//
// Under the field a live preview shows typed math set properly ("3/4" as a
// fraction), once there is math worth drawing (components/math/TypedMathPreview).

import type { ItemKind } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { hasMath } from '../../lib/math/parse.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { TypedMathPreview } from '../math/TypedMathPreview.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { BottomBar } from './BottomBar.js';

/** AnswerRequest.text allows at most 2000 characters. */
const MAX_ANSWER_LENGTH = 2000;

type Props = {
  /** 'speak' questions use their own recorder; here they fall back to a plain text answer. */
  kind: ItemKind;
  /** The question text: a short answer to a question with math ($…$) gets the math keys too. */
  prompt?: string;
  unit: string | null;
  /** The language the answer is spoken in (vocab: the item's answer language); null = the app language. */
  lang: string | null;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  /** Checks this answer (the field's text, or what she just said in voice mode). */
  onCheck: (value: string) => void;
  /** Absent when the session never shows the solution (homework help). */
  onReveal?: () => void;
  /** The quiet side option's words (default "Lösung zeigen"; "Überspringen" in a test). */
  revealLabel?: string;
  /** "Tipp": the next prepared hint; absent when none is left. */
  onHint?: () => void;
};

export function AnswerComposer({
  kind,
  prompt = '',
  unit,
  lang,
  value,
  disabled,
  onChange,
  onCheck,
  onReveal,
  revealLabel,
  onHint,
}: Props) {
  const { t } = useTranslation(['practice', 'common']);
  const voiceMode = useVoiceMode((s) => s.on);
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
  const latest = useRef({ value, disabled });
  latest.current = { value, disabled };

  const voice = useVoiceInput({
    purpose: 'answer',
    lang,
    context: prompt,
    onText: (said) => {
      // A long answer may be dictated in parts; a short one is replaced by what she said.
      const next = mergeTranscript(
        latest.current.value,
        said,
        long ? 'append' : 'replace',
        MAX_ANSWER_LENGTH,
      );
      onChange(next);
      if (useVoiceMode.getState().on && !latest.current.disabled) onCheck(next.trim());
    },
  });
  // iOS number pads lack minus, comma and letters (units); this one has them all.
  const keyboardType: KeyboardTypeOptions =
    kind === 'numeric' && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

  return (
    <BottomBar>
      <MicStatus voice={voice} />
      {showKeys ? <MathKeys onInsert={insert} disabled={disabled} /> : null}
      {/* One floating white pill, like the composer on Buddy's home: the field, the unit, the mic. */}
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 4,
            backgroundColor: LB.paper,
            borderRadius: long ? 26 : 30,
            paddingVertical: 6,
            paddingLeft: 16,
            paddingRight: 6,
            minHeight: 60,
          },
          SHADOW.float,
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          selection={forced}
          onSelectionChange={(e) => {
            selection.current = e.nativeEvent.selection;
            if (forced) setForced(undefined);
          }}
          placeholder={t('answer.placeholder')}
          placeholderTextColor={LB.ink3}
          accessibilityLabel={t('answer.label')}
          accessibilityHint={unit ? t('answer.unit_hint', { unit }) : undefined}
          multiline
          // The web's textarea starts two rows tall; one row, growing with the text.
          {...(Platform.OS === 'web' && !long ? { numberOfLines: 1 } : {})}
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
            if (!long && canCheck) onCheck(value.trim());
          }}
          textAlignVertical={long ? 'top' : 'center'}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: long ? 88 : 48,
            maxHeight: 150,
            alignSelf: 'center',
            backgroundColor: 'transparent',
            paddingHorizontal: 0,
            paddingTop: 13,
            paddingBottom: 13,
            fontSize: 16,
            lineHeight: 22,
            color: LB.ink,
          }}
        />
        {unit ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[TYPE.body, { color: LB.ink2, alignSelf: 'center', paddingHorizontal: 4 }]}
          >
            {unit}
          </Text>
        ) : null}
        {voiceMode ? null : (
          <MicButton
            voice={voice}
            size="sm"
            filled
            label={t('common:voice.answer')}
            disabled={disabled}
          />
        )}
      </View>
      {/* Long answers are texts; the preview would only repeat them. */}
      {long ? null : <TypedMathPreview value={value} />}
      {voiceMode ? (
        <View style={{ alignItems: 'center', paddingVertical: 2 }}>
          <MicButton voice={voice} size="lg" label={t('common:voice.answer')} disabled={disabled} />
        </View>
      ) : null}
      {/* One main action: "Prüfen" takes the room; "Lösung zeigen" stays a quiet side option. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
          <Btn variant="ghost" pill onPress={onReveal} disabled={disabled}>
            {revealLabel ?? t('show_solution')}
          </Btn>
        ) : null}
        <View style={{ flex: 1 }}>
          <Btn
            full
            pill
            variant={voiceMode ? 'soft' : 'primary'}
            onPress={() => onCheck(value.trim())}
            disabled={!canCheck}
          >
            {t('check')}
          </Btn>
        </View>
      </View>
    </BottomBar>
  );
}
