// Buddy offered a rehearsal of her talk, or reading a text aloud (issue #264): one card under his
// message that records her — no new screen (CLAUDE.md rule 16): the conversation carries it like a
// roleplay (#244). It is the thread's one card (`ChatCard`, #599) with the design's parts
// (components/practice/Modes.jsx:33–50): the tile, what it is, the talk's title, what to do, and
// one button. While it records, the card shows the design's live state (`RehearseLive`): the
// running time large, the length she was given beside "ich höre zu", and "Fertig" as the paper
// button. The large orb of that state is not drawn here: in the chat Buddy stands in the head,
// and listens there while the card records (`useThreadRecording`).
// The recording goes to the server once, is measured there and kept nowhere; the result arrives
// in the thread as Buddy's message (`RehearsalResult`).
//
// The microphone is only on while she has tapped it on, on this card she is looking at — the same
// rule as everywhere a recording runs (lib/speech/record.ts).

import {
  REHEARSAL_MAX_BASE64,
  REHEARSAL_MAX_MS,
  type ActionSummary,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { newId } from '../../lib/api/client.js';
import { sendRehearsal } from '../../lib/api/endpoints.js';
import { setHome } from '../../lib/api/queries.js';
import { useThreadRecording } from '../../lib/buddy/headState.js';
import { sentDuration } from '../../lib/buddy/rehearsal.js';
import { messageFor } from '../../lib/errors.js';
import { useRecording, type Recording } from '../../lib/speech/record.js';
import { formatClock } from '../../lib/speech/voice.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useMounted } from '../../lib/useMounted.js';
import { ChatCard } from './ChatCard.js';
import { quietVariant, type Quiet } from './extensions.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

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

  const rec = useRecording({
    maxMs,
    long: { maxBase64: REHEARSAL_MAX_BASE64 },
    onRecorded: (r) => void send(r),
    onFailed: (why) => {
      if (why !== 'denied') setProblem(t(`practice:speak.problem.${why}`));
    },
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
  const trouble = rec.denied
    ? t(Platform.OS === 'web' ? 'practice:speak.denied_web' : 'practice:speak.denied')
    : problem;
  const time = formatClock(rec.elapsedMs);
  const max = formatClock(maxMs);

  return (
    <ChatCard
      mode="mint"
      icon={offer.kind === 'talk' ? 'mic' : 'book'}
      label={label}
      title={offer.title}
      titleLines={2}
      // While it records the card says what is happening, not what to do.
      detail={recording ? null : hint}
      primary={{
        label: recording
          ? t('practice:speak.record_stop')
          : sending
            ? t('practice:speak.listening')
            : t('buddy:rehearse.start'),
        // "Fertig" is the paper button of the live state (Modes.jsx:47).
        variant: recording ? 'secondary' : quietVariant(quiet),
        busy: sending || rec.phase === 'starting' || rec.phase === 'stopping',
        // As wide as its words, with the microphone before them (Modes.jsx:37).
        fit: true,
        ...(recording ? {} : { icon: 'mic' as const }),
        onPress: toggle,
        accessibilityHint: `${label}: ${offer.title}`,
      }}
    >
      {/* The passage stands whole: she reads it from here while the card records. */}
      {offer.kind === 'read_aloud' && offer.text ? (
        <Text testID="rehearse-text" style={TYPE.body}>
          {offer.text}
        </Text>
      ) : null}
      {recording ? (
        <View
          testID="rehearse-live"
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('practice:speak.recording_label', { time, max })}
          style={{ alignItems: 'center', gap: SPACE.sm }}
        >
          <Text style={[TYPE.questionMedium, { fontVariant: ['tabular-nums'] }]}>{time}</Text>
          <Text style={TYPE.meta}>
            {offer.minutes !== null
              ? t('buddy:rehearse.live_target', {
                  target: formatClock(offer.minutes * 60_000),
                })
              : t('buddy:rehearse.live', { max })}
          </Text>
        </View>
      ) : null}
      {trouble ? (
        <Text accessibilityRole="alert" style={TYPE.meta}>
          {trouble}
        </Text>
      ) : null}
    </ChatCard>
  );
}
