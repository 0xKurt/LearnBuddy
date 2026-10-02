// The field for typed answers (short, long, numeric, formula, vocab) with
// "Prüfen", "Tipp" and a quiet side option: "Lösung zeigen" only after a try or a hint,
// "Später" in homework help (there is no solution to show). A number's unit stands next to
// the field.
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
// control; "Prüfen" and the field stay for typing. After her first tap on the
// mic in voice mode the loop listens again by itself (useHandsFreeMic).
//
// Under the field a live preview shows typed math set properly ("3/4" as a
// fraction), once there is math worth drawing (components/math/TypedMathPreview).
//
// A calculation path (issue #221): where the math keys show, their first key is
// "↵ Neue Zeile". The return key sends a one-line answer as before; once the answer has a
// second line it starts the next one instead, and "Prüfen" sends every line as typed — the
// API checks them step by step (steps.ts, issue #209). lib/answerLines.ts holds the rules.

import type { ItemKind } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { lineCount, previewLine, returnSubmits } from '../../lib/answerLines.js';
import { hasMath } from '../../lib/math/parse.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { growsWithText } from '../../lib/growsWithText.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { TypedMathPreview } from '../math/TypedMathPreview.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { BottomBar } from './BottomBar.js';
import { tapped } from '../../lib/perf.js';

/** AnswerRequest.text allows at most 2000 characters. */
const MAX_ANSWER_LENGTH = 2000;
/** The web field's rows for a path: five lines of 22 fill the field's maxHeight of 150. */
const PATH_ROWS = 5;

/**
 * Enter in the browser: sends a one-line answer, and leaves Shift+Enter, an input method
 * still composing and every Enter in a path or a long answer to the field (a new line).
 */
function sendOnEnter(
  e: NativeSyntheticEvent<TextInputKeyPressEventData>,
  sends: boolean,
  send: () => void,
): void {
  // On the web the event is the browser's keyboard event, which carries these two as well.
  const key = e.nativeEvent as TextInputKeyPressEventData & {
    shiftKey?: boolean;
    isComposing?: boolean;
  };
  if (!sends || key.key !== 'Enter' || key.shiftKey === true || key.isComposing === true) return;
  e.preventDefault();
  send();
}

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
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  const voiceMode = useVoiceMode((s) => s.on);
  const long = kind === 'long';
  const exact = kind === 'numeric' || kind === 'formula';
  const inputRef = useRef<TextInput>(null);
  // Where the cursor is (reported by the field); set `forced` once after an insert to move it.
  const selection = useRef<Selection | null>(null);
  const [forced, setForced] = useState<Selection | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  // The cursor's place for the preview, which draws the line she is on (null: not reported yet).
  const [caret, setCaret] = useState<number | null>(null);
  // Keyboard accessory, not furniture (issue #16): the math row belongs above the keyboard
  // while she types. Without focus it only takes the room the question needs — on a small
  // phone with the keyboard open that is the difference between seeing the task and not.
  const mathAnswer = exact || (kind === 'short' && hasMath(prompt));
  const showKeys = mathAnswer && focused;
  // One line: the return key sends it. A path: the return key starts the next line.
  const sends = returnSubmits(kind, value);
  const path = !long && !sends;

  const insert = (insertion: Insertion) => {
    const next = insertAtCursor(value, selection.current, insertion);
    if (next.value.length > MAX_ANSWER_LENGTH) return;
    // A key is typing too: it ends the hands-free loop like the keyboard does.
    useHandsFree.getState().disarm();
    selection.current = next.selection;
    setCaret(next.selection.end);
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
      // In a written path what she says is the next line, and the path is checked with
      // "Prüfen" once it is complete — not after the first line she spoke (issue #221).
      const inPath = !long && !returnSubmits(kind, latest.current.value);
      const next = mergeTranscript(
        latest.current.value,
        said,
        long ? 'append' : inPath ? 'line' : 'replace',
        MAX_ANSWER_LENGTH,
      );
      onChange(next);
      if (useVoiceMode.getState().on && !latest.current.disabled && !inPath) onCheck(next.trim());
    },
    // Hands-free (voice mode): on the phone listening ends by itself when she pauses.
    untilPause: voiceMode,
  });
  useHandsFreeMic(voice, disabled, prompt);
  // iOS number pads lack minus, comma and letters (units); this one has them all.
  const keyboardType: KeyboardTypeOptions =
    kind === 'numeric' && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

  return (
    <BottomBar>
      <MicStatus voice={voice} />
      {showKeys ? <MathKeys onInsert={insert} disabled={disabled} newline /> : null}
      {/* One floating white pill, exactly like the composer on Buddy's home (issue #16): the
          field, the unit, and at its end the mic while it is empty – "Prüfen" once there is an
          answer. Nothing else is pinned down here. */}
      <View
        style={[
          {
            gap: 2,
            backgroundColor: palette.paper,
            borderRadius: long || path ? 26 : 30,
            paddingVertical: 6,
            paddingLeft: 16,
            paddingRight: 6,
            minHeight: 60,
            // The focus ring sits on the pill, not on the bare field inside (the web drew a black box).
            outlineStyle: 'solid',
            outlineWidth: focused ? 4 : 0,
            outlineColor: palette.ring,
          },
          SHADOW.float,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={(typed) => {
              // Typing ends the hands-free loop: she answers with the keyboard now.
              useHandsFree.getState().disarm();
              // …and a recording still running would replace what she types (audit M-78).
              if (voice.state === 'starting' || voice.state === 'recording') voice.cancel();
              onChange(typed);
            }}
            selection={forced}
            onSelectionChange={(e) => {
              selection.current = e.nativeEvent.selection;
              setCaret(e.nativeEvent.selection.end);
              if (forced) setForced(undefined);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t('answer.placeholder')}
            placeholderTextColor={palette.ink3}
            accessibilityLabel={t('answer.label')}
            accessibilityHint={unit ? t('answer.unit_hint', { unit }) : undefined}
            multiline
            // Where the growing starts: the web's textarea is two rows tall by default,
            // which makes an empty answer field look like a box to fill in. The growing
            // itself is `growsWithText` in the style below — without it a long answer
            // scrolled away inside one row in the browser (issue #188). A path asks for its
            // lines, so a browser without `field-sizing` shows them too (issue #221).
            {...(Platform.OS === 'web' && !long
              ? { numberOfLines: Math.min(lineCount(value), PATH_ROWS) }
              : {})}
            maxLength={MAX_ANSWER_LENGTH}
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize={exact ? 'none' : 'sentences'}
            keyboardType={keyboardType}
            // A one-line answer goes out with the return key; a long answer and a written
            // path need new lines (issue #221).
            submitBehavior={sends ? 'submit' : 'newline'}
            returnKeyType={sends ? 'send' : 'default'}
            onSubmitEditing={() => {
              if (sends && canCheck) onCheck(value.trim());
            }}
            // The browser does not know `submitBehavior` (react-native-web reads only the
            // deprecated `blurOnSubmit`), so a multiline field there turned every Enter into a
            // new line. Same rule as on the phone; Shift+Enter is the browser's own new line.
            onKeyPress={
              Platform.OS === 'web'
                ? (e) =>
                    sendOnEnter(e, sends, () => {
                      if (canCheck) onCheck(value.trim());
                    })
                : undefined
            }
            textAlignVertical={long || path ? 'top' : 'center'}
            style={[
              {
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
                color: palette.ink,
                outlineWidth: 0,
              },
              growsWithText,
            ]}
          />
          {unit ? (
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[
                TYPE.body,
                { color: palette.ink2, alignSelf: 'center', paddingHorizontal: 4 },
              ]}
            >
              {unit}
            </Text>
          ) : null}
          {/* Like the chat: the mic while the field is empty (or she is speaking), "Prüfen"
              once there is an answer to check. */}
          {canCheck ? (
            <Btn
              pill
              size="sm"
              variant={voiceMode ? 'soft' : 'primary'}
              onPress={() => {
                // Tap → the verdict on screen (issue #66).
                tapped('check');
                onCheck(value.trim());
              }}
              disabled={disabled}
            >
              {t('check')}
            </Btn>
          ) : voiceMode ? null : (
            <MicButton
              voice={voice}
              size="sm"
              filled
              label={t('common:voice.answer')}
              disabled={disabled}
            />
          )}
        </View>
        {/* How her math will be read, on a thin line in the pill itself – not a row of its
            own under it. Long answers are texts; the preview would only repeat them. */}
        {/* In a path it draws the line with the cursor; the others stand in the field. */}
        {long ? null : <TypedMathPreview value={previewLine(value, caret)} compact />}
      </View>
      {voiceMode ? (
        <View style={{ alignItems: 'center', paddingVertical: 2 }}>
          <MicButton voice={voice} size="lg" label={t('common:voice.answer')} disabled={disabled} />
        </View>
      ) : null}
    </BottomBar>
  );
}
