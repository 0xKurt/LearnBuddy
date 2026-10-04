// A typed answer (short, long, numeric, formula, vocab, "Erklär mal", a Diktat, a written path)
// in the app's one input bar (`InputBar`, issue #365): at the bottom, right above "Prüfen", like
// the chat — the question, Buddy's reply and the follow-up stand above it like a conversation.
// Before #365 the field stood under the question (#310 option B) and floated in the middle of the
// screen once Buddy had answered. This file holds only what a practice answer adds to the bar:
//
//   · the math keys (lib/math/keys.ts, issue #239), right under the bar (on top of the keyboard)
//     while she types — exactly
//     the keys this question needs, chosen by code from its kind, unit, subject and the notation
//     in its text. A raise/lower key (xⁿ, x₂, x⁺⁻) changes the digits she types next;
//   · a calculation written out line by line (issue #221): where the keys show, their first key is
//     "↵ Neue Zeile". The return key sends a one-line answer; from the second line on it adds one,
//     so a path cannot be cut off half-way (`lib/practice/pathEntry.ts`);
//   · what she says goes into the field (numbers and fractions as such: "drei Viertel" → "3/4"),
//     so she can check it. In voice mode the spoken answer is checked right away and the big mic
//     stands above the bar (`CheckBar`); after her first tap the loop listens again by itself
//     (useHandsFreeMic). A Diktat (issue #242) has no mic: the recogniser would spell for her;
//   · under the text a live preview of typed math ("3/4" as a fraction, TypedMathPreview);
//   · a surface that writes into the field — the fraction bar (issue #162) — stands in the answer
//     slot directly above the input bar, at the bottom like every board (#386).
// Autocorrect is off so the phone never "fixes" what the learner actually wrote.

import type { ItemKind, SubjectKind } from '@learnbuddy/shared-types/contracts';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View, type KeyboardTypeOptions } from 'react-native';

import { keysFor, typedUnder, type ScriptMode } from '../../lib/math/keys.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import {
  hasPath,
  lineCount,
  pathPossible,
  previewLine,
  returnKey,
} from '../../lib/practice/pathEntry.js';
import { tapped } from '../../lib/perf.js';
import { InputBar } from '../lb/InputBar.js';
import type { LbTextInputRef } from '../lb/LbTextInput.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { TypedMathPreview } from '../math/TypedMathPreview.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { AnswerShell } from './AnswerShell.js';

/** AnswerRequest.text allows at most 2000 characters. */
const MAX_ANSWER_LENGTH = 2000;
/** The web field's rows for a path: five lines fill the field's tallest. */
const PATH_ROWS = 5;

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

export function TypedAnswer({
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
  const { t } = useTranslation(['practice', 'common']);
  const voiceMode = useVoiceMode((s) => s.on);
  const long = kind === 'long';
  const exact = kind === 'numeric' || kind === 'formula';
  // A Diktat is spelling practice: no mic (it would write the word the way the recogniser spells
  // it), and the keyboard does not capitalise for her — the capital letter is what she practises.
  const micOff = kind === 'spelling_dictation';
  // A written path, and what the return key therefore does (issue #221).
  const path = hasPath(kind, value);
  const sends = returnKey(kind, value) === 'send';
  const inputRef = useRef<LbTextInputRef>(null);
  // Where the cursor is (reported by the field); set `forced` once after an insert to move it.
  const selection = useRef<Selection | null>(null);
  const [forced, setForced] = useState<Selection | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  // The cursor's place for the preview, which draws the line she is on (null: not reported yet).
  const [caret, setCaret] = useState<number | null>(null);
  // Keyboard accessory, not furniture (issue #16): the math row stands under the bar while she
  // types, and takes no room before.
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
  // In voice mode the big mic stands above the bar — not while she types: then the keyboard is
  // up, typing has ended the hands-free loop, and the room above the keyboard is the bar's and
  // the keys'. A recording still running keeps it, so she can always stop it.
  const bigMic =
    voiceMode && !micOff && (!focused || voice.state === 'recording' || voice.state === 'starting');

  const bar = (checkInBar: ReactNode) => (
    <InputBar
      ref={inputRef}
      // The walkthrough finds the field by this (tests/web/fit.ts).
      testID="answer-field"
      value={value}
      maxLength={MAX_ANSWER_LENGTH}
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
      accessibilityLabel={t('answer.label')}
      accessibilityHint={
        micOff ? t('answer.mic_off') : unit ? t('answer.unit_hint', { unit }) : undefined
      }
      // A path asks for its lines, so a browser without `field-sizing` shows them too (#221).
      {...(Platform.OS === 'web' && path
        ? { numberOfLines: Math.min(lineCount(value), PATH_ROWS) }
        : {})}
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize={exact || micOff ? 'none' : 'sentences'}
      keyboardType={keyboardType}
      // A one-liner goes out with the return key, so a simple answer stays fast; prose and a
      // calculation path take the line instead (issue #221, lib/practice/pathEntry.ts).
      submitBehavior={sends ? 'submit' : 'newline'}
      returnKeyType={sends ? 'send' : 'default'}
      onSubmitEditing={() => {
        if (sends && canCheck) check();
      }}
      // While she types, "Prüfen" stands in the bar like the chat's "Senden" (`CheckBar`).
      action={checkInBar}
      // The big mic has its own status line above the bar.
      voice={bigMic ? undefined : voice}
      micLabel={t('common:voice.answer')}
      mic={!voiceMode && !micOff}
      disabled={disabled}
      unit={unit}
      // How her math will be read, on a thin line in the bar itself. Long answers are texts;
      // the preview would only repeat them. In a path it draws the line with the cursor.
      under={long ? null : <TypedMathPreview value={previewLine(kind, value, caret)} compact />}
    />
  );

  return (
    <AnswerShell
      keeps="whole"
      answer={surface}
      action={{
        ready: value.trim().length > 0,
        disabled,
        onPress: check,
        waitsHint: t('answer.check_waits'),
        typing: focused,
        input: (checkInBar) => (
          <>
            {bar(checkInBar)}
            {/* Under the bar, on top of the keyboard — a keyboard accessory (issue #16): with the
                keyboard up on a small phone the bar she types in stays in view, keys below it. */}
            {showKeys ? (
              <View testID="answer-keys">
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
              </View>
            ) : null}
          </>
        ),
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
