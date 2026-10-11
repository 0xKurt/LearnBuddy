// Presentation adapter for the one Composer: typed/board checks, tutor questions, Next,
// flashcard decisions and the existing hands-free voice row. Domain callbacks stay with callers.

import { useCheckOverride } from './CheckOverride.js';

import { ASK_TEXT_MAX } from '@learnbuddy/shared-types/contracts';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mergeTranscript } from '../../lib/speech/spoken.js';
import { COMPOSER } from '../../lib/theme/composer.js';
import { Btn } from '../lb/Btn.js';
import { BottomBar } from '../lb/BottomBar.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { InputBar } from '../lb/InputBar.js';
import { MicStatus } from '../voice/MicButton.js';
import { TalkButton } from '../voice/TalkButton.js';
import { useConversation } from '../voice/useConversation.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { VoiceRow } from '../voice/VoiceRow.js';

/** "Prüfen": what a form hands to the bar — when its answer may go, how it goes, and why it waits. */
type Check = {
  /** Optional voice route alongside a durable selection and its Check action. */
  spoken?: Spoken;
  canTalk?: boolean;
  /** Her answer is complete. */
  ready: boolean;
  /** The question is locked (sending, or answered). */
  disabled: boolean;
  onPress: () => void;
  /** Said while it waits: what is still missing. */
  waitsHint: string;
  /**
   * The input bar a typed answer is written in (`InputBar`, issue #365), with the keys she types
   * with: right above "Prüfen", in the same pinned bar, like the chat's. Handed what stands at the
   * bar's end while she types: "Prüfen" itself (null while there is nothing to check) — and
   * "Prüfen" across, for the essay's writing view (`WritingSheet`, issue #525).
   */
  input?: (checkInBar: ReactNode, checkAcross: ReactNode) => ReactNode;
  /**
   * She is typing in that bar: "Prüfen" stands in the bar itself (`CheckInBar`), as "Senden" does
   * in the chat, and the full-width one steps aside — with the keyboard up on a small phone it
   * would push the bar she types in under the keyboard.
   */
  typing?: boolean;
};

/** The tile is the action; `canTalk`: the options can be said, so the waveform stands in the bar. */
type Tap = { tap: true; canTalk?: boolean };

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

/** Gespräch: the conversation row in the bar's place. */
type Talk = { talk: Spoken };

/** The question's own pinned bar ("Weiter", the recorder), in the action's place. */
type OwnBar = { bar: ReactNode };

/** Closed question: the same primary slot advances to the next question. */
type Next = { next: { onPress: () => void; disabled?: boolean } };

/** A pass's own action (the flashcards, #384): at the pill's end, or across under the pill. */
type Own = { own: { inBar: ReactNode | null; across: ReactNode | null } };

export type CheckAction = Check | Tap | OwnBar | Own | Talk | Next;

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

export function CheckBar(provided: CheckAction & { keys?: ReactNode }) {
  const override = useCheckOverride();
  const action = override ?? provided;
  if ('spoken' in action && action.spoken) return <TalkRow {...action.spoken} check={action} />;
  if ('next' in action) return <NextBar {...action.next} />;
  if ('bar' in action) return <>{action.bar}</>;
  if ('own' in action) return <OwnAction {...action.own} />;
  if ('talk' in action) return <TalkRow {...action.talk} />;
  if ('tap' in action) return <TapBar canTalk={action.canTalk === true} />;
  return <CheckButton {...action} />;
}

function NextBar({ onPress, disabled }: Next['next']) {
  const { t } = useTranslation('practice');
  const field = useAskField(
    <Btn size="sm" pill keepsFocus onPress={onPress} disabled={disabled}>
      {t('next')}
    </Btn>,
  );
  return (
    <BottomBar>
      <InputBar {...field} />
    </BottomBar>
  );
}

/** Options she taps: the tile is the answer, the bar holds her question — and the waveform. */
function TapBar({ canTalk }: { canTalk: boolean }) {
  const field = useAskField(null);
  const conversation = useConversation();
  return (
    <BottomBar>
      <InputBar {...field} after={canTalk ? <TalkButton onPress={conversation.start} /> : null} />
    </BottomBar>
  );
}

/** A pass's own action: her question in the field, the action where "Prüfen" stands. */
function OwnAction({ inBar, across }: Own['own']) {
  const field = useAskField(inBar);
  return (
    <BottomBar>
      <InputBar {...field} />
      {across}
    </BottomBar>
  );
}

/**
 * Gespräch (issue #386): the conversation screen's row in the bar — "Tastatur" (back to the input
 * bar) · the mic · "Nochmal vorlesen". As on /talk the mic listens by itself once the question has
 * been read (the hands-free loop, `useHandsFreeMic`; the screen arms it); listening ends by itself
 * when she pauses (on the phone).
 */
function TalkRow({
  prompt,
  lang,
  disabled,
  onText,
  onReadAgain,
  check,
}: Spoken & { check?: Check }) {
  const { t } = useTranslation(['common', 'buddy']);
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
  const selectedCheck = check ? (
    <CheckBtn
      {...check}
      onPress={() => {
        if (submitted.current || disabled || !check.ready) return;
        submitted.current = true;
        voice.cancel();
        check.onPress();
      }}
      quiet={voice.state !== 'idle'}
      place="pill"
    />
  ) : null;
  return (
    <BottomBar>
      {/* Only what went wrong (no mic, nothing understood). Listening and writing it down are the
          mic's own (the ring, the stop square, the spinner; its screen-reader value): a status
          line while she speaks grew the bar by a line and hid Buddy's reply on 360×740 (#386). */}
      {voice.state === 'idle' ? <MicStatus voice={voice} /> : null}
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
        // The 56 pt mic: the row shares the screen with the question and its conversation (#386).
        size="md"
        mic={{
          voice,
          label: t('common:voice.answer'),
          disabled,
          filled: voice.state !== 'idle' || !check?.ready,
        }}
        right={
          onReadAgain
            ? { icon: 'speak', label: t('common:voice.read_again'), onPress: onReadAgain }
            : null
        }
        centerAction={check?.ready && voice.state === 'idle' ? selectedCheck : null}
        action={voice.state !== 'idle' ? selectedCheck : null}
      />
    </BottomBar>
  );
}

function CheckButton(check: Check & { keys?: ReactNode }) {
  const { t } = useTranslation('buddy');
  const { input, keys } = check;
  const conversation = useConversation();
  const field = useAskField(<CheckBtn {...check} place="pill" />);
  return (
    <BottomBar>
      {input ? (
        <>{input(<CheckBtn {...check} place="pill" />, <CheckBtn {...check} place="across" />)}</>
      ) : (
        // A form without a typed answer: her question in the field, "Prüfen" its action (#402).
        <InputBar
          {...field}
          under={keys}
          chips={
            check.canTalk ? (
              <CircleBtn
                icon="voice"
                size={COMPOSER.slot}
                onPress={conversation.start}
                accessibilityLabel={t('talk.open')}
              />
            ) : null
          }
        />
      )}
    </BottomBar>
  );
}

/**
 * The input bar's field as her question (issue #402): "Frag zur Aufgabe …", and at the box's end
 * the form's "Prüfen" (none under options) — or the chat's round send arrow, once she has typed a
 * question.
 */
function useAskField(check: ReactNode): ComponentProps<typeof InputBar> {
  const ask = useContext(AskRoute);
  const { t } = useTranslation(['practice', 'buddy', 'common']);
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
  return {
    // The walkthrough finds the question's field by this (tests/web/fit.ts).
    testID: 'ask-field',
    value: ask.value,
    maxLength: ASK_TEXT_MAX,
    onChangeText: ask.onChange,
    placeholder: t('practice:ask.placeholder'),
    accessibilityLabel: t('practice:ask.label'),
    submitBehavior: 'submit',
    returnKeyType: 'send',
    onSubmitEditing: send,
    onFocus: () => ask.onFocused(true),
    onBlur: () => ask.onFocused(false),
    disabled: ask.disabled,
    voice,
    micLabel: t('common:voice.message'),
    action: asking ? (
      <CircleBtn
        icon="send"
        filled
        size={COMPOSER.slot}
        keepsFocus
        onPress={send}
        disabled={ask.disabled}
        accessibilityLabel={t('buddy:composer.send')}
      />
    ) : (
      check
    ),
  };
}

/** The same check: in the Composer, or in the essay modal's own pinned footer. */
function CheckBtn({
  ready,
  disabled,
  onPress,
  waitsHint,
  place,
  quiet = false,
}: Check & { quiet?: boolean; place: 'across' | 'pill' }) {
  const { t } = useTranslation('practice');
  const hint = ready ? undefined : waitsHint;
  return (
    <View testID="answer-action">
      <Btn
        variant={ready && !quiet ? 'primary' : 'quiet'}
        size={place === 'across' ? 'md' : 'sm'}
        pill
        full={place === 'across'}
        keepsFocus={place === 'pill'}
        disabled={disabled || !ready}
        onPress={onPress}
        accessibilityHint={hint}
      >
        {t('check')}
      </Btn>
    </View>
  );
}
