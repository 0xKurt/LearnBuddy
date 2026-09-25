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
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  Text,
  View,
} from 'react-native';

import { ApiError, newId } from '../../lib/api/client.js';
import { speakItem } from '../../lib/api/endpoints.js';
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
          <Text
            key={`${i}-${w.text}`}
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
            {i > 0 ? ' ' : ''}
            {w.text}
          </Text>
        ))}
      </Text>
      {practise.length > 0 ? (
        <Text style={[TYPE.small, { fontSize: 14 }]}>{t('speak.legend')}</Text>
      ) : null}
    </View>
  );
}

type CardProps = {
  item: ItemView;
  /** This question's turns, oldest first. */
  turns: PracticeTurnView[];
};

/** The sentence to say, large; after listening, the word-by-word feedback. */
export function SpeakCard({ item, turns }: CardProps) {
  const { t } = useTranslation('practice');
  const feedback = latestPronunciation(turns);
  const tips = feedback?.words.filter((w) => !w.ok && w.tip) ?? [];

  return (
    <Card tone="lavender" padding={20} radius={22}>
      <View style={{ gap: 12 }}>
        {item.topic ? <Text style={[TYPE.body, { color: LB.ink2 }]}>{item.topic}</Text> : null}
        <Text style={TYPE.label}>{t('speak.instruction')}</Text>
        {feedback && feedback.words.length > 0 ? (
          <MarkedWords feedback={feedback} />
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
            {tips.map((w, i) => (
              <Text key={`${i}-${w.text}`} style={TYPE.body}>
                {t('speak.tip', { word: w.text, tip: w.tip ?? '' })}
              </Text>
            ))}
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
  const [still, setStill] = useState(false);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          setStill(true);
          return;
        }
        loop = Animated.loop(
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
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

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
  onOutdated,
  onSkip,
}: PanelProps) {
  const { t } = useTranslation('practice');
  const [sending, setSending] = useState<'idle' | 'sending' | 'failed'>('idle');
  const [problem, setProblem] = useState<Exclude<RecordFailure, 'denied'> | null>(null);
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  const lang = item.lang ?? item.prompt_lang ?? 'en';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A new question starts clean.
  useEffect(() => {
    pending.current = null;
    setSending('idle');
    setProblem(null);
  }, [item.id]);

  async function send(): Promise<void> {
    const p = pending.current;
    if (!p) return;
    setSending('sending');
    try {
      const res = await speakItem(sessionId, {
        client_turn_id: p.clientTurnId,
        item_id: p.itemId,
        mime: p.mime,
        audio_base64: p.base64,
      });
      pending.current = null;
      if (mounted.current) setSending('idle');
      await onResult(res);
      AccessibilityInfo.announceForAccessibility(res.reply.text);
    } catch (err) {
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
    pending.current = null;
    setSending('idle');
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

      {sending === 'sending' ? (
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

      {onSkip && !recording ? (
        <Btn variant="ghost" center onPress={onSkip} disabled={locked}>
          {t('speak.skip')}
        </Btn>
      ) : null}
    </BottomBar>
  );
}
