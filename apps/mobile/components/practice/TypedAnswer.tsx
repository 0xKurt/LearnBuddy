// A typed answer (short, long, numeric, formula, vocab, "Erklär mal", a Diktat, a written path)
// in the app's one Composer (`components/lb/Composer.tsx`, issues #365, #599): at the bottom, like
// the chat — the question, Buddy's reply and the follow-up stand above it like a conversation.
// Before #365 the field stood under the question (#310 option B) and floated in the middle of the
// screen once Buddy had answered. This file holds only what a practice answer adds to the box:
//
//   · the keys (lib/math/keys.ts, issue #239), flat tiles inside the box between her lines and
//     its tools — exactly the keys this question needs, chosen by code from its kind, unit,
//     subject and the notation in its text — and the mode chip that names them ("Formel",
//     "Rechnen", "Chemie") and shows or hides them. A raise/lower key (xⁿ, x₂, x⁺⁻) changes the
//     digits she types next;
//   · a calculation written out line by line (issue #221): where the keys show, their first key is
//     "↵ Neue Zeile". The return key sends a one-line answer; from the second line on it adds one,
//     so a path cannot be cut off half-way (`lib/practice/pathEntry.ts`);
//   · what she says goes into the field (numbers and fractions as such: "drei Viertel" → "3/4"),
//     so she can check it. A Diktat (issue #242) has no mic: the recogniser would spell for her;
//   · Gespräch (issue #386): the blue waveform in the primary slot while there is nothing to
//     check, as in the chat. Tapped, the bar becomes the conversation row (`CheckBar`, `Talk`):
//     what she says is checked right away, and the mic listens by itself once Buddy has read, as
//     on /talk. Not where a spoken answer cannot stand alone: a Diktat, a path she is writing
//     line by line, a line that belongs to a board;
//   · among the box's tools a live preview of typed math ("3/4" as a fraction, TypedMathPreview),
//     only while the line looks different when set, and the unit as a chip ("in cm²"), never a
//     suffix inside her lines (#522);
//   · a long text (issue #258) gets the tall box and up to 12 000 characters
//     (`lib/practice/essay.ts`); it is prose, so it is dictated in parts like a long answer. At the
//     start of the box's tools it opens the writing view (`WritingSheet`, issue #525): the same
//     text over nearly the whole screen, "Prüfen" under it;
//   · her working, photographed (issue #444): where a path is checked, a camera at the tools'
//     start (where the chat has its +). The copy goes into this field for her to compare with her
//     book; a line that could not be read stays empty and "Prüfen" waits for it (`useWorkPhoto`,
//     `lib/practice/workPhoto.ts`).
// The fraction bar wrote into this field until #402; it is a board of its own now (report #388
// §9), whose bar holds her question.
// Code (Informatik, issue #262) — a program, an SQL query or a program's output — is typed into the
// same box in monospace: no keys, no mic (a recogniser cannot dictate indentation), the return
// key always takes the line, and a function starts with its first line (`starter`). A program or a
// query gets the tall box like a long text.
// A board may stand above the bar when the typed line belongs to it (issue #260, Fehlerdetektiv:
// she taps the wrong line of a worked solution, then writes it right here) — the board in the
// shell's answer slot, the line in this box, one "Prüfen" for both.
// Autocorrect is off so the phone never "fixes" what the learner actually wrote.

import {
  pathPossible,
  type CodeTypeSurface,
  type ItemKind,
  type SubjectKind,
} from '@learnbuddy/shared-types/contracts';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View, type KeyboardTypeOptions } from 'react-native';

import { keysFor, modeFor, typedUnder, type ScriptMode } from '../../lib/math/keys.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { hasPath, lineCount, previewLine, returnKey } from '../../lib/practice/pathEntry.js';
import { formDensity } from '../../lib/keyboard.js';
import { answerMax } from '../../lib/practice/essay.js';
import { copyNote, unreadText } from '../../lib/practice/workPhoto.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { tapped } from '../../lib/perf.js';
import type { LbTextInputRef } from '../lb/LbTextInput.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { TypedMathPreview } from '../math/TypedMathPreview.js';
import { useConversation } from '../voice/useConversation.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { AttachMenu, type OwnAttach } from '../capture/AttachMenu.js';
import { AnswerShell } from './AnswerShell.js';
import { useWorkPhoto, type WorkTarget } from './useWorkPhoto.js';
import { WorkPhotoNote } from './WorkPhotoNote.js';
import { WritingSheet } from './WritingSheet.js';

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
  /** Checks this answer (the field's text, or what she just said in a conversation). */
  onCheck: (value: string) => void;
  /** "Nochmal vorlesen" in the conversation row; none where the question must not be heard. */
  onReadAgain?: () => void;
  /**
   * A board above the bar this line belongs to (#260): what she taps first, what of it stays while
   * she types and it folds (`AnswerShell` `whileTyping`), and — until she has tapped — why
   * "Prüfen" waits and what the empty field says.
   */
  board?: {
    node: ReactNode;
    whileTyping?: ReactNode;
    waits: string | null;
    placeholder: string;
  } | null;
  /** The question a photo of her working is read for (issue #444); none: no camera here. */
  work?: WorkTarget | null;
  /** She writes code (issue #262): monospace, no keys, no mic, the field starting with `starter`. */
  code?: CodeTypeSurface | null;
};

/** No question to read a photo for: the hook still runs, its controls are not shown. */
const NO_WORK: WorkTarget = { sessionId: '', itemId: '' };

/** What the + offers in a practice (#596): her working, from the camera or a photo she took. */
const WORK_ATTACH: OwnAttach = {
  title: 'practice:work.attach_title',
  line: 'practice:work.attach_line',
  sources: ['camera', 'library'],
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
  onReadAgain,
  board = null,
  work = null,
  code = null,
}: Props) {
  const { t } = useTranslation(['practice', 'common']);
  const { t: tm } = useTranslation('math');
  const conversation = useConversation();
  const inConversation = useVoiceMode((s) => s.conversation);
  // Prose: dictated in parts, no math preview, the return key takes the line (issue #258).
  const long = kind === 'long' || kind === 'essay';
  const max = answerMax(kind);
  const exact = kind === 'numeric' || kind === 'formula' || kind === 'find_error';
  // A Diktat is spelling practice: no mic (it would write the word the way the recogniser spells
  // it), and the keyboard does not capitalise for her — the capital letter is what she practises.
  const micOff = kind === 'spelling_dictation' || code !== null;
  // A written path, and what the return key therefore does (issue #221).
  const path = hasPath(kind, value);
  const sends = code === null && returnKey(kind, value) === 'send';
  // A program or a query is a small page of code, like a long text (#262); an output is lines.
  const page = kind === 'essay' || (code !== null && code.purpose !== 'output');
  const inputRef = useRef<LbTextInputRef>(null);
  // Where the cursor is (reported by the field); set `forced` once after an insert to move it.
  const selection = useRef<Selection | null>(null);
  const [forced, setForced] = useState<Selection | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  /** The writing view of a long text is open (issue #525); it closes once her text is checked. */
  const [writing, setWriting] = useState(false);
  /** The + is open: camera or a photo she already took, for her working (#596). */
  const [attaching, setAttaching] = useState(false);
  useEffect(() => {
    if (disabled) setWriting(false);
  }, [disabled]);
  const seen = useVisibleHeight();
  const dense = formDensity(seen.window, seen.overlap) === 'tight';
  // The cursor's place for the preview, which draws the line she is on (null: not reported yet).
  const [caret, setCaret] = useState<number | null>(null);
  // The keys this question is typed with, and the chip that names and hides them (#599).
  const asked = { kind, unit, subjectKind, prompt, path: pathPossible(kind) };
  const keys = code ? [] : keysFor(asked);
  const keyMode = code ? null : modeFor(asked);
  const [keysOn, setKeysOn] = useState(true);
  // A raise/lower key that is on: the next digits she types become x⁴, H₂, SO₄²⁻.
  const [mode, setMode] = useState<ScriptMode | null>(null);
  // The next question starts with plain digits.
  useEffect(() => setMode(null), [prompt]);

  const insert = (insertion: Insertion) => {
    // Another key ends a raise/lower mode: "x⁴ = " must not raise what comes after the "=".
    setMode(null);
    const next = insertAtCursor(value, selection.current, insertion);
    if (next.value.length > max) return;
    // A key is typing too: it ends the hands-free loop like the keyboard does.
    useHandsFree.getState().disarm();
    selection.current = next.selection;
    setCaret(next.selection.end);
    onChange(next.value);
    setForced(next.selection);
    inputRef.current?.focus();
  };
  // Her working, photographed (issue #444): only where a path is checked and the line is hers alone.
  const photo = useWorkPhoto(work ?? NO_WORK, onChange);
  const photoHere = work !== null && pathPossible(kind) && board === null;
  const copy = photoHere ? copyNote(photo.state, value) : null;
  /** A line of the copy she still has to write: "Prüfen" waits, and says which. */
  const unread = copy?.key === 'work.unread' ? unreadText(t, copy.lines) : null;
  const canCheck = !disabled && value.trim().length > 0 && unread === null;
  const latest = useRef({ value, disabled });
  latest.current = { value, disabled };

  /** What she said, into the field: a long answer may be dictated in parts, a short one is
   *  replaced by it, and in a written path it is the next line (issue #221). */
  const heard = (said: string): string => {
    const next = mergeTranscript(
      latest.current.value,
      said,
      long ? 'append' : hasPath(kind, latest.current.value) ? 'line' : 'replace',
      max,
    );
    onChange(next);
    return next;
  };
  const voice = useVoiceInput({ purpose: 'answer', lang, context: prompt, onText: heard });
  // Gespräch: only where what she says is the whole answer (see the top of the file).
  const canTalk = !micOff && !path && board === null;
  // iOS number pads lack minus, comma and letters (units); this one has them all.
  const keyboardType: KeyboardTypeOptions =
    kind === 'numeric' && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

  const check = () => {
    // Tap → the verdict on screen (issue #66).
    tapped('check');
    onCheck(value.trim());
    // The copy of her photo is her answer now.
    photo.done();
  };

  if (canTalk && inConversation)
    return (
      <AnswerShell
        action={{
          talk: {
            prompt,
            lang,
            disabled,
            onText: (said) => {
              const next = heard(said);
              if (!latest.current.disabled) onCheck(next.trim());
            },
            ...(onReadAgain ? { onReadAgain } : {}),
          },
        }}
      />
    );

  return (
    <AnswerShell
      answer={board?.node ?? null}
      whileTyping={board?.whileTyping ?? null}
      action={{
        ready: value.trim().length > 0 && !board?.waits && unread === null,
        disabled,
        onPress: check,
        waitsHint: board?.waits ?? unread ?? t('answer.check_waits'),
        typing: focused && (!page || dense),
        field: {
          inputRef,
          // The walkthrough finds the field by this (tests/web/fit.ts).
          testID: 'answer-field',
          value,
          maxLength: max,
          tall: page ? (focused ? 'writing' : 'resting') : null,
          mono: code !== null,
          onChangeText: (typed) => {
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
          },
          selection: forced,
          onSelectionChange: (e) => {
            selection.current = e.nativeEvent.selection;
            setCaret(e.nativeEvent.selection.end);
            if (forced) setForced(undefined);
          },
          onFocus: () => {
            setFocused(true);
            // A function starts with its first line and the indentation under it (#262).
            if (code?.starter && value === '') onChange(code.starter);
          },
          onBlur: () => {
            setFocused(false);
            // A mode nobody is typing under must not stay on.
            setMode(null);
          },
          // A Diktat says in the field itself that the mic is off (issue #242): one line where
          // she looks anyway, gone as soon as she types — not a second line of grey text. Beside
          // a unit chip the field is narrow: "Antwort … in cm²" reads as one line, where "Deine
          // Antwort …" broke onto a second one (#387).
          placeholder:
            board?.placeholder ??
            (code
              ? t(`code.placeholder_${code.purpose}`)
              : t(
                  micOff
                    ? 'answer.placeholder_dictation'
                    : unit
                      ? 'answer.placeholder_unit'
                      : 'answer.placeholder',
                )),
          accessibilityLabel: t('answer.label'),
          accessibilityHint: micOff
            ? t('answer.mic_off')
            : unit
              ? t('answer.unit_hint', { unit })
              : undefined,
          // A path asks for its lines, so a browser without `field-sizing` shows them too (#221).
          ...(Platform.OS === 'web' && path
            ? { numberOfLines: Math.min(lineCount(value), PATH_ROWS) }
            : {}),
          autoCorrect: false,
          spellCheck: false,
          autoComplete: 'off',
          autoCapitalize: exact || micOff ? 'none' : 'sentences',
          keyboardType,
          // A one-liner goes out with the return key, so a simple answer stays fast; prose and a
          // calculation path take the line instead (issue #221, lib/practice/pathEntry.ts).
          submitBehavior: sends ? 'submit' : 'newline',
          returnKeyType: sends ? 'send' : 'default',
          onSubmitEditing: () => {
            if (sends && canCheck) check();
          },
          voice,
          micLabel: t('common:voice.answer'),
          mic: !micOff,
          disabled,
          unit,
          // How her math will be read, among the box's tools (it costs no line of its own). Long
          // answers are texts; the preview would only repeat them. In a path it draws the line
          // with the cursor.
          preview:
            long || code ? null : <TypedMathPreview value={previewLine(kind, value, caret)} />,
          // The keys she types it with, between her lines and the tools, and the chip that names
          // them and puts them away (design components/composer/Composer.jsx:44–59).
          ...(keyMode
            ? {
                mode: {
                  label: tm(`keys.chip_${keyMode}`),
                  on: keysOn,
                  onPress: () => setKeysOn((on) => !on),
                },
                keys: (
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
                      chemistry={keyMode === 'chem'}
                    />
                  </View>
                ),
              }
            : {}),
          // Gespräch, in the primary slot like the chat's (issue #386).
          onTalk: canTalk ? conversation.start : null,
          // Her working, photographed (issue #444), behind the design's + (#596), where the chat
          // has its own: the same sheet asks camera or a photo she already took. A long text: its
          // writing view in the same place (issue #525), not drawn by the design.
          tool: photoHere
            ? {
                icon: 'plus',
                label: t('work.take'),
                ...(disabled ? {} : { onPress: () => setAttaching(true) }),
              }
            : long
              ? {
                  icon: 'expand',
                  label: t('essay.write_open'),
                  ...(disabled ? {} : { onPress: () => setWriting(true) }),
                }
              : null,
          attached: photoHere ? (
            <>
              <WorkPhotoNote photo={photo} value={value} />
              <AttachMenu
                visible={attaching}
                link={WORK_ATTACH}
                onChoose={(source) => {
                  setAttaching(false);
                  if (source === 'camera') photo.take();
                  else photo.pick();
                }}
                onClose={() => setAttaching(false)}
              />
            </>
          ) : null,
        },
        ...(long
          ? {
              sheet: (sheetCheck: ReactNode) => (
                <WritingSheet
                  visible={writing}
                  task={prompt}
                  value={value}
                  maxLength={max}
                  onChange={onChange}
                  check={sheetCheck}
                  onClose={() => setWriting(false)}
                />
              ),
            }
          : {}),
      }}
    />
  );
}
