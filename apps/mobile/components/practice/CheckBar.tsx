// "Prüfen", once for every form (issue #310). Before this each board built its own bar with its
// own button (order, match, table, cloze), and the note line had a bigger one built by the screen;
// now an answer form says only WHEN its answer is complete and WHAT to send, and this bar is the
// one place and the one look of the action: pinned at the bottom (`BottomBar`, outside every
// scroll, above the keyboard).
//
// The bar is the app's one input bar (`InputBar`, issue #395, report #388 §9), with "Prüfen" in
// its action slot, as the chat has "Senden" there:
//   · a typed answer brings its own input bar, with the field (issue #365): the same bar as the
//     chat's, at the bottom, never floating under the question. While she types, "Prüfen" stands
//     in it at the pill's end (`CheckInBar`); otherwise across the bar under the pill;
//   · every other form — a board (order, match, table, cloze, mark, select-all), the note line,
//     the fraction bar, options she taps — has no text to type, so the field is her question to
//     the tutor (`useAskField`, issue #402, report #388 §1): "Frag zur Aufgabe …", with "Prüfen" at
//     the pill's end. Once she has typed a question "Senden" takes its place, as in the chat, and
//     "Prüfen" comes back when the question is sent. The pill is 54 pt where "Prüfen" across was
//     48 (+6 pt on a board); under options it is the whole bar (the tile is the answer).
//
// Gespräch (issue #386): where an answer can be said — a typed answer, options with letters — the
// waveform stands at the end of the input bar, as in the chat (`TalkButton`). Tapped, the bar
// becomes the conversation row (`Talk`, `VoiceRow`): "Tastatur" · the mic · "Nochmal
// vorlesen", the same row as the conversation screen's (`app/talk.tsx`), mic in the middle. What
// she says is checked right away; "Tastatur" brings the input bar back.
//
// It waits until the answer is complete. While it waits it says why to a screen reader (the
// form's own hint: "Leg erst alle an ihren Platz"), and a tap on it does nothing — the button
// wears the waiting skin (`Btn`, issue #97).
//
// Two other actions stand in the same place, so nothing about where the bottom of the screen is
// depends on the form (issue #310, the notes of step 3):
//   · `tap` — options answered by a tap on the tile (multiple choice, tapped words). There is no
//     "Prüfen": the bar holds only her question (and the waveform where the options can be said);
//   · `talk` — the conversation row, in a conversation, for a form whose answer can be said;
//   · `bar` — the question's own pinned bar: "Weiter" once it is closed, the pronunciation
//     recorder. The shell places it like "Prüfen", at the bottom.

import { ASK_TEXT_MAX } from '@learnbuddy/shared-types/contracts';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Btn } from '../lb/Btn.js';
import { BottomBar } from '../lb/BottomBar.js';
import { InputBar } from '../lb/InputBar.js';
import { MicStatus } from '../voice/MicButton.js';
import { TalkButton } from '../voice/TalkButton.js';
import { useConversation } from '../voice/useConversation.js';
import { useHandsFreeMic } from '../voice/useHandsFreeMic.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { VoiceRow } from '../voice/VoiceRow.js';

/** "Prüfen": what a form hands to the bar — when its answer may go, how it goes, and why it waits. */
type Check = {
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
   * bar's end while she types: "Prüfen" itself (null while there is nothing to check).
   */
  input?: (checkInBar: ReactNode) => ReactNode;
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

export type CheckAction = Check | Tap | OwnBar | Talk;

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

export function CheckBar(action: CheckAction) {
  if ('bar' in action) return <>{action.bar}</>;
  if ('talk' in action) return <TalkRow {...action.talk} />;
  if ('tap' in action) return <TapBar canTalk={action.canTalk === true} />;
  return <CheckButton {...action} />;
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

/**
 * Gespräch (issue #386): the conversation screen's row in the bar — "Tastatur" (back to the input
 * bar) · the mic · "Nochmal vorlesen". As on /talk the mic listens by itself once the question has
 * been read (the hands-free loop, `useHandsFreeMic`; the screen arms it); listening ends by itself
 * when she pauses (on the phone).
 */
function TalkRow({ prompt, lang, disabled, onText, onReadAgain }: Spoken) {
  const { t } = useTranslation(['common', 'buddy']);
  const conversation = useConversation();
  const voice = useVoiceInput({
    purpose: 'answer',
    lang,
    context: prompt,
    onText,
    untilPause: true,
  });
  useHandsFreeMic(voice, disabled, prompt);
  return (
    <BottomBar>
      <MicStatus voice={voice} />
      <VoiceRow
        left={{
          icon: 'keyboard',
          label: t('buddy:composer.keyboard'),
          onPress: () => {
            voice.cancel();
            conversation.stop();
          },
        }}
        // The 56 pt mic: the row shares the screen with the question and its conversation (#386).
        size="md"
        mic={{ voice, label: t('common:voice.answer'), disabled }}
        right={
          onReadAgain
            ? { icon: 'speak', label: t('common:voice.read_again'), onPress: onReadAgain }
            : null
        }
      />
    </BottomBar>
  );
}

function CheckButton(check: Check) {
  const { input, typing, ready } = check;
  const field = useAskField(<CheckBtn {...check} />);
  return (
    <BottomBar>
      {input ? (
        <>
          {input(typing && ready ? <CheckBtn {...check} /> : null)}
          {typing ? null : <CheckBtn {...check} across />}
        </>
      ) : (
        // A form without a typed answer: her question in the field, "Prüfen" its action (#402).
        <InputBar {...field} />
      )}
    </BottomBar>
  );
}

/**
 * The input bar's field as her question (issue #402): "Frag zur Aufgabe …", and at the pill's end
 * the form's "Prüfen" (none under options) — or "Senden", the chat's, once she has typed a
 * question. The placeholder stays beside "Prüfen": it is what says the field is there to ask.
 */
function useAskField(check: ReactNode): ComponentProps<typeof InputBar> {
  const ask = useContext(AskRoute);
  const { t } = useTranslation(['practice', 'buddy']);
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
    keepPlaceholder: true,
    accessibilityLabel: t('practice:ask.label'),
    submitBehavior: 'submit',
    returnKeyType: 'send',
    onSubmitEditing: send,
    onFocus: () => ask.onFocused(true),
    onBlur: () => ask.onFocused(false),
    disabled: ask.disabled,
    action: asking ? (
      <Btn pill size="sm" onPress={send} disabled={ask.disabled}>
        {t('buddy:composer.send')}
      </Btn>
    ) : (
      check
    ),
  };
}

/**
 * "Prüfen" itself, in one of two places. `across`: over the bar's full width (md, the boards'
 * size) — under a typed answer's field. Otherwise inside the input
 * bar (issues #365, #402), where the chat's "Senden" is: small, at the pill's end, and it keeps
 * the focus in the field, so a tap never closes the keyboard under her finger before it lands.
 */
function CheckBtn({
  ready,
  disabled,
  onPress,
  waitsHint,
  across = false,
}: Check & { across?: boolean }) {
  const { t } = useTranslation('practice');
  return (
    <View testID="answer-action">
      <Btn
        size={across ? 'md' : 'sm'}
        pill
        full={across}
        keepsFocus={!across}
        disabled={disabled || !ready}
        onPress={onPress}
        accessibilityHint={ready ? undefined : waitsHint}
      >
        {t('check')}
      </Btn>
    </View>
  );
}
