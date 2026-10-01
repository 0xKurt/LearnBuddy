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
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { toast } from '../lb/Toast.js';
import { dropped, reacted, tapped } from '../../lib/perf.js';
import { BottomBar } from './BottomBar.js';
import { ListenButton } from './ListenButton.js';
import { WordSheet, type SpokenWord } from './WordSheet.js';

/** The newest pronunciation feedback among this question's turns, if any. */
export function latestPronunciation(turns: PracticeTurnView[]): PronunciationFeedback | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const p = turns[i]?.pronunciation;
    if (p) return p;
  }
  return null;
}

// ─────────────── the sentence and the feedback ───────────────

function MarkedWords({
  feedback,
  onWord,
}: {
  feedback: PronunciationFeedback;
  /** A word she taps: it opens on its own to listen to and to try again (issue #83). */
  onWord?: (word: PronunciationFeedback['words'][number]) => void;
}) {
  const { palette } = useTheme();
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
    <View accessible={!onWord} accessibilityLabel={onWord ? undefined : summary} style={{ gap: 6 }}>
      <Text style={[TYPE.title, { fontSize: 24, lineHeight: 36, fontWeight: '500' }]}>
        {feedback.words.map((w, i) => (
          // The space before a word stays outside it: the underline marks only the word.
          <Text key={`${i}-${w.text}`}>
            {i > 0 ? ' ' : ''}
            <Text
              {...(onWord
                ? {
                    accessibilityRole: 'button' as const,
                    accessibilityLabel: t('speak.word_open', { word: w.text }),
                    onPress: () => onWord(w),
                  }
                : {})}
              style={
                w.ok
                  ? { color: palette.successText }
                  : {
                      color: palette.warningText,
                      fontWeight: '700',
                      textDecorationLine: 'underline',
                      textDecorationColor: palette.warning,
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
  const { palette } = useTheme();
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
                ? { color: palette.successText }
                : {
                    color: palette.warningText,
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                    textDecorationColor: palette.warning,
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
  /** The running session: only with it can one word be practised on its own (issue #83). */
  sessionId?: string;
};

/** The sentence to say, large; after listening, the word-by-word feedback. */
/**
 * The sentence she is to say — and, once it was judged, the same sentence with its words
 * marked. Nothing else (issue #14): the words, the tips and what was heard used to stand
 * here *and* in the thread, and the card grew into a text wall above the conversation.
 * The words now carry the judgement visually; the sentences about it belong to Buddy's
 * reply in the thread (PronunciationNote, ItemThread).
 */
export function SpeakCard({ item, turns, live, sessionId }: CardProps) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const feedback = latestPronunciation(turns);
  /** The word she tapped, to hear and try on its own (issue #83). */
  const [word, setWord] = useState<SpokenWord | null>(null);

  return (
    <Card tone="lavender" padding={20} radius={22}>
      <View style={{ gap: 12 }}>
        {item.topic ? <Text style={[TYPE.body, { color: palette.ink2 }]}>{item.topic}</Text> : null}
        <Text style={TYPE.label}>{t('speak.instruction')}</Text>
        {sessionId && item.lang ? (
          <WordSheet
            word={word}
            sessionId={sessionId}
            itemId={item.id}
            lang={item.lang}
            onClose={() => setWord(null)}
          />
        ) : null}
        {feedback && feedback.words.length > 0 ? (
          <MarkedWords
            feedback={feedback}
            {...(sessionId && item.lang ? { onWord: setWord } : {})}
          />
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
      </View>
    </Card>
  );
}

/**
 * What the judgement says, under Buddy's reply in the thread (issue #14): the verdict in
 * one line, the words worth practising with their tip, and — quietly — what was heard.
 * The thread may scroll; the card above it may not.
 */
export function PronunciationNote({ feedback }: { feedback: PronunciationFeedback }) {
  const { t } = useTranslation('practice');
  const tips = feedback.words.filter((w) => !w.ok && w.tip);
  // No verdict line here: the words are marked in the card, the chip under her own turn
  // says "Fast", and Buddy's bubble says it in his words. Three times was two too many.
  return (
    <View style={{ gap: 6, paddingLeft: 4, maxWidth: '86%' }}>
      {tips.map((w, i) => (
        <Text key={`${i}-${w.text}`} style={TYPE.body}>
          {t('speak.tip', { word: w.text, tip: w.tip ?? '' })}
        </Text>
      ))}
      {feedback.heard.trim() ? (
        <Text style={TYPE.small}>{t('speak.heard', { text: feedback.heard.trim() })}</Text>
      ) : null}
    </View>
  );
}

// ─────────────── the pinned controls ───────────────

function RecordingDot() {
  const { palette } = useTheme();
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
        backgroundColor: palette.primary,
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
  const { palette } = useTheme();
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
      reacted('speak_wait');
      // The screen reads or announces the feedback (practice/[id].tsx readFeedback).
      await onResult(res);
      reacted('speak_total');
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
      // Closing the file and turning it into base64 happens before the first byte moves.
      reacted('speak_finish');
      pending.current = { clientTurnId: newId(), itemId: item.id, mime: r.mime, base64: r.base64 };
      tapped('speak_wait');
      void send();
    },
    onFailed: (why) => {
      // Nothing she can see came of it: the marks are forgotten, so her next attempt is
      // not measured from this one (lib/perf.ts).
      dropped('speak_finish');
      dropped('speak_wait');
      dropped('speak_total');
      if (why !== 'denied') setProblem(why);
    },
  });

  const recording = rec.phase === 'recording';
  const busy = sending === 'sending' || rec.phase === 'starting' || rec.phase === 'stopping';
  const locked = disabled || busy || sending === 'failed';

  function toggleRecording(): void {
    if (recording) {
      // Four numbers the device alone can give (issue #169): her finger leaves the button
      // → the recording is closed → the answer is on screen. Server-side we only ever saw
      // the middle. 'speak_finish' is the app's own share before anything leaves the
      // phone; 'speak_total' is what she actually waits.
      tapped('speak_finish');
      tapped('speak_total');
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

  // One status row, never a stack (issue #14): what is true right now replaces what was
  // true before — a microphone that was refused, the running recording, Buddy listening,
  // a recording waiting for a connection, a send that failed, or a quiet hint.
  const status = rec.denied ? (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
        {Platform.OS === 'web' ? t('speak.denied_web') : t('speak.denied')}
      </Text>
      {Platform.OS !== 'web' ? (
        <Btn variant="soft" onPress={() => void Linking.openSettings()}>
          {t('speak.open_settings')}
        </Btn>
      ) : null}
    </View>
  ) : recording ? (
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
  ) : waitingOffline ? (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
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
  ) : sending === 'sending' ? (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('speak.listening')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 }}
    >
      <ActivityIndicator color={palette.primary} />
      <Text style={[TYPE.body, { color: palette.ink2 }]}>{t('speak.listening')}</Text>
    </View>
  ) : sending === 'failed' ? (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
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
  ) : problem ? (
    <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
      {t(`speak.problem.${problem}`)}
    </Text>
  ) : null;

  return (
    <BottomBar>
      {status}

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
