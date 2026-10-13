// Free text to Buddy, typed or spoken, plus the pages she attaches. The one Composer
// (`components/lb/Composer.tsx`, issues #522, #599): her text on top, under it the + on the left, the mic and one filled
// circle on the right — the waveform, the way into a conversation (`app/talk.tsx`), or the round
// send arrow once there is something to send. The mic writes what she said into the field so she
// can check it. While Buddy writes his answer, the filled circle is "Stopp".
// There is no second, voice-first bar any more (issue #386, owner 04.10.): the speaker in the
// head only switches reading aloud, and talking hands-free is the waveform's.
//
// Pages are attached here and only here (issues #82, #519): the + opens the small menu (Kamera ·
// Fotos · Dateien, `AttachMenu`), every other place that asks for a photo opens it or the camera
// through this bar (lib/capture/attachRequest.ts), the pages stand as small squares above the
// field (`ComposerPages`), and the send arrow sends them with the message — the sheet first, so
// Buddy's answer already knows about it. What happens to a page on the way (preparing, the
// draft that survives a crash, the upload that resumes) is lib/capture/useAttachments.ts.

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isTyping } from '../../lib/buddy/typing.js';
import { composerAfterSend } from '../../lib/buddy/unsent.js';
import { pageHandler } from '../../lib/capture/pages.js';
import { useDraft } from '../../lib/drafts.js';
import { haptic } from '../../lib/haptics.js';
import { Appear } from '../lb/Motion.js';
import { COMPOSER } from '../../lib/theme/composer.js';
import { DURATION } from '../../lib/theme/motion.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { AttachMenu } from '../capture/AttachMenu.js';
import { BottomBar } from '../lb/BottomBar.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { Composer as OneComposer, type ComposerAction } from '../lb/Composer.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { ComposerPages } from './ComposerPages.js';
import { useChatPages } from './useChatPages.js';

/** SendMessageRequest.text allows at most 2000 characters. */
const MAX_MESSAGE_LENGTH = 2000;

export function Composer({
  disabled,
  writing = false,
  onStop,
  onSend,
  onTalk,
  onTyping,
  onAttached,
}: {
  disabled: boolean;
  /** Buddy is answering what she sent: the send button becomes "Stopp". */
  writing?: boolean;
  /** Ends Buddy's answer (the turn ends stopped; see lib/buddy/useHomeSend.ts). */
  onStop?: () => void;
  /** Resolves false when the message never reached Buddy: her text comes back (audit M-76). */
  onSend: (text: string) => Promise<boolean>;
  /** Conversation mode (talk screen): bottom right, next to the mic. */
  onTalk: () => void;
  /**
   * She is writing or dictating a message right now — what the head's orb leans in to
   * (`headState` `typing`, design ui_kits/app/App.jsx:46; decision on #599).
   */
  onTyping?: (typing: boolean) => void;
  /** Pages stand above the field: the first-visit Home gives them its room (HomeIntro). */
  onAttached?: (attached: boolean) => void;
}) {
  const { t } = useTranslation(['buddy', 'common']);
  // Kept on the device: a half-typed question survives Android killing the app.
  const { text, setText, clear } = useDraft('chat');
  const latest = useRef(text);
  latest.current = text;
  const trimmed = text.trim();
  /** Sends and empties the field; a message that never arrived comes back into it. */
  const deliver = (message: string) => {
    haptic.tap();
    clear();
    void onSend(message).then((delivered) =>
      setText((current) => composerAfterSend(current, message, delivered)),
    );
  };

  // The chat is the screen she sees (not a practice or the library standing over it).
  const [focused, setFocused] = useState(true);
  /** The text that goes out once the attached pages are through. */
  const withPages = useRef('');
  const { pages, menu, more } = useChatPages({
    focused,
    onSent: () => {
      // The sheet is with the API; her words follow, so Buddy answers about it.
      const waiting = withPages.current;
      withPages.current = '';
      if (waiting) deliver(waiting);
    },
  });
  const attached = pages.photos.length > 0;
  const tellAttached = useRef(onAttached);
  tellAttached.current = onAttached;
  useEffect(() => {
    tellAttached.current?.(attached);
  }, [attached]);

  const send = () => {
    if (disabled || pages.busy) return;
    if (attached) {
      // Pages first, message after (onSent) — an upload that fails keeps both, so the
      // same tap sends them again; nothing is lost and nothing is claimed.
      withPages.current = trimmed;
      void pages.send();
      return;
    }
    if (!trimmed) return;
    deliver(trimmed);
  };

  const voice = useVoiceInput({
    purpose: 'message',
    lang: null,
    onText: (said) => {
      // Into the field: she checks it and sends it herself.
      setText(mergeTranscript(latest.current, said, 'append', MAX_MESSAGE_LENGTH));
    },
  });

  // Leaving the home (practice, settings …) ends a dictation still listening: it would
  // otherwise go on and send its text later (p2-lc-chat-mic-survives-leaving-home).
  const cancelVoice = useRef(voice.cancel);
  cancelVoice.current = voice.cancel;
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        cancelVoice.current();
      };
    }, []),
  );

  // She is writing in the field, or the mic is taking her words down (`lib/buddy/typing.ts`).
  const [fieldFocused, setFieldFocused] = useState(false);
  const typing = isTyping({
    onScreen: focused,
    fieldFocused,
    text,
    dictating: voice.state !== 'idle',
  });
  const tellTyping = useRef(onTyping);
  tellTyping.current = onTyping;
  useEffect(() => {
    tellTyping.current?.(typing);
  }, [typing]);
  useEffect(() => () => tellTyping.current?.(false), []);

  const stoppable = writing && onStop !== undefined && voice.state === 'idle';
  // Like a messenger: the waveform while there is nothing to send, the round arrow once there is
  // (issue #522). While Buddy writes, the same slot is "Stopp" — not in the design, as before it.
  const action: ComposerAction | null = stoppable
    ? {
        kind: 'own',
        node: (
          <Appear key="stop" duration={DURATION.quick}>
            <CircleBtn
              icon="stop"
              filled
              size={COMPOSER.slot}
              {...(onStop ? { onPress: onStop } : {})}
              accessibilityLabel={t('buddy:thread.stop_label')}
            />
          </Appear>
        ),
      }
    : trimmed.length > 0 || attached
      ? { kind: 'send', onPress: send, disabled: disabled || pages.busy }
      : null;

  return (
    <BottomBar testID="composer" yields={attached}>
      <AttachMenu
        visible={menu.visible}
        link={menu.link}
        onChoose={menu.choose}
        onClose={menu.close}
      />
      <OneComposer
        value={text}
        onChangeText={setText}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={t('buddy:composer.placeholder')}
        accessibilityLabel={t('buddy:composer.placeholder')}
        onSubmitEditing={send}
        onFocus={() => setFieldFocused(true)}
        onBlur={() => setFieldFocused(false)}
        voice={voice}
        micLabel={t('common:voice.message')}
        disabled={disabled}
        attached={<ComposerPages pages={pages} onMore={more} />}
        // With the keyboard up the pages and the photo check scroll; field and tools stay whole.
        attachedYields={attached}
        // Like the assistants she knows: one + that asks where it comes from, instead of a
        // page of its own (owner 29.09., issue #82). Only where a domain takes pages (#107).
        tool={
          pageHandler.get()
            ? { icon: 'plus', label: t('buddy:composer.attach.title'), onPress: menu.open }
            : null
        }
        action={action}
        // Conversation mode: the blue waveform holds the slot while there is nothing to send.
        onTalk={onTalk}
      />
    </BottomBar>
  );
}
