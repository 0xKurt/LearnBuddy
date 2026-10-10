// Buddy offered a rehearsal of her talk, or reading a text aloud (issue #264): one card under his
// message that records her — no new screen (CLAUDE.md rule 16): the conversation carries it like a
// roleplay (#244). The card shows what she rehearses (the talk's title, or the whole passage to
// read), one button that starts and ends the recording, and while it runs the same recording line
// as the pronunciation recorder. The recording goes to the server once, is measured there and kept
// nowhere; the result arrives in the thread as Buddy's message (`RehearsalResult`).
//
// The microphone is only on while she has tapped it on, on this card she is looking at — the same
// rule as everywhere a recording runs (lib/speech/record.ts).

import {
  REHEARSAL_MAX_BASE64,
  REHEARSAL_MAX_MS,
  type ActionSummary,
} from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text } from 'react-native';

import { newId } from '../../lib/api/client.js';
import { sendRehearsal } from '../../lib/api/endpoints.js';
import { setHome } from '../../lib/api/queries.js';
import { sentDuration } from '../../lib/buddy/rehearsal.js';
import { messageFor } from '../../lib/errors.js';
import { useRecording, type Recording } from '../../lib/speech/record.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { useMounted } from '../../lib/useMounted.js';
import { Btn } from '../lb/Btn.js';
import { OfferShell } from '../learn/OfferShell.js';
import { RecordingStatus } from '../voice/RecordingStatus.js';

type Offer = Extract<ActionSummary, { tool: 'offer_rehearsal' }>;

export function RehearseCard({ actionId, offer }: { actionId: string; offer: Offer }) {
  const { palette } = useTheme();
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

  const rec = useRecording({
    maxMs,
    long: { maxBase64: REHEARSAL_MAX_BASE64 },
    onRecorded: (r) => void send(r),
    onFailed: (why) => {
      if (why !== 'denied') setProblem(t(`practice:speak.problem.${why}`));
    },
  });
  const recording = rec.phase === 'recording';
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
    <OfferShell icon={offer.kind === 'talk' ? 'voice' : 'book'} label={label}>
      {/* The passage stands whole: she reads it from here while the card records. */}
      <Text testID="rehearse-text" style={TYPE.body}>
        {offer.kind === 'read_aloud' && offer.text ? offer.text : offer.title}
      </Text>
      {recording ? (
        <RecordingStatus elapsedMs={rec.elapsedMs} maxMs={maxMs} />
      ) : (
        <Text style={[TYPE.small, { color: palette.ink2 }]}>{hint}</Text>
      )}
      {rec.denied ? (
        <Text accessibilityRole="alert" style={[TYPE.small, { color: palette.ink2 }]}>
          {Platform.OS === 'web' ? t('practice:speak.denied_web') : t('practice:speak.denied')}
        </Text>
      ) : null}
      {problem ? (
        <Text accessibilityRole="alert" style={[TYPE.small, { color: palette.ink2 }]}>
          {problem}
        </Text>
      ) : null}
      <Btn
        busy={sending || rec.phase === 'starting' || rec.phase === 'stopping'}
        onPress={toggle}
        accessibilityHint={`${label}: ${offer.title}`}
      >
        {recording
          ? t('practice:speak.record_stop')
          : sending
            ? t('practice:speak.listening')
            : t('buddy:rehearse.start')}
      </Btn>
    </OfferShell>
  );
}
