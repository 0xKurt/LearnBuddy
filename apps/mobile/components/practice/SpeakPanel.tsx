// Saying a sentence aloud (a 'speak' question). SpeakCard shows the sentence
// large and, once Buddy has listened, the same sentence word by word: words
// that sound right in calm green, words to practise in warm amber and
// underlined (never red), the tips below and one overall line. SpeakPanel is
// the pinned bottom part: "Anhören", "Langsam anhören" and the record button
// (tap to start, tap to stop, 15 s at most). The recording goes to the server,
// whose model listens to it; a failed upload is sent again with the same
// client_turn_id, so it is counted only once.

import type {
  AnswerResponse,
  ItemView,
  PracticeTurnView,
  PronunciationFeedback,
  SpeakStreamEvent,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, Easing, Linking, Platform, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { ApiError, newId } from '../../lib/api/client.js';
import { speakItem } from '../../lib/api/endpoints.js';
import { useOnline } from '../../lib/api/queries.js';
import { WaitAborted } from '../../lib/api/whenOnline.js';
import { messageFor } from '../../lib/errors.js';
import { stop as stopListening } from '../../lib/speech/listen.js';
import { useRecording, type RecordFailure, type Recording } from '../../lib/speech/record.js';
import { formatClock, MAX_RECORDING_MS, type SpeakMime } from '../../lib/speech/voice.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';
import { BottomBar } from './BottomBar.js';
import { ListenButton } from './ListenButton.js';

/** The newest pronunciation feedback among this question's turns, if any. */
export function latestPronunciation(turns: PracticeTurnView[]): PronunciationFeedback | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const p = turns[i]?.pronunciation;
    if (p) return p;
  }
  return null;
}

// ─────────────── the sentence and the feedback ───────────────

function OverallLine({ feedback }: { feedback: PronunciationFeedback }) {
  const { t } = useTranslation('practice');
  const practise = feedback.words.filter((w) => !w.ok).map((w) => w.text);
  const text =
    feedback.overall === 'good'
      ? t('speak.overall.good')
      : feedback.overall === 'almost'
        ? practise.length > 0
          ? t('speak.overall.almost', { words: practise.join(', ') })
          : t('speak.overall.almost_plain')
        : t('speak.overall.retry');
  const good = feedback.overall === 'good';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {good ? <Icon name="check" size={20} color={LB.successText} /> : null}
      <Text
        style={[
          TYPE.body,
          { flexShrink: 1, fontWeight: '600', color: good ? LB.successText : LB.warningText },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function MarkedWords({ feedback }: { feedback: PronunciationFeedback }) {
  const { t } = useTranslation('practice');
  const ok = feedback.words.filter((w) => w.ok).map((w) => w.text);
  const practise = feedback.words.filter((w) => !w.ok).map((w) => w.text);
  const summary = [
    ok.length > 0 ? t('speak.words_ok', { words: ok.join(', ') }) : null,
    practise.length > 0 ? t('speak.words_practise', { words: practise.join(', ') }) : null,
  ]
    .filter((s): s is string => s !== null)
    .join(' ');
  return (
    <View accessible accessibilityLabel={summary} style={{ gap: 6 }}>
      <Text style={[TYPE.title, { fontSize: 24, lineHeight: 36, fontWeight: '500' }]}>
        {feedback.words.map((w, i) => (
          // The space before a word stays outside it: the underline marks only the word.
          <Text key={`${i}-${w.text}`}>
            {i > 0 ? ' ' : ''}
            <Text
              style={
                w.ok
                  ? { color: LB.successText }
                  : {
                      color: LB.warningText,
                      fontWeight: '700',
                      textDecorationLine: 'underline',
                      textDecorationColor: LB.warning,
                    }
              }
            >
              {w.text}
            </Text>
          </Text>
        ))}
      </Text>
      {practise.length > 0 ? (
        <Text style={[TYPE.small, { fontSize: 14 }]}>{t('speak.legend')}</Text>
      ) : null}
    </View>
  );
}

/**
 * The sentence she was asked to say, with the words the model has judged so far in
 * the same colours as the finished feedback; the rest stays plain. Nothing counts as
 * judged here — the stored feedback replaces it (issue #8).
 */
function LiveWords({ prompt, words }: { prompt: string; words: SpeakStreamEvent['words'] }) {
  const parts = prompt.split(/(\s+)/);
  let at = 0;
  return (
    <Text
      accessibilityRole="header"
      style={[TYPE.title, { fontSize: 24, lineHeight: 32, fontWeight: '500' }]}
    >
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <Text key={i}>{part}</Text>;
        const judged = words[at];
        at++;
        if (!judged) return <Text key={i}>{part}</Text>;
        return (
          <Text
            key={i}
            style={
              judged.ok
                ? { color: LB.successText }
                : {
                    color: LB.warningText,
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                    textDecorationColor: LB.warning,
                  }
            }
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

type CardProps = {
  item: ItemView;
  /** This question's turns, oldest first. */
  turns: PracticeTurnView[];
  /**
   * What the model has judged so far, while it is still listening (issue #8): the
   * words colour one by one instead of the sentence sitting still for seconds. It is
   * replaced by the stored feedback as soon as the recording is judged.
   */
  live?: SpeakStreamEvent | null;
};

/** The sentence to say, large; after listening, the word-by-word feedback. */
export function SpeakCard({ item, turns, live }: CardProps) {
  const { t } = useTranslation('practice');
  const feedback = latestPronunciation(turns);
  const tips = feedback?.words.filter((w) => !w.ok && w.tip) ?? [];
  // A new attempt folds the list again; two tips are enough to start with —
  // the full set made the card a text wall over the thread (user feedback).
  const [allTips, setAllTips] = useState(false);
  useEffect(() => setAllTips(false), [turns.length]);
  const shownTips = allTips ? tips : tips.slice(0, 2);

  return (
    <Card tone="lavender" padding={20} radius={22}>
      <View style={{ gap: 12 }}>
        {item.topic ? <Text style={[TYPE.body, { color: LB.ink2 }]}>{item.topic}</Text> : null}
        <Text style={TYPE.label}>{t('speak.instruction')}</Text>
        {feedback && feedback.words.length > 0 ? (
          <MarkedWords feedback={feedback} />
        ) : live && live.words.length > 0 ? (
          <LiveWords prompt={item.prompt} words={live.words} />
        ) : (
          <Text
            accessibilityRole="header"
            style={[TYPE.title, { fontSize: 24, lineHeight: 32, fontWeight: '500' }]}
          >
            {item.prompt}
          </Text>
        )}
        {feedback ? (
          <View
            style={{
              gap: 8,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: LB.hairline,
            }}
          >
            <OverallLine feedback={feedback} />
            {shownTips.map((w, i) => (
              <Text key={`${i}-${w.text}`} style={TYPE.body}>
                {t('speak.tip', { word: w.text, tip: w.tip ?? '' })}
              </Text>
            ))}
            {tips.length > shownTips.length ? (
              <Btn size="sm" variant="ghost" pill onPress={() => setAllTips(true)}>
                {t('speak.more_tips', { count: tips.length - shownTips.length })}
              </Btn>
            ) : null}
            {feedback.heard.trim() ? (
              <Text style={TYPE.small}>{t('speak.heard', { text: feedback.heard.trim() })}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// ─────────────── the pinned controls ───────────────

function RecordingDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  // Reactive: toggling "reduce motion" while the app runs stops the dot too.
  const still = useReducedMotion();

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  return (
    <Animated.View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: LB.primary,
        opacity: still ? 1 : pulse,
      }}
    />
  );
}

type Pending = { clientTurnId: string; itemId: string; mime: SpeakMime; base64: string };

type PanelProps = {
  item: ItemView;
  sessionId: string;
  /** Whether Buddy has already given feedback on this question (the button then says "Nochmal sagen"). */
  hasFeedback: boolean;
  disabled: boolean;
  onResult: (res: AnswerResponse) => void | Promise<void>;
  /** The judgement while it is written, for the card above (issue #8); null when it ends. */
  onProgress?: (event: SpeakStreamEvent | null) => void;
  /** The question closed or the session ended elsewhere: reload it. */
  onOutdated?: () => void;
  /** Move on without speaking (no microphone, not the moment); absent when not allowed. */
  onSkip?: () => void;
};

/** A 4xx (other than "slow down") won't get better by sending the same recording again. */
function retryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.code === 'rate_limited') return true;
  return !(err.status >= 400 && err.status < 500);
}

function outdated(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'conflict' || err.code === 'not_found');
}

export function SpeakPanel({
  item,
  sessionId,
  hasFeedback,
  disabled,
  onResult,
  onProgress,
  onOutdated,
  onSkip,
}: PanelProps) {
  const { t } = useTranslation('practice');
  const [sending, setSending] = useState<'idle' | 'sending' | 'failed'>('idle');
  const [problem, setProblem] = useState<Exclude<RecordFailure, 'denied'> | null>(null);
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  /** Cancels the wait for a connection (nothing has been sent yet while it waits). */
  const waiting = useRef<AbortController | null>(null);
  const online = useOnline();
  const lang = item.lang ?? item.prompt_lang ?? 'en';
  /** The newest callback, so resetting on a new question needs no dependency on it. */
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      waiting.current?.abort();
    };
  }, []);

  // A new question starts clean.
  useEffect(() => {
    waiting.current?.abort();
    pending.current = null;
    setSending('idle');
    setProblem(null);
    progressRef.current?.(null);
  }, [item.id]);

  async function send(): Promise<void> {
    const p = pending.current;
    if (!p) return;
    setSending('sending');
    const controller = new AbortController();
    waiting.current = controller;
    try {
      const res = await speakItem(
        sessionId,
        {
          client_turn_id: p.clientTurnId,
          item_id: p.itemId,
          mime: p.mime,
          audio_base64: p.base64,
        },
        {
          signal: controller.signal,
          ...(onProgress
            ? {
                onProgress: (event: SpeakStreamEvent) => {
                  if (mounted.current) onProgress(event);
                },
              }
            : {}),
        },
      );
      pending.current = null;
      onProgress?.(null);
      // She left the question meanwhile: nothing is shown or read aloud for a screen she left.
      if (!mounted.current) return;
      setSending('idle');
      // The screen reads or announces the feedback (practice/[id].tsx readFeedback).
      await onResult(res);
    } catch (err) {
      onProgress?.(null);
      if (err instanceof WaitAborted) return; // she recorded again or skipped while offline
      if (!mounted.current) return;
      if (outdated(err)) {
        pending.current = null;
        setSending('idle');
        toast.show(messageFor(err), 'error');
        onOutdated?.();
      } else if (retryable(err)) {
        // Kept: "Nochmal senden" sends this very recording with the same id.
        setSending('failed');
      } else {
        pending.current = null;
        setSending('idle');
        toast.show(messageFor(err), 'error');
      }
    }
  }

  const rec = useRecording({
    onRecorded: (r: Recording) => {
      pending.current = { clientTurnId: newId(), itemId: item.id, mime: r.mime, base64: r.base64 };
      void send();
    },
    onFailed: (why) => {
      if (why !== 'denied') setProblem(why);
    },
  });

  const recording = rec.phase === 'recording';
  const busy = sending === 'sending' || rec.phase === 'starting' || rec.phase === 'stopping';
  const locked = disabled || busy || sending === 'failed';

  function toggleRecording(): void {
    if (recording) {
      void rec.stop();
      return;
    }
    setProblem(null);
    stopListening();
    void rec.start();
  }

  function discard(): void {
    waiting.current?.abort();
    pending.current = null;
    setSending('idle');
  }

  /** Offline, the recording waits for the connection; she may drop it or skip meanwhile. */
  const waitingOffline = sending === 'sending' && !online;

  function skipWhileWaiting(): void {
    discard();
    onSkip?.();
  }

  const recordLabel = recording
    ? t('speak.record_stop')
    : hasFeedback
      ? t('speak.record_again')
      : t('speak.record');

  return (
    <BottomBar>
      {rec.denied ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={[TYPE.body, { color: LB.ink2 }]}>
            {Platform.OS === 'web' ? t('speak.denied_web') : t('speak.denied')}
          </Text>
          {Platform.OS !== 'web' ? (
            <Btn variant="soft" onPress={() => void Linking.openSettings()}>
              {t('speak.open_settings')}
            </Btn>
          ) : null}
        </View>
      ) : null}

      {problem && !recording ? (
        <Text accessibilityRole="alert" style={[TYPE.body, { color: LB.ink2 }]}>
          {t(`speak.problem.${problem}`)}
        </Text>
      ) : null}

      {recording ? (
        <View
          accessible
          accessibilityLabel={t('speak.recording_label', {
            time: formatClock(rec.elapsedMs),
            max: formatClock(MAX_RECORDING_MS),
          })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 }}
        >
          <RecordingDot />
          <Text style={[TYPE.body, { fontWeight: '600' }]}>
            {t('speak.recording', {
              time: formatClock(rec.elapsedMs),
              max: formatClock(MAX_RECORDING_MS),
            })}
          </Text>
        </View>
      ) : null}

      {sending === 'sending' && !waitingOffline ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('speak.listening')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 }}
        >
          <ActivityIndicator color={LB.primary} />
          <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('speak.listening')}</Text>
        </View>
      ) : null}

      {waitingOffline ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={[TYPE.body, { color: LB.ink2 }]}>
            {t('speak.waiting_offline')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="ghost" onPress={discard} disabled={disabled}>
              {t('speak.record_new')}
            </Btn>
            {onSkip ? (
              <Btn variant="ghost" onPress={skipWhileWaiting} disabled={disabled}>
                {t('speak.skip')}
              </Btn>
            ) : null}
          </View>
        </View>
      ) : null}

      {sending === 'failed' ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={[TYPE.body, { color: LB.ink2 }]}>
            {t('speak.send_failed')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Btn onPress={() => void send()} disabled={disabled}>
              {t('speak.resend')}
            </Btn>
            <Btn variant="ghost" onPress={discard} disabled={disabled}>
              {t('speak.record_new')}
            </Btn>
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <ListenButton text={item.prompt} lang={lang} disabled={recording || busy} />
        <ListenButton text={item.prompt} lang={lang} slow disabled={recording || busy} />
      </View>

      <Btn
        size="lg"
        full
        variant={recording ? 'soft' : 'primary'}
        onPress={toggleRecording}
        disabled={recording ? false : locked}
        accessibilityLabel={recording ? t('speak.record_stop_label') : t('speak.record_label')}
        accessibilityHint={recording ? undefined : t('speak.record_hint')}
      >
        {recordLabel}
      </Btn>

      {onSkip && !recording && !waitingOffline ? (
        <Btn variant="ghost" center onPress={onSkip} disabled={locked}>
          {t('speak.skip')}
        </Btn>
      ) : null}
    </BottomBar>
  );
}
