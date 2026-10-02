// A rehearsal talk, or reading a text aloud (issue #264, docs/architecture.md §Talks and
// reading aloud). Opened only from Buddy's offer in the conversation (RehearseCard): the offer
// is the one source of the text and the talk — this screen shows it, records, and shows what
// the API measured. Why a screen and not the chat: ten minutes of recording with a running
// clock, and a passage to read from, need the whole phone; everything else (planning the talk,
// talking about the result) stays with Buddy.
//
// One screen, three moments, never on top of each other:
//   ready      — what to do, the text (reading aloud), the big mic;
//   recording  — the clock against the length she was given, the stop button;
//   result     — what was measured, in words: no score, no grade (CLAUDE.md rule 6).
// The recording is sent once and kept on the phone only until the answer is there (a retry
// after a lost connection sends the same one under the same request id); it is never stored
// by the API (docs/privacy.md).

import {
  REHEARSAL_MAX_BASE64,
  type RehearsalBrief,
  type RehearsalView,
} from '@learnbuddy/shared-types/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Screen } from '../components/lb/Screen.js';
import { MicButton, MIC_RING_ROOM } from '../components/voice/MicButton.js';
import type { VoiceInput } from '../components/voice/useVoiceInput.js';
import { ApiError } from '../lib/api/apiError.js';
import { newId } from '../lib/api/client.js';
import { getRehearsal, sendRehearsal } from '../lib/api/endpoints.js';
import { useAnnounce } from '../lib/announce.js';
import { clock, lengthVerdict, wordsToPractise } from '../lib/rehearse/result.js';
import { useRecording, type Recording } from '../lib/speech/record.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { bottomRoom, SPACE } from '../lib/theme/space.js';
import { TYPE } from '../lib/theme/type.js';

type Sent = { recording: Recording; requestId: string };
type Problem = 'no_speech' | 'too_short' | 'denied' | 'failed' | 'offline';

function actionParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export default function RehearseScreen() {
  const { t } = useTranslation(['learn', 'common']);
  const params = useLocalSearchParams<{ action?: string | string[] }>();
  const actionId = actionParam(params.action);
  const brief = useQuery({
    queryKey: ['rehearsal', actionId],
    queryFn: () => getRehearsal(actionId ?? ''),
    enabled: actionId !== null,
    staleTime: Infinity,
  });

  return (
    <Screen back>
      {brief.data ? (
        <Rehearse brief={brief.data} />
      ) : brief.isError || actionId === null ? (
        <View style={{ padding: SPACE.xl, gap: SPACE.lg }}>
          <Text style={TYPE.body}>{t('learn:rehearse.gone')}</Text>
          <Btn variant="outline" onPress={() => router.dismissTo('/buddy')}>
            {t('learn:rehearse.back')}
          </Btn>
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      )}
    </Screen>
  );
}

function Rehearse({ brief }: { brief: RehearsalBrief }) {
  const { palette } = useTheme();
  const { t } = useTranslation(['learn', 'common']);
  const insets = useSafeAreaInsets();
  const talk = brief.kind === 'talk';
  const [sent, setSent] = useState<Sent | null>(null);
  const [sending, setSending] = useState(false);
  // Kept in the query cache, not only in this component: a theme switch remounts the screen,
  // and what was measured must not vanish with it.
  const cache = useQueryClient();
  const [result, setResultState] = useState<RehearsalView | null>(
    () => cache.getQueryData<RehearsalView>(['rehearsal-result', brief.action_id]) ?? null,
  );
  const setResult = useCallback(
    (r: RehearsalView | null) => {
      cache.setQueryData(['rehearsal-result', brief.action_id], r);
      setResultState(r);
    },
    [cache, brief.action_id],
  );
  const [problem, setProblem] = useState<Problem | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const send = useCallback(
    async (s: Sent) => {
      setSending(true);
      setProblem(null);
      try {
        const r = await sendRehearsal({
          client_request_id: s.requestId,
          action_id: brief.action_id,
          mime: s.recording.mime,
          audio_base64: s.recording.base64,
          duration_ms: Math.max(3_000, Math.round(s.recording.durationMs)),
        });
        if (!live.current) return;
        setResult(r);
        setSent(null);
      } catch (err) {
        if (!live.current) return;
        const noSpeech = err instanceof ApiError && err.reason === 'no_speech';
        setProblem(noSpeech ? 'no_speech' : err instanceof ApiError ? 'failed' : 'offline');
        // Nothing heard is nothing to send again; anything else keeps the recording for "Nochmal senden".
        if (noSpeech) setSent(null);
      } finally {
        if (live.current) setSending(false);
      }
    },
    [brief.action_id, setResult],
  );

  const rec = useRecording({
    maxMs: brief.max_s * 1000,
    long: { maxBase64: REHEARSAL_MAX_BASE64 },
    onRecorded: (recording) => {
      const s = { recording, requestId: newId() };
      setSent(s);
      void send(s);
    },
    onFailed: (why) =>
      setProblem(why === 'too_short' ? 'too_short' : why === 'denied' ? 'denied' : 'failed'),
  });

  // The mic button speaks the recorder's language; this screen's recorder is a plain one.
  const voice: VoiceInput = {
    state:
      rec.phase === 'starting'
        ? 'starting'
        : rec.phase === 'recording'
          ? 'recording'
          : rec.phase === 'stopping' || sending
            ? 'transcribing'
            : 'idle',
    onDevice: false,
    elapsedMs: rec.elapsedMs,
    maxMs: rec.maxMs,
    level: rec.level,
    live: '',
    hint: null,
    denied: rec.denied,
    toggle: () => {
      if (rec.phase === 'recording') void rec.stop();
      else if (rec.phase === 'idle') {
        setProblem(null);
        setResult(null);
        void rec.start();
      }
    },
    cancel: () => void rec.cancel(),
  };

  const recording = rec.phase === 'recording';
  const target = brief.minutes ? brief.minutes * 60 : null;
  const status = sending
    ? t('learn:rehearse.listening_back')
    : recording
      ? t(talk ? 'learn:rehearse.recording_talk' : 'learn:rehearse.recording_read')
      : problem
        ? t(`learn:rehearse.problem.${problem}`)
        : null;
  useAnnounce(status);

  if (result) return <Result result={result} onAgain={() => setResult(null)} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm, gap: SPACE.xs }}>
        <Text accessibilityRole="header" style={TYPE.displaySm} numberOfLines={1}>
          {t(talk ? 'learn:rehearse.title_talk' : 'learn:rehearse.title_read')}
        </Text>
        <Text style={[TYPE.body, { color: palette.ink2 }]} numberOfLines={2}>
          {talk
            ? target
              ? t('learn:rehearse.intro_talk_minutes', {
                  title: brief.title,
                  minutes: brief.minutes,
                })
              : t('learn:rehearse.intro_talk', { title: brief.title })
            : t('learn:rehearse.intro_read')}
        </Text>
      </View>

      {/* The text to read is the one thing that may scroll here: she reads from it. */}
      <View
        style={{
          // The passage takes the room it needs to be read from; the talk's short card does
          // not, and the mic then sits in the middle of what is left — no dead band (#264).
          flex: brief.text ? 1 : 0,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.lg,
        }}
      >
        {brief.text ? (
          <Card padding={0} radius={20}>
            {/* She reads FROM this text, like a list she browses: the one area that may
                scroll here (tests/web/fit.ts allows scroll-list). */}
            <ScrollView
              testID="scroll-list"
              contentContainerStyle={{ padding: SPACE.lg }}
              style={{ maxHeight: '100%' }}
              accessibilityLabel={t('learn:rehearse.text_label')}
            >
              <Text style={[TYPE.prompt, { fontWeight: '400', lineHeight: 30 }]} selectable>
                {brief.text}
              </Text>
            </ScrollView>
          </Card>
        ) : (
          <Card tone="primaryLt" radius={20}>
            <View style={{ gap: SPACE.sm }}>
              <Text style={[TYPE.label, { color: palette.primaryDk }]}>
                {t('learn:rehearse.what_i_measure').toUpperCase()}
              </Text>
              {(['measure_time', 'measure_pace', 'measure_parts'] as const).map((k) => (
                <Text key={k} style={TYPE.body}>
                  {t(`learn:rehearse.${k}`)}
                </Text>
              ))}
            </View>
          </Card>
        )}
      </View>

      <View
        style={{
          flex: brief.text ? 0 : 1,
          justifyContent: 'center',
          alignItems: 'center',
          gap: SPACE.md,
          paddingTop: SPACE.lg + MIC_RING_ROOM,
          paddingBottom: bottomRoom(insets.bottom, SPACE.lg),
        }}
      >
        <Text accessibilityRole="timer" style={[TYPE.display, { fontVariant: ['tabular-nums'] }]}>
          {clock(rec.elapsedMs / 1000)}
          <Text style={[TYPE.title, { color: palette.ink2 }]}>
            {' / '}
            {clock(target ?? brief.max_s)}
          </Text>
        </Text>
        <MicButton
          voice={voice}
          size="lg"
          label={t(talk ? 'learn:rehearse.start_talk' : 'learn:rehearse.start_read')}
        />
        <View style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACE.xl }}>
          {status ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[TYPE.small, { textAlign: 'center' }]}
              numberOfLines={2}
            >
              {status}
            </Text>
          ) : (
            <Text style={[TYPE.small, { textAlign: 'center' }]} numberOfLines={2}>
              {t(talk ? 'learn:rehearse.hint_talk' : 'learn:rehearse.hint_read')}
            </Text>
          )}
          {problem && sent && !sending ? (
            <Btn size="sm" variant="soft" onPress={() => void send(sent)}>
              {t('learn:rehearse.send_again')}
            </Btn>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** One measured line: what it is, and the value in words. */
function Row({ label, value, note }: { label: string; value: string; note?: string | null }) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${note ? `. ${note}` : ''}`}
      style={{ gap: 2 }}
    >
      <Text style={[TYPE.label, { color: palette.ink2 }]}>{label.toUpperCase()}</Text>
      <Text style={TYPE.title}>{value}</Text>
      {note ? <Text style={TYPE.small}>{note}</Text> : null}
    </View>
  );
}

function Result({ result, onAgain }: { result: RehearsalView; onAgain: () => void }) {
  const { palette } = useTheme();
  const { t } = useTranslation(['learn', 'common']);
  const insets = useSafeAreaInsets();
  const talk = result.kind === 'talk';
  const verdict = lengthVerdict(result.duration_s, result.target_s);
  const practise = wordsToPractise(result);
  useAnnounce(t('learn:rehearse.done_title'));
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm, gap: SPACE.xs }}>
        <Text accessibilityRole="header" style={TYPE.displaySm} numberOfLines={1}>
          {t('learn:rehearse.done_title')}
        </Text>
        <Text style={[TYPE.body, { color: palette.ink2 }]} numberOfLines={2}>
          {t(talk ? 'learn:rehearse.done_talk' : 'learn:rehearse.done_read')}
        </Text>
      </View>
      <View style={{ flex: 1, paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg }}>
        <Card radius={20}>
          <View style={{ gap: SPACE.lg }}>
            <Row
              label={t('learn:rehearse.duration')}
              value={
                result.target_s
                  ? t('learn:rehearse.duration_of', {
                      time: clock(result.duration_s),
                      target: clock(result.target_s),
                    })
                  : clock(result.duration_s)
              }
              note={verdict ? t(`learn:rehearse.length_${verdict}`) : null}
            />
            <Row
              label={t('learn:rehearse.pace')}
              value={t('learn:rehearse.pace_value', { count: result.words_per_minute })}
              note={talk ? null : t('learn:rehearse.pace_note_read')}
            />
            {talk && result.fillers !== null ? (
              <Row
                label={t('learn:rehearse.fillers')}
                value={String(result.fillers)}
                note={t('learn:rehearse.fillers_note')}
              />
            ) : null}
            {talk && result.structure ? (
              <View style={{ gap: SPACE.xs }}>
                <Text style={[TYPE.label, { color: palette.ink2 }]}>
                  {t('learn:rehearse.parts').toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
                  {result.structure.map((p) => (
                    <View
                      key={p.part}
                      accessible
                      accessibilityLabel={`${t(`learn:rehearse.part.${p.part}`)}: ${t(`learn:rehearse.part_status.${p.status}`)}`}
                      style={{
                        flex: 1,
                        minWidth: 90,
                        borderRadius: 14,
                        paddingVertical: SPACE.sm,
                        paddingHorizontal: SPACE.md,
                        backgroundColor: p.status === 'heard' ? palette.primaryLt : palette.bg,
                        gap: 2,
                      }}
                    >
                      <Text style={[TYPE.caption, { color: palette.ink }]} numberOfLines={1}>
                        {t(`learn:rehearse.part.${p.part}`)}
                      </Text>
                      <Text
                        style={[
                          TYPE.label,
                          { color: p.status === 'heard' ? palette.primaryDk : palette.ink2 },
                        ]}
                        numberOfLines={1}
                      >
                        {t(`learn:rehearse.part_status.${p.status}`)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {!talk ? (
              <Row
                label={t('learn:rehearse.words')}
                value={
                  practise.length === 0
                    ? t('learn:rehearse.words_none')
                    : practise.slice(0, 8).join(' · ')
                }
                note={practise.length > 0 ? t('learn:rehearse.words_note') : null}
              />
            ) : null}
          </View>
        </Card>
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: SPACE.md,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.lg,
          paddingBottom: bottomRoom(insets.bottom, SPACE.lg),
        }}
      >
        <View style={{ flex: 1 }}>
          <Btn full variant="outline" onPress={onAgain}>
            {t('learn:rehearse.again')}
          </Btn>
        </View>
        <View style={{ flex: 1 }}>
          <Btn full onPress={() => router.dismissTo('/buddy')}>
            {t('learn:rehearse.finish')}
          </Btn>
        </View>
      </View>
    </View>
  );
}
