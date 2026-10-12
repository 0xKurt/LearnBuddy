// The chat's text/voice composer. Attachments have one owner on the ordinary Capture page.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { composerAfterSend } from '../../lib/buddy/unsent.js';
import { pageHandler } from '../../lib/capture/pages.js';
import { updateDraft, useDraft } from '../../lib/drafts.js';
import { currentSession } from '../../lib/auth/session.js';
import { haptic } from '../../lib/haptics.js';
import { Appear } from '../lb/Motion.js';
import {
  captureIsCurrent,
  recoverCaptureCaption,
  supersedeCaptureCaption,
} from '../../lib/capture/sendCaption.js';
import { drafts } from '../../lib/capture/draftStorage.js';
import { askAttach } from '../../lib/capture/attachRequest.js';
import { COMPOSER } from '../../lib/theme/composer.js';
import { DURATION } from '../../lib/theme/motion.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { BottomBar } from '../lb/BottomBar.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { InputBar } from '../lb/InputBar.js';
import { TalkButton } from '../voice/TalkButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';

/** SendMessageRequest.text allows at most 2000 characters. */
const MAX_MESSAGE_LENGTH = 2000;

export function Composer({
  disabled,
  writing = false,
  onStop,
  onSend,
  onTalk,
}: {
  disabled: boolean;
  /** Buddy is answering what she sent: the send button becomes "Stopp". */
  writing?: boolean;
  /** Ends Buddy's answer (the turn ends stopped; see lib/buddy/useHomeSend.ts). */
  onStop?: () => void;
  /** Resolves false when the message never reached Buddy: her text comes back (audit M-76). */
  onSend: (text: string, clientMessageId?: string) => Promise<boolean>;
  /** Conversation mode (talk screen): bottom right, next to the mic. */
  onTalk: () => void;
}) {
  const { t } = useTranslation(['buddy', 'common']);
  // Kept on the device: a half-typed question survives Android killing the app.
  const { text, setText } = useDraft('chat');
  const latest = useRef(text);
  latest.current = text;
  const trimmed = text.trim();
  const recovered = useRef<Awaited<ReturnType<typeof recoverCaptureCaption>>>(null);
  const focused = useRef(true);
  const recovering = useRef(false);
  const recover = async () => {
    if (recovering.current || !focused.current) return;
    recovering.current = true;
    try {
      const pending = await recoverCaptureCaption();
      if (pending?.isCurrent() && focused.current)
        recovered.current = pending.confirmed ? null : pending;
    } finally {
      recovering.current = false;
    }
  };
  useEffect(() => {
    void recover();
  }, []);
  const changeText = (next: string) => {
    void supersedeCaptureCaption(latest.current, next);
    if (recovered.current?.caption.text !== next.trim()) recovered.current = null;
    setText(next);
  };
  /** Sends and empties the field; a message that never arrived comes back into it. */
  const delivering = useRef(false);
  const deliver = async (message: string) => {
    if (delivering.current) return;
    delivering.current = true;
    const isCurrent = captureIsCurrent();
    const uploadOwnsCaption = () => {
      const owner = currentSession()?.user_id;
      return owner !== undefined && drafts.isSendingCaption(owner, message);
    };
    try {
      if (uploadOwnsCaption()) return;
      const found =
        recovered.current?.caption.text === message
          ? recovered.current
          : await recoverCaptureCaption(message);
      if (!isCurrent() || uploadOwnsCaption()) return;
      const pending = found?.caption.text === message ? found : null;
      if (pending && !pending.isCurrent()) return;
      if (pending?.confirmed) {
        recovered.current = null;
        return;
      }
      haptic.tap();
      updateDraft('chat', (current) => (current.trim() === message ? '' : current));
      if (pending) drafts.startCaption(pending.requestId);
      const delivered = await onSend(message, pending?.caption.clientMessageId);
      if (!isCurrent()) return;
      if (pending) {
        if (!pending.isCurrent()) return;
        drafts.stopCaption(pending.requestId);
        if (delivered) {
          await drafts.finishCaption(pending.requestId, pending.caption.clientMessageId);
          recovered.current = null;
        } else recovered.current = pending;
      }
      setText((current) => composerAfterSend(current, message, delivered));
      if (delivered) void recover();
    } finally {
      delivering.current = false;
    }
  };

  const send = () => {
    if (disabled || !trimmed) return;
    void deliver(trimmed);
  };

  const voice = useVoiceInput({
    purpose: 'message',
    lang: null,
    onText: (said) => {
      // Into the field: she checks it and sends it herself.
      changeText(mergeTranscript(latest.current, said, 'append', MAX_MESSAGE_LENGTH));
    },
  });

  // Leaving the home (practice, settings …) ends a dictation still listening: it would
  // otherwise go on and send its text later (p2-lc-chat-mic-survives-leaving-home).
  const cancelVoice = useRef(voice.cancel);
  cancelVoice.current = voice.cancel;
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void recover();
      return () => {
        focused.current = false;
        cancelVoice.current();
      };
    }, []),
  );

  const stopBtn = (
    <Appear key="stop" duration={DURATION.quick}>
      <CircleBtn
        icon="stop"
        filled
        size={COMPOSER.slot}
        {...(onStop ? { onPress: onStop } : {})}
        accessibilityLabel={t('buddy:thread.stop_label')}
      />
    </Appear>
  );
  const stoppable = writing && onStop !== undefined && voice.state === 'idle';

  return (
    <BottomBar testID="composer">
      <InputBar
        value={text}
        onChangeText={changeText}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={t('buddy:composer.placeholder')}
        accessibilityLabel={t('buddy:composer.placeholder')}
        onSubmitEditing={send}
        voice={voice}
        micLabel={t('common:voice.message')}
        disabled={disabled}
        // The + opens the full Capture page. Only where a domain takes pages (#107).
        start={
          pageHandler.get() ? (
            <CircleBtn
              icon="plus"
              plain
              size={COMPOSER.slot}
              onPress={() => askAttach({ open: 'menu' })}
              accessibilityLabel={t('buddy:composer.attach.title')}
            />
          ) : null
        }
        // Like a messenger: the waveform while there is nothing to send, the round arrow once
        // there is — its name says "Senden" (issue #522).
        action={
          stoppable ? (
            stopBtn
          ) : trimmed.length > 0 ? (
            <CircleBtn
              icon="send"
              filled
              size={COMPOSER.slot}
              keepsFocus
              onPress={send}
              disabled={disabled}
              accessibilityLabel={t('buddy:composer.send')}
            />
          ) : null
        }
        // Conversation mode: the waveform circle at the box's end, same scale as its
        // neighbours (owner feedback 2026-09-28).
        after={<TalkButton onPress={onTalk} />}
      />
    </BottomBar>
  );
}
