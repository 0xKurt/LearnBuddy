// Free text to Buddy, typed or spoken, plus the pages she attaches. One floating
// bar: +, the field, the mic — "Senden" once there is text. The mic writes what she
// said into the field so she can check it. In voice mode the bar becomes voice-first:
// keyboard · big mic · camera, and what she says is sent right away.
// While Buddy writes his answer, the send button (or the big mic) is "Stopp".
//
// Pages are attached here, not on a screen of their own (issue #82): the + asks where
// they come from, they stand as small squares above the field, and "Senden" sends them
// with the message — the sheet first, so Buddy's answer already knows about it. What
// happens to a page on the way (preparing, the draft that survives a crash, the upload
// that resumes) is lib/capture/useAttachments.ts, the same as the capture screen uses.

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Animated from 'react-native-reanimated';

import { composerAfterSend } from '../../lib/buddy/unsent.js';
import { useDraft } from '../../lib/drafts.js';
import { haptic } from '../../lib/haptics.js';
import { fadeIn } from '../../lib/theme/enter.js';
import { DURATION } from '../../lib/theme/motion.js';
import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { isDarkBackground } from '../../lib/theme/luminance.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { PhotoCheckCard } from '../capture/PhotoCheckCard.js';
import { Btn } from '../lb/Btn.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { Progress } from '../lb/Progress.js';
import { useToastBar } from '../lb/Toast.js';
import { AttachStrip } from './AttachStrip.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { TalkButton } from '../voice/TalkButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { SPACE, bottomRoom } from '../../lib/theme/space.js';
import { Sheet } from '../lb/Sheet.js';
import { useAttachments } from '../../lib/capture/useAttachments.js';
import type { SendProgress } from '../../lib/capture/upload.js';

/** SendMessageRequest.text allows at most 2000 characters. */
const MAX_MESSAGE_LENGTH = 2000;
// The count only appears once it is about to matter: a permanent 0/2000 under the field
// would be one more number on a screen that is meant to be calm (#133 position 17).
const COUNT_FROM = MAX_MESSAGE_LENGTH - 200;

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
  /** Ends Buddy's answer (the turn ends stopped; see app/buddy.tsx). */
  onStop?: () => void;
  /** Resolves false when the message never reached Buddy: her text comes back (audit M-76). */
  onSend: (text: string) => Promise<boolean>;
  /** Conversation mode (talk screen): bottom right, next to the mic. */
  onTalk: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'common']);
  const insets = useSafeAreaInsets();
  const voiceMode = useVoiceMode((s) => s.on);
  const setVoiceMode = useVoiceMode((s) => s.setOn);
  // Kept on the device: a half-typed question survives Android killing the app.
  const { text, setText, clear } = useDraft('chat');
  const [focused, setFocused] = useState(false);
  /** The little "where from" menu behind the + (issue #82). */
  const [attach, setAttach] = useState(false);
  const latest = useRef({ text, disabled });
  latest.current = { text, disabled };
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
      const next = mergeTranscript(latest.current.text, said, 'append', MAX_MESSAGE_LENGTH);
      // Voice mode sends at once; otherwise (or while a message is still on its way) she checks it first.
      if (useVoiceMode.getState().on && !latest.current.disabled) {
        deliver(next.trim());
      } else {
        setText(next);
      }
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

  // A toast stands above this bar, not on the conversation (issue #91).
  const onToastBar = useToastBar();

  // Slim (issue #64): the bar carries the field and three buttons, nothing more — every
  // point it takes is one the conversation loses.
  const frame = {
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.xs,
    paddingBottom: bottomRoom(insets.bottom, SPACE.md),
  };

  const stopBtn = (size: 'sm' | 'lg') => (
    <Animated.View key="stop" entering={fadeIn(DURATION.quick)}>
      <Btn
        pill
        size={size}
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

  if (voiceMode) {
    // Voice first: keyboard · big mic · camera.
    return (
      <View style={frame} onLayout={onToastBar}>
        {attachSheet}
        <MicStatus voice={voice} />
        {attachments}
        {/* Heard while a message was still on its way: shown with its own "Senden", never
            hidden in a field voice mode does not show (composer-parked-transcript). */}
        {trimmed || attached ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Text style={[TYPE.body, { flex: 1, color: palette.ink }]} numberOfLines={3}>
              {trimmed}
            </Text>
            <Btn onPress={send} disabled={disabled || pages.busy} pill size="sm">
              {t('buddy:composer.send')}
            </Btn>
          </View>
        ) : null}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}
        >
          <View style={{ alignItems: 'center', gap: SPACE.xs, width: 90 }}>
            <CircleBtn
              icon="keyboard"
              onPress={() => setVoiceMode(false)}
              accessibilityLabel={t('buddy:composer.keyboard')}
            />
            <Text style={[TYPE.label, { color: palette.ink2 }]}>
              {t('buddy:composer.keyboard')}
            </Text>
          </View>
          {stoppable ? (
            stopBtn('lg')
          ) : (
            <MicButton
              voice={voice}
              size="lg"
              label={t('common:voice.message')}
              disabled={disabled}
            />
          )}
          <View style={{ alignItems: 'center', gap: SPACE.xs, width: 90 }}>
            <CircleBtn
              icon="camera"
              // The page lands above the field, like in the typing bar (issue #82).
              onPress={() => void pages.pick('camera')}
              accessibilityLabel={t('buddy:composer.photo')}
            />
            <Text style={[TYPE.label, { color: palette.ink2 }]}>
              {t('buddy:composer.photo_short')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View testID="composer" style={frame} onLayout={onToastBar}>
      {attachSheet}
      <MicStatus voice={voice} />
      {attachments}
      {text.length >= COUNT_FROM ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            TYPE.label,
            {
              color: text.length >= MAX_MESSAGE_LENGTH ? palette.danger : palette.ink2,
              alignSelf: 'flex-end',
              marginBottom: SPACE.xs,
              marginRight: SPACE.sm,
            },
          ]}
        >
          {text.length >= MAX_MESSAGE_LENGTH
            ? t('buddy:composer.full')
            : t('buddy:composer.remaining', { count: MAX_MESSAGE_LENGTH - text.length })}
        </Text>
      ) : null}
      <View
        style={[
          {
            flexDirection: 'row',
            // flex-end, not center: while the field grows over several lines the
            // buttons stay on its last line, like every messenger (user feedback).
            alignItems: 'flex-end',
            // 2, off the scale: the field carries its own xs padding on each side —
            // a full step here would double the air inside the pill.
            gap: 2,
            backgroundColor: palette.paper,
            borderRadius: 28,
            padding: SPACE.xs,
            // 52 + the bar's padding keeps the buttons at their 44 pt target while the
            // pill stops looking like a drawer (was 60).
            minHeight: 52,
            // The focus ring sits on the pill, not on the bare field inside (the web drew a black box).
            outlineStyle: 'solid',
            outlineWidth: focused ? 4 : 0,
            outlineColor: palette.ring,
          },
          SHADOW.float,
        ]}
      >
        {/* Like the assistants she knows: one + that asks where it comes from, instead of a
            page of its own (owner 29.09., issue #82). */}
        <CircleBtn
          icon="plus"
          plain
          onPress={() => setAttach(true)}
          accessibilityLabel={t('buddy:composer.attach.title')}
        />
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t('buddy:composer.placeholder')}
          placeholderTextColor={palette.ink3}
          // Same as every other field: a light keyboard over the night palette is the one
          // white rectangle on a dark screen (#133 position 7).
          keyboardAppearance={isDarkBackground(palette.bg) ? 'dark' : 'light'}
          accessibilityLabel={t('buddy:composer.placeholder')}
          multiline
          // The web's textarea starts two rows tall; one row, growing with the text.
          {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
          maxLength={MAX_MESSAGE_LENGTH}
          onSubmitEditing={send}
          textAlignVertical="center"
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            backgroundColor: 'transparent',
            paddingHorizontal: SPACE.xs,
            paddingVertical: SPACE.sm,
            fontSize: 16,
            lineHeight: 22,
            color: palette.ink,
            outlineWidth: 0,
          }}
        />
        {/* Like a messenger: the mic while the field is empty (or she is speaking), send once there is text. */}
        {stoppable ? (
          stopBtn('sm')
        ) : (trimmed.length === 0 && !attached) || voice.state !== 'idle' ? (
          <MicButton
            voice={voice}
            size="sm"
            label={t('common:voice.message')}
            disabled={disabled}
          />
        ) : (
          <Btn onPress={send} disabled={disabled || pages.busy} pill size="sm">
            {t('buddy:composer.send')}
          </Btn>
        )}
        {/* Conversation mode: the waveform circle at the pill's end, same scale
            as its neighbours (owner feedback 2026-09-28). */}
        <TalkButton onPress={onTalk} />
      </View>
    </View>
  );
}
