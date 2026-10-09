// Free text to Buddy, typed or spoken, plus the pages she attaches. One floating
// bar: +, the field, the mic — "Senden" once there is text — and the waveform at its end,
// the way into a conversation (`app/talk.tsx`). The mic writes what she said into the field
// so she can check it. While Buddy writes his answer, the send button is "Stopp".
// There is no second, voice-first bar any more (issue #386, owner 04.10.): the speaker in the
// head only switches reading aloud, and talking hands-free is the waveform's.
//
// Pages are attached here, not on a screen of their own (issue #82): the + asks where
// they come from, they stand as small squares above the field, and "Senden" sends them
// with the message — the sheet first, so Buddy's answer already knows about it. What
// happens to a page on the way (preparing, the draft that survives a crash, the upload
// that resumes) is lib/capture/useAttachments.ts, the same as the capture screen uses.

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Animated from 'react-native-reanimated';

import { composerAfterSend } from '../../lib/buddy/unsent.js';
import { useDraft } from '../../lib/drafts.js';
import { haptic } from '../../lib/haptics.js';
import { fadeIn } from '../../lib/theme/enter.js';
import { DURATION } from '../../lib/theme/motion.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { PhotoCheckCard } from '../capture/PhotoCheckCard.js';
import { BottomBar } from '../lb/BottomBar.js';
import { Btn } from '../lb/Btn.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { InputBar } from '../lb/InputBar.js';
import { Progress } from '../lb/Progress.js';
import { AttachStrip } from './AttachStrip.js';
import { TalkButton } from '../voice/TalkButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { SPACE } from '../../lib/theme/space.js';
import { Sheet } from '../lb/Sheet.js';
import { useAttachments } from '../../lib/capture/useAttachments.js';
import type { SendProgress } from '../../lib/capture/upload.js';

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
  onSend: (text: string) => Promise<boolean>;
  /** Conversation mode (talk screen): bottom right, next to the mic. */
  onTalk: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'common']);
  // Kept on the device: a half-typed question survives Android killing the app.
  const { text, setText, clear } = useDraft('chat');
  /** The little "where from" menu behind the + (issue #82). */
  const [attach, setAttach] = useState(false);
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

  /** The text that goes out once the attached pages are through. */
  const withPages = useRef('');
  // The pages she attached to this message. The chat never takes over a draft left from
  // an earlier capture (`intake` stays off): the home says when one is waiting.
  const pages = useAttachments({
    initialLink: {
      stepId: null,
      goalId: null,
      purpose: 'study',
      completes: null,
      pages: null,
      add: false,
    },
    onSent: () => {
      // The sheet is with the API; her words follow, so Buddy answers about it.
      const waiting = withPages.current;
      withPages.current = '';
      if (waiting) deliver(waiting);
    },
  });
  const attached = pages.photos.length > 0;

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

  // Leaving the home (practice, capture, settings …) ends a dictation still listening: it
  // would otherwise go on and send its text later (p2-lc-chat-mic-survives-leaving-home).
  const cancelVoice = useRef(voice.cancel);
  cancelVoice.current = voice.cancel;
  useFocusEffect(
    useCallback(
      () => () => {
        cancelVoice.current();
      },
      [],
    ),
  );

  const stopBtn = (
    <Animated.View key="stop" entering={fadeIn(DURATION.quick)}>
      <Btn
        pill
        size="sm"
        variant="soft"
        icon="stop"
        onPress={onStop}
        accessibilityLabel={t('buddy:thread.stop_label')}
      >
        {t('buddy:thread.stop')}
      </Btn>
    </Animated.View>
  );
  const stoppable = writing && onStop !== undefined && voice.state === 'idle';

  const progressText = (p: SendProgress): string =>
    p.step === 'reserving'
      ? t('capture:progress.reserving')
      : p.step === 'uploading'
        ? t('capture:progress.uploading', { current: p.current, count: p.total })
        : t('capture:progress.submitting');
  /** Above the field: the attached pages, a page that is hard to read, how the sending goes. */
  const attachments = (
    <>
      {pages.preparing ? (
        <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
          {t('capture:preparing', {
            current: pages.preparing.current,
            count: pages.preparing.total,
          })}
        </Text>
      ) : null}
      <AttachStrip
        uris={pages.photos}
        pdfs={pages.pdfs}
        flagged={new Set(pages.photos.filter((uri) => (pages.problems[uri]?.length ?? 0) > 0))}
        disabled={pages.busy}
        onRemove={pages.remove}
      />
      {pages.review ? (
        <PhotoCheckCard
          index={pages.photos.indexOf(pages.review) + 1}
          problems={pages.problems[pages.review] ?? []}
          disabled={pages.busy}
          onRetake={() => pages.retake(pages.review!)}
          onKeep={() => pages.keep(pages.review!)}
        />
      ) : null}
      {pages.progress ? (
        <View accessibilityLiveRegion="polite" style={{ gap: SPACE.xs }}>
          <Text style={[TYPE.small, { color: palette.ink2 }]}>{progressText(pages.progress)}</Text>
          <View style={{ flexDirection: 'row' }}>
            <Progress
              value={
                pages.progress.step === 'reserving'
                  ? 0
                  : pages.progress.step === 'uploading'
                    ? (pages.progress.current - 1) / pages.progress.total
                    : 1
              }
            />
          </View>
        </View>
      ) : pages.failure ? (
        <ErrorNote text={pages.failure} />
      ) : null}
    </>
  );
  const attachSheet = (
    <Sheet
      visible={attach}
      title={t('buddy:composer.attach.title')}
      closeLabel={t('common:actions.close')}
      onClose={() => setAttach(false)}
    >
      {(['camera', 'library', 'files'] as const).map((source) => (
        <Btn
          key={source}
          full
          pill
          size="lg"
          variant="soft"
          icon={source === 'camera' ? 'camera' : source === 'library' ? 'book' : 'file'}
          onPress={() => {
            setAttach(false);
            // Straight into the camera or the picker; the page lands above the field.
            if (source === 'files') void pages.pickFiles();
            else void pages.pick(source);
          }}
        >
          {t(`buddy:composer.attach.${source}`)}
        </Btn>
      ))}
    </Sheet>
  );

  return (
    <BottomBar testID="composer">
      {attachSheet}
      <InputBar
        value={text}
        onChangeText={setText}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={t('buddy:composer.placeholder')}
        accessibilityLabel={t('buddy:composer.placeholder')}
        onSubmitEditing={send}
        voice={voice}
        micLabel={t('common:voice.message')}
        disabled={disabled}
        above={attachments}
        // Like the assistants she knows: one + that asks where it comes from, instead of a
        // page of its own (owner 29.09., issue #82).
        start={
          <CircleBtn
            icon="plus"
            plain
            onPress={() => setAttach(true)}
            accessibilityLabel={t('buddy:composer.attach.title')}
          />
        }
        // Like a messenger: the mic while there is nothing to send, "Senden" once there is.
        action={
          stoppable ? (
            stopBtn
          ) : trimmed.length > 0 || attached ? (
            <Btn onPress={send} disabled={disabled || pages.busy} pill size="sm">
              {t('buddy:composer.send')}
            </Btn>
          ) : null
        }
        // Conversation mode: the waveform circle at the pill's end, same scale as its
        // neighbours (owner feedback 2026-09-28).
        after={<TalkButton onPress={onTalk} />}
      />
    </BottomBar>
  );
}
