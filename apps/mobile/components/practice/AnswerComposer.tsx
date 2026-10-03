// The field for typed answers (short, long, numeric, formula, vocab, a written path), in the
// answer shell like every other form (issue #310, owner's decision B; #309): the field stands
// right under the question and its Tipp row, the math keys directly under it while she types,
// the free room below, and "Prüfen" in the same bar at the bottom as for a table, an order or a
// match. Before this the field sat in a floating pill at the bottom edge with its own small
// "Prüfen" inside, and the hole between question and field was the free room (#309). A number's
// unit stands next to the field. The fraction bar she shades writes into this very field
// (`surface`, issue #162): it stands right above it, in the same slot.
// Autocorrect is off so the phone never "fixes" what the learner actually
// wrote. For math and chemistry questions a row of keys sits under the field and inserts at
// the cursor — exactly the keys this question needs, chosen by code from its kind, unit,
// subject and the notation in its text (lib/math/keys.ts, issue #239). A raise/lower key
// (xⁿ, x₂, x⁺⁻) changes the digits she types next on the phone's own keyboard.
//
// The field looks like every other place she types into on this screen — a table's cell, a
// cloze's gap: paper, a hairline that turns violet while she types (`RADIUS`, issue #310).
//
// The mic in the field writes what she said into it (numbers and
// fractions as such: "drei Viertel" → "3/4"), so she can check it. In voice
// mode the spoken answer is checked right away and the big mic is the main
// control, in the bar above "Prüfen" (`CheckBar`); "Prüfen" and the field stay for typing. After
// her first tap on the mic in voice mode the loop listens again by itself (useHandsFreeMic).
//
// Under the field's text a live preview shows typed math set properly ("3/4" as a
// fraction), once there is math worth drawing (components/math/TypedMathPreview).
//
// A calculation may be written out line by line (issue #221): where the math
// keys show, their first key is "↵ Neue Zeile". The return key sends a one-line
// answer as before; from the second line on it adds one instead of sending, so a
// path cannot be cut off half-way, and "Prüfen" sends every line as typed. What
// is allowed where, and what the return key does, is `lib/practice/pathEntry.ts`;
// the server checks each step and names the first line that broke (issue #209).

import type { ItemKind, SubjectKind } from '@learnbuddy/shared-types/contracts';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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

import { keysFor, typedUnder, type ScriptMode } from '../../lib/math/keys.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { growsWithText } from '../../lib/growsWithText.js';
import {
  hasPath,
  lineCount,
  pathPossible,
  previewLine,
  returnKey,
} from '../../lib/practice/pathEntry.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { TypedMathPreview } from '../math/TypedMathPreview.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { AnswerShell } from './AnswerShell.js';
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
  /** The kind of the question's subject: a formula in chemistry gets the chemistry keys (issue #239). */
  subjectKind?: SubjectKind | null;
  /** The language the answer is spoken in (vocab: the item's answer language); null = the app language. */
  lang: string | null;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  /** Checks this answer (the field's text, or what she just said in voice mode). */
  onCheck: (value: string) => void;
  /** What she works with that writes into the field: the fraction bar (issue #162). */
  surface?: ReactNode;
};

export function AnswerComposer({
  kind,
  prompt = '',
  unit,
  subjectKind = null,
  lang,
  value,
  disabled,
  onChange,
  onCheck,
  surface = null,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  const voiceMode = useVoiceMode((s) => s.on);
  const long = kind === 'long';
  const exact = kind === 'numeric' || kind === 'formula';
  // A Diktat (issue #242) is spelling practice: voice input would write the word the way the
  // recogniser spells it, so the mic is off here — not hidden without a word, but replaced by one
  // short line that says why. The keyboard does not capitalise for her either: the capital letter
  // is part of what she practises.
  const micOff = kind === 'spelling_dictation';
  // A written path, and what the return key therefore does (issue #221).
  const path = hasPath(kind, value);
  const sends = returnKey(kind, value) === 'send';
  // Several lines want their text at the top and the field already grown, like a long answer.
  const lines = long || path;
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
  const keys = keysFor({ kind, unit, subjectKind, prompt, path: pathPossible(kind) });
  const showKeys = keys.length > 0 && focused;
  // A raise/lower key that is on: the next digits she types become x⁴, H₂, SO₄²⁻.
  const [mode, setMode] = useState<ScriptMode | null>(null);
  // The next question starts with plain digits.
  useEffect(() => setMode(null), [prompt]);

  const insert = (insertion: Insertion) => {
    // Another key ends a raise/lower mode: "x⁴ = " must not raise what comes after the "=".
    setMode(null);
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
      const inPath = hasPath(kind, latest.current.value);
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
  useHandsFreeMic(voice, disabled || micOff, prompt);
  // iOS number pads lack minus, comma and letters (units); this one has them all.
  const keyboardType: KeyboardTypeOptions =
    kind === 'numeric' && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

  const check = () => {
    // Tap → the verdict on screen (issue #66).
    tapped('check');
    onCheck(value.trim());
  };
  // The field: one row with the mic at its end (not in voice mode, where the big mic in the bar
  // is the one; not in a Diktat, issue #242), the unit beside the text, the preview under it.
  const field = (
    <View
      style={{
        backgroundColor: palette.paper,
        borderRadius: RADIUS.tile,
        // The ring is the field's border, as at a table's cell (TableAnswer): violet while she
        // types, never the browser's black box around the bare text inside.
        borderWidth: focused ? 2 : 1.5,
        borderColor: focused ? palette.primary : palette.field,
        paddingLeft: SPACE.md,
        paddingRight: SPACE.xs,
        paddingVertical: SPACE.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.xs }}>
        <TextInput
          ref={inputRef}
          // The keyboard pass of the walkthrough finds the field by this (tests/web/fit.ts).
          testID="answer-field"
          value={value}
          onChangeText={(typed) => {
            // Typing ends the hands-free loop: she answers with the keyboard now.
            useHandsFree.getState().disarm();
            // …and a recording still running would replace what she types (audit M-78).
            if (voice.state === 'starting' || voice.state === 'recording') voice.cancel();
            // Under a raise/lower key the digit she just typed becomes ² or ₂ — only that one
            // character, and anything the mode does not take ends it (lib/math/keys.ts).
            const under = typedUnder(value, typed, mode);
            if (under.mode !== mode) setMode(under.mode);
            if (under.at !== null && under.value !== typed) {
              const at = { start: under.at, end: under.at };
              selection.current = at;
              setForced(at);
            }
            onChange(under.value);
          }}
          selection={forced}
          onSelectionChange={(e) => {
            selection.current = e.nativeEvent.selection;
            setCaret(e.nativeEvent.selection.end);
            if (forced) setForced(undefined);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            // The row goes with the focus, and a mode nobody can see must not stay on.
            setMode(null);
          }}
          // A Diktat says in the field itself that the mic is off (issue #242): one line where
          // she looks anyway, gone as soon as she types — not a second line of grey text.
          placeholder={t(micOff ? 'answer.placeholder_dictation' : 'answer.placeholder')}
          placeholderTextColor={palette.ink3}
          accessibilityLabel={t('answer.label')}
          accessibilityHint={
            micOff ? t('answer.mic_off') : unit ? t('answer.unit_hint', { unit }) : undefined
          }
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
          autoCapitalize={exact || micOff ? 'none' : 'sentences'}
          keyboardType={keyboardType}
          // A one-liner goes out with the return key, so a simple answer stays fast; prose and
          // a calculation path take the line instead (issue #221, lib/practice/pathEntry.ts).
          submitBehavior={sends ? 'submit' : 'newline'}
          returnKeyType={sends ? 'send' : 'default'}
          onSubmitEditing={() => {
            if (sends && canCheck) check();
          }}
          // The browser does not know `submitBehavior` (react-native-web reads only the
          // deprecated `blurOnSubmit`), so a multiline field there turned every Enter into a
          // new line. Same rule as on the phone; Shift+Enter is the browser's own new line.
          onKeyPress={
            Platform.OS === 'web'
              ? (e) =>
                  sendOnEnter(e, sends, () => {
                    if (canCheck) check();
                  })
              : undefined
          }
          textAlignVertical={lines ? 'top' : 'center'}
          style={[
            {
              flex: 1,
              minWidth: 0,
              minHeight: long ? 88 : TOUCH,
              // A path grows with its lines (growsWithText below) and may then scroll inside
              // the field; the cap keeps the field from pushing the question off a 360×740
              // screen, which rule 16 does not allow.
              maxHeight: 150,
              alignSelf: 'center',
              backgroundColor: 'transparent',
              paddingHorizontal: 0,
              // Centred in the field's row: (TOUCH − lineHeight) / 2 above and below.
              paddingTop: 11, // token-exempt: centres one 22 pt line in a TOUCH row
              paddingBottom: 11, // token-exempt: as above
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
              { color: palette.ink2, alignSelf: 'center', paddingHorizontal: SPACE.xs },
            ]}
          >
            {unit}
          </Text>
        ) : null}
        {voiceMode || micOff ? (
          // Nothing at the end: the text keeps the field's room up to its border.
          <View style={{ width: SPACE.sm }} />
        ) : (
          <MicButton
            voice={voice}
            size="sm"
            // The way in while the field is empty; once there is an answer "Prüfen" is the one
            // filled control, and the mic steps back (it still adds what she says).
            filled={value.trim().length === 0}
            label={t('common:voice.answer')}
            disabled={disabled}
          />
        )}
      </View>
      {/* How her math will be read, on a thin line in the field itself – not a row of its
            own under it. Long answers are texts; the preview would only repeat them. */}
      {/* In a path it draws the line with the cursor; the others stand in the field. */}
      {long ? null : <TypedMathPreview value={previewLine(kind, value, caret)} compact />}
    </View>
  );
  // In voice mode the big mic stands in the bar above "Prüfen" — not while she types: then the
  // keyboard is up, typing has ended the hands-free loop, and the room above the keyboard is the
  // field's and the keys' (a small phone has about 440 pt left). A recording still running keeps
  // it, so she can always stop it.
  const bigMic =
    voiceMode && !micOff && (!focused || voice.state === 'recording' || voice.state === 'starting');

  return (
    <AnswerShell
      keeps="whole"
      answer={
        <View style={{ gap: SPACE.md }}>
          {surface}
          {field}
          {bigMic ? null : <MicStatus voice={voice} />}
        </View>
      }
      // Keyboard accessory, not furniture (issue #16): the row is there while she types.
      keys={
        showKeys ? (
          <MathKeys
            keys={keys}
            onInsert={insert}
            mode={mode}
            onMode={(next) => {
              setMode(next);
              inputRef.current?.focus();
            }}
            disabled={disabled}
            chemistry={keys.includes('reacts')}
          />
        ) : null
      }
      action={{
        ready: value.trim().length > 0,
        disabled,
        onPress: check,
        waitsHint: t('answer.check_waits'),
        voice: bigMic ? (
          <>
            <MicStatus voice={voice} />
            <MicButton
              voice={voice}
              size="lg"
              label={t('common:voice.answer')}
              disabled={disabled}
            />
          </>
        ) : undefined,
      }}
    />
  );
}
