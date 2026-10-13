// The practice adapter of the one Composer (`components/lb/Composer.tsx`, issue #599): it maps what
// a form hands the answer shell — a check, a typed answer's field, "Weiter", a flashcard's own
// action — onto the Composer's props, and adds her question to the tutor as the field of every
// form that is not typed (#402). It draws no bar of its own: one `BottomBar`, the Composer in it.
//
// Two things stand in that bar that the design's Composer does not draw: the conversation row
// while a question is answered hands-free (`VoiceRow`, #386, in the Composer's place — its look is
// the design's practice in conversation, ui_kits/app/Gaps.jsx:133–144) and a pass's own row of
// answers under the box (the flashcards' two equal decisions, #384), which stays as before the
// redesign (owner rule 2). Domain callbacks stay with the callers.

import { useCheckOverride } from './CheckOverride.js';

import { ASK_TEXT_MAX } from '@learnbuddy/shared-types/contracts';
import { createContext, useContext, useEffect, useRef, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mergeTranscript } from '../../lib/speech/spoken.js';
import { SPACE } from '../../lib/theme/space.js';
import { TALK } from '../../lib/theme/talk.js';
import { Btn } from '../lb/Btn.js';
import { BottomBar } from '../lb/BottomBar.js';
import { ActionPill, Composer, type ComposerAction, type ComposerProps } from '../lb/Composer.js';
import type { LbTextInputRef } from '../lb/LbTextInput.js';
import { MicStatus } from '../voice/MicButton.js';
import { useConversation } from '../voice/useConversation.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { VoiceRow } from '../voice/VoiceRow.js';

/** A typed answer's field: the Composer's, without what the shell adds (the chips, the action). */
type AnswerField = Omit<ComposerProps, 'action' | 'chips'> & {
  inputRef?: Ref<LbTextInputRef>;
};

/** "Prüfen": what a form hands to the bar — when its answer may go, how it goes, and why it waits. */
type Check = {
  /** Optional voice route alongside a durable selection and its Check action. */
  spoken?: Spoken;
  /** The answer can be said: conversation mode starts from the primary slot while nothing is ready. */
  canTalk?: boolean;
  /** Her answer is complete. */
  ready: boolean;
  /** The question is locked (sending, or answered). */
  disabled: boolean;
  onPress: () => void;
  /** Said while it waits: what is still missing. */
  waitsHint: string;
  /** A typed answer: the Composer's field is her answer (issue #365), not her question. */
  field?: AnswerField;
  /** The essay's writing view (`WritingSheet`, issue #525), handed its own "Prüfen". */
  sheet?: (check: ReactNode) => ReactNode;
  /** She is typing in that field: the board above it folds (`AnswerShell`). */
  typing?: boolean;
};

/** A spoken answer in a conversation (issue #386): what the conversation row's mic needs. */
type Spoken = {
  /** The question (sent as context, so a short spoken answer is heard right). */
  prompt: string;
  /** The language she answers in; null: the app's. */
  lang: string | null;
  /** The question is locked (sending, or answered). */
  disabled: boolean;
  /** What she said: checked right away. */
  onText: (said: string) => void;
  /** Hearing the question again ("Nochmal vorlesen"); none where it must not be heard. */
  onReadAgain?: () => void;
};

/** Gespräch: the conversation row in the Composer's place. */
type Talk = { talk: Spoken };

/** The question's own pinned footer (the pronunciation recorder). */
type OwnBar = { bar: ReactNode };

/** Closed question: the same primary slot advances to the next question. */
type Next = { next: { onPress: () => void; disabled?: boolean } };

/**
 * A pass's own action (the flashcards, #384): in the primary slot ("Umdrehen"), or as a row of
 * answers under the box (two equal decisions).
 */
type Own = { own: { primary: ReactNode | null; row: ReactNode | null } };

export type CheckAction = Check | OwnBar | Own | Talk | Next;

/** Her question to the tutor about the question on screen (issue #402): the bar's field. */
type Ask = {
  value: string;
  onChange: (text: string) => void;
  /** Sends what she typed (the screen: `POST …/ask`). */
  onSend: () => void;
  /** Sending, or the question is locked. */
  disabled: boolean;
};

/** Her question, and whether its field has the focus (the answer folds then, `answerFolds`). */
type AskState = Ask & { focused: boolean; onFocused: (focused: boolean) => void };

/**
 * Where the bar finds her question; the practice screen provides it, like `FreeSpaceReport` (the
 * focus with its room, `useScreenRoom`). Without it (a form rendered on its own, in a component
 * test) the field is there and inert.
 */
export const AskRoute = createContext<AskState>({
  value: '',
  onChange: () => undefined,
  onSend: () => undefined,
  disabled: true,
  focused: false,
  onFocused: () => undefined,
});

/**
 * "Prüfen" in the primary slot. While nothing is ready and the answer can be said, the slot is
 * the conversation's (the Composer's `onTalk`); otherwise the quiet pill waits in its place.
 */
function checkOf(check: Check, canTalk: boolean): ComposerAction | null {
  if (!check.ready && canTalk) return null;
  return {
    kind: 'check',
    ready: check.ready,
    disabled: check.disabled,
    onPress: check.onPress,
    waitsHint: check.waitsHint,
  };
}

export function CheckBar(provided: CheckAction & { keys?: ReactNode; chips?: ReactNode }) {
  const override = useCheckOverride();
  const action = override ?? provided;
  const { keys = null, chips = null } = provided;
  // A custom recorder owns its own footer; every other form shares this one bar.
  if ('bar' in action) return <>{action.bar}</>;
  const said =
    'spoken' in action && action.spoken
      ? { ...action.spoken, check: action }
      : 'talk' in action
        ? action.talk
        : null;
  return (
    <BottomBar>
      {said ? (
        // The conversation's row stands alone (Gaps.jsx:133–144): the chips ("Tipp") belong to
        // the Composer and are back with "Tastatur".
        <TalkRow {...said} />
      ) : 'field' in action && action.field ? (
        <TypedComposer check={action} field={action.field} keys={keys} chips={chips} />
      ) : (
        <AskComposer action={action as Asked} keys={keys} chips={chips} />
      )}
    </BottomBar>
  );
}

/** A typed answer: the Composer's field is her answer, "Prüfen" its action. */
function TypedComposer({
  check,
  field: { inputRef, ...field },
  keys,
  chips,
}: {
  check: Check;
  field: AnswerField;
  keys: ReactNode;
  chips: ReactNode;
}) {
  return (
    <>
      <Composer
        {...field}
        ref={inputRef}
        chips={chips}
        keys={field.keys ?? keys}
        action={checkOf(check, Boolean(field.onTalk))}
      />
      {check.sheet?.(<SheetCheck {...check} />)}
    </>
  );
}

/** What a form without a typed answer hands the bar. */
type Asked = Exclude<CheckAction, OwnBar | Talk>;

/**
 * Every other form: the Composer's field is her question to the tutor ("Frag zur Aufgabe …",
 * issue #402). Its action is the form's — "Prüfen", "Weiter", a pass's own — and, once she has
 * typed a question, the chat's send arrow in the same slot.
 */
function AskComposer({
  action,
  keys,
  chips,
}: {
  action: Asked;
  keys: ReactNode;
  chips: ReactNode;
}) {
  const ask = useContext(AskRoute);
  const conversation = useConversation();
  const { t } = useTranslation(['practice', 'common']);
  const latest = useRef(ask);
  latest.current = ask;
  const voice = useVoiceInput({
    purpose: 'message',
    lang: null,
    onText: (said) => {
      const current = latest.current;
      if (!current.disabled)
        current.onChange(mergeTranscript(current.value, said, 'append', ASK_TEXT_MAX));
    },
  });
  const cancel = useRef(voice.cancel);
  cancel.current = voice.cancel;
  useEffect(() => {
    if (ask.disabled) cancel.current();
  }, [ask.disabled]);
  useEffect(() => () => cancel.current(), []);
  const asking = ask.value.trim().length > 0;
  const send = () => {
    if (asking && !ask.disabled) ask.onSend();
  };
  const canTalk = 'canTalk' in action && action.canTalk === true;
  const own: ComposerAction | null =
    'next' in action
      ? { kind: 'next', ...action.next }
      : 'own' in action
        ? action.own.primary === null
          ? null
          : { kind: 'own', node: action.own.primary }
        : checkOf(action, canTalk);
  return (
    <>
      <Composer
        // The walkthrough finds the question's field by this (tests/web/fit.ts).
        testID="ask-field"
        value={ask.value}
        maxLength={ASK_TEXT_MAX}
        onChangeText={ask.onChange}
        placeholder={t('practice:ask.placeholder')}
        accessibilityLabel={t('practice:ask.label')}
        submitBehavior="submit"
        returnKeyType="send"
        onSubmitEditing={send}
        onFocus={() => ask.onFocused(true)}
        onBlur={() => ask.onFocused(false)}
        disabled={ask.disabled}
        voice={voice}
        micLabel={t('common:voice.message')}
        chips={chips}
        keys={keys}
        action={asking ? { kind: 'send', onPress: send, disabled: ask.disabled } : own}
        onTalk={canTalk && !asking ? conversation.start : null}
      />
      {'own' in action ? action.own.row : null}
    </>
  );
}

/**
 * Gespräch (issue #386): the conversation screen's row in the bar — "Tastatur" (back to the
 * Composer) · the mic pill · "Nochmal vorlesen" (design ui_kits/app/Gaps.jsx:133–144, #599). As
 * on /talk the mic listens by itself once the question has been read (the hands-free loop,
 * `useHandsFreeMic`; the screen arms it); listening ends by itself when she pauses (on the phone).
 *
 * No status line above the row (#386, again after the #599 correction): it made the bar jump by
 * a line and hid Buddy's reply at 360×740. The pill's word carries the state — "Sprechen", and
 * "Fertig" only while the recorder really runs (CLAUDE.md rule 5) — together with the header's
 * orb. A Check appears only when there is something to check: beside the running microphone, or
 * in the middle once she has chosen and it rests.
 */
function TalkRow({
  prompt,
  lang,
  disabled,
  onText,
  onReadAgain,
  check,
}: Spoken & { check?: Check }) {
  const { t } = useTranslation(['common', 'buddy', 'practice']);
  const conversation = useConversation();
  const submitted = useRef(false);
  const locked = useRef(disabled);
  if (locked.current && !disabled) submitted.current = false;
  locked.current = disabled;
  useEffect(() => {
    submitted.current = false;
  }, [prompt]);
  const voice = useVoiceInput({
    purpose: 'answer',
    lang,
    context: prompt,
    onText: (said) => {
      if (submitted.current || locked.current) return;
      submitted.current = true;
      onText(said);
    },
    untilPause: true,
  });
  useHandsFreeMic(voice, disabled, prompt);
  const recording = voice.state === 'recording';
  const selectedCheck = check ? (
    <View testID="answer-action">
      <ActionPill
        label={t('practice:check')}
        icon="check"
        off={disabled || !check.ready}
        quiet={voice.state !== 'idle'}
        {...(check.ready ? {} : { hint: check.waitsHint })}
        onPress={() => {
          if (submitted.current || disabled || !check.ready) return;
          submitted.current = true;
          voice.cancel();
          check.onPress();
        }}
      />
    </View>
  ) : null;
  return (
    <>
      {/* Only what went wrong (no mic, nothing understood), while the mic rests. */}
      {voice.state === 'idle' ? <MicStatus voice={voice} /> : null}
      <View style={{ paddingHorizontal: TALK.rowInset - SPACE.lg }}>
        <VoiceRow
          left={{
            icon: 'keyboard',
            label: t('buddy:composer.keyboard'),
            onPress: () => {
              submitted.current = true;
              voice.cancel();
              conversation.stop();
            },
          }}
          // The row shares the screen with the question and its conversation (#386): `md` is the
          // size of the round mic that stands beside a Check; the pill is the conversation's.
          size="md"
          presentation="talk"
          mic={{
            voice,
            label: t('common:voice.answer'),
            visibleLabel: t(recording ? 'buddy:talk.finish' : 'buddy:talk.speak'),
            disabled,
            filled: voice.state !== 'idle' || !check?.ready,
          }}
          right={
            onReadAgain
              ? { icon: 'speak', label: t('common:voice.read_again'), onPress: onReadAgain }
              : null
          }
          centerAction={check?.ready && voice.state === 'idle' ? selectedCheck : null}
          // Never a greyed Check that cannot be pressed (Gaps.jsx:136–143 has three controls).
          action={check?.ready && voice.state !== 'idle' ? selectedCheck : null}
        />
      </View>
    </>
  );
}

/** The essay's writing view has its own pinned footer: the same check, over its width. */
function SheetCheck({ ready, disabled, onPress, waitsHint }: Check) {
  const { t } = useTranslation('practice');
  return (
    <View testID="answer-action">
      <Btn
        variant={ready ? 'primary' : 'quiet'}
        size="md"
        pill
        full
        disabled={disabled || !ready}
        onPress={onPress}
        accessibilityHint={ready ? undefined : waitsHint}
      >
        {t('check')}
      </Btn>
    </View>
  );
}
