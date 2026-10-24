// A rehearsal uses the same recording action and status as word and sentence practice.
// Its material, target duration and measured result remain specific to the rehearsal.
import {
  REHEARSAL_MAX_BASE64,
  REHEARSAL_MAX_MS,
  type ActionSummary,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { newId } from '../../lib/api/client.js';
import { sendRehearsal } from '../../lib/api/learningEndpoints.js';
import { setHome } from '../../lib/api/queries.js';
import { useThreadRecording } from '../../lib/buddy/headState.js';
import { sentDuration } from '../../lib/buddy/rehearsal.js';
import { messageFor } from '../../lib/errors.js';
import { type Recording } from '../../lib/speech/record.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { useMounted } from '../../lib/useMounted.js';
import { ChatCard } from './ChatCard.js';
import { type Quiet } from './extensions.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useMicRecorder } from '../voice/useMicRecorder.js';

type Offer = Extract<ActionSummary, { tool: 'offer_rehearsal' }>;

export function RehearseCard({
  actionId,
  offer,
  quiet = 'primary',
}: {
  actionId: string;
  offer: Offer;
  /** Whether the start may be the screen's one filled button (extensions.ts `loudCard`). */
  quiet?: Quiet;
}) {
  useTheme();
  const { t } = useTranslation(['buddy', 'practice']);
  const mounted = useMounted();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const maxMs = REHEARSAL_MAX_MS[offer.kind];

  async function send(r: Recording): Promise<void> {
    const duration = sentDuration(offer.kind, r.durationMs);
    if (duration === null) {
      setProblem(t('buddy:rehearse.too_short'));
      return;
    }
    setSending(true);
    try {
      const res = await sendRehearsal({
        client_request_id: newId(),
        action_id: actionId,
        mime: r.mime,
        audio_base64: r.base64,
        duration_ms: duration,
      });
      // The result is Buddy's message in the thread now.
      setHome(res.home);
    } catch (err) {
      if (mounted.current) setProblem(messageFor(err));
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  const rec = useMicRecorder({
    maxMs,
    long: { maxBase64: REHEARSAL_MAX_BASE64 },
    onRecorded: (r) => void send(r),
  });
  const recording = rec.phase === 'recording';
  // The chat's head shows Buddy listening while the recorder runs (lib/buddy/headState.ts) —
  // said under this card's own name: another rehearsal card in the thread says its own.
  const card = useId();
  useEffect(() => {
    useThreadRecording.getState().set(card, recording);
    return () => useThreadRecording.getState().set(card, false);
  }, [card, recording]);
  const label = t(offer.kind === 'talk' ? 'buddy:rehearse.talk' : 'buddy:rehearse.read_aloud');

  function toggle(): void {
    if (recording) {
      void rec.stop();
      return;
    }
    setProblem(null);
    void rec.start();
  }

  const hint =
    offer.kind === 'read_aloud'
      ? t('buddy:rehearse.hint_read')
      : offer.minutes !== null
        ? t('buddy:rehearse.hint_talk_minutes', { minutes: offer.minutes })
        : t('buddy:rehearse.hint_talk');

  return (
    <ChatCard
      mode="mint"
      icon={offer.kind === 'talk' ? 'mic' : 'book'}
      label={label}
      title={offer.title}
      titleLines={2}
      // While it records the card says what is happening, not what to do.
      detail={recording ? null : hint}
    >
      {/* The passage stands whole: she reads it from here while the card records. */}
      {offer.kind === 'read_aloud' && offer.text ? (
        <Text testID="rehearse-text" style={TYPE.body}>
          {offer.text}
        </Text>
      ) : null}
      <MicStatus
        voice={rec.voice}
        targetMs={offer.minutes === null ? undefined : offer.minutes * 60_000}
      />
      <MicButton
        voice={rec.voice}
        presentation="recorder"
        label={t('buddy:rehearse.start')}
        tone={quiet === 'primary' ? 'primary' : 'quiet'}
        busy={sending}
        busyLabel={t('practice:speak.listening')}
        onPress={toggle}
        accessibilityHint={`${label}: ${offer.title}`}
      />
      {problem ? (
        <Text accessibilityRole="alert" style={TYPE.meta}>
          {problem}
        </Text>
      ) : null}
    </ChatCard>
  );
}
