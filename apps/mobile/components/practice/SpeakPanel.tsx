// Saying a sentence aloud (a 'speak' question; design ui_kits/app/Flows.jsx:98–129). SpeakCard is
// the question card: one meta line, the sentence large and, once Buddy has listened, the same
// sentence with only the words to practise underlined in the "wrong" text colour (never the
// whole sentence coloured); what the underline means stands as a quiet hint under the card.
// SpeakPanel is the pinned bottom part: the chips above (hearing the sentence, slower, the way
// past it) and the one large primary — "Sprechen", then "Fertig" (tap to start, tap to stop,
// 15 s at most). A prepared native checker handles reliable audio locally; the disclosed hybrid fallback
// sends it to the audio gateway. A failed upload is
// sent again with the same client_turn_id, so it is counted only once.
//
// The bar carries TWO shapes, not four (issue #186): one large filled pill — the single leading
// action, which always says what pressing it will do — and chips for everything quiet around it.
// The owner looked at the old bar, with a text link, two outlined boxes, a big filled button
// and a ghost button on it, and wrote "und ich weiss auch nicht wieso das vom design so
// anders ist" (01.10.).

import { PronunciationStatus } from './PronunciationStatus.js';
import type {
  AnswerResponse,
  AudioMime,
  ItemView,
  PracticeTurnView,
  PronunciationFeedback,
  SpeakStreamEvent,
  PronunciationSubmission,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { Linking, Platform, Text, View, type TextStyle } from 'react-native';

import { isOutdated, isRetryable } from '../../lib/api/apiError.js';
import { newId } from '../../lib/api/client.js';
import { speakItem } from '../../lib/api/learningEndpoints.js';
import { useOnline } from '../../lib/api/queries.js';
import { WaitAborted } from '../../lib/api/whenOnline.js';
import { messageFor } from '../../lib/errors.js';
import { signsAround } from '../../lib/practice/spokenWords.js';
import { stop as stopListening } from '../../lib/speech/listen.js';
import { useRecording, type RecordFailure, type Recording } from '../../lib/speech/record.js';
import type { z } from 'zod';
import { useLocalPronunciation } from '../../lib/speech/usePronunciation.js';
import { usePronunciationLab } from '../../lib/speech/pronunciationLab.js';
import { pronunciationSubmission } from '../../lib/speech/pronunciation.js';
import { MAX_RECORDING_MS } from '../../lib/speech/voice.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { PRACTICE } from '../../lib/theme/practice.js';
import { PRACTICE_SCREEN } from '../../lib/theme/practiceScreen.js';
import { QUESTION } from '../../lib/theme/question.js';
import { TYPE } from '../../lib/theme/type.js';
import { useMounted } from '../../lib/useMounted.js';
import { RecordingStatus } from '../voice/RecordingStatus.js';
import { Btn } from '../lb/Btn.js';
import { Chip } from '../lb/Chip.js';
import { QuestionCard } from '../lb/QuestionCard.js';
import { toast } from '../lb/Toast.js';
import { dropped, reacted, tapped } from '../../lib/perf.js';
import { BottomBar } from '../lb/BottomBar.js';
import { PronunciationLab } from './PronunciationLab.js';
import { ListenButton } from './ListenButton.js';
import { Hint } from './Question.js';
import { SpokenWordTargets } from './SpokenWordTargets.js';
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

/**
 * A word to practise: underlined, in the "wrong" text colour (Flows.jsx:109). A word that sounds
 * right stays plain — the underline is the mark, the colour only repeats it.
 */
function useWeak(): TextStyle {
  const { palette } = useTheme();
  return {
    color: palette.danger,
    textDecorationLine: 'underline',
    textDecorationColor: palette.danger,
  };
}

function MarkedWords({
  prompt,
  feedback,
  onWord,
}: {
  /** The sentence as it is written: its signs stand beside the judged words (`signsAround`). */
  prompt: string;
  feedback: PronunciationFeedback;
  /** A word she taps: it opens on its own to listen to and to try again (issue #83). */
  onWord?: (word: PronunciationFeedback['words'][number]) => void;
}) {
  useTheme();
  const weak = useWeak();
  const { t } = useTranslation('practice');
  const signs = signsAround(prompt, feedback.words);
  // A word with the signs at it, which are not part of the mark ("today." — the stop stays plain).
  const written = (w: SpokenWord, i: number) => (
    <>
      {signs[i]?.before}
      <Text style={w.ok || feedback.breakdown?.words[i]?.verdict === 'unsicher' ? null : weak}>
        {w.text}
      </Text>
      {signs[i]?.after}
    </>
  );
  const ok = feedback.words.filter((w) => w.ok).map((w) => w.text);
  const practise = feedback.words
    .filter((w, i) => !w.ok && feedback.breakdown?.words[i]?.verdict !== 'unsicher')
    .map((w) => w.text);
  const summary = [
    ok.length > 0 ? t('speak.words_ok', { words: ok.join(', ') }) : null,
    practise.length > 0 ? t('speak.words_practise', { words: practise.join(', ') }) : null,
  ]
    .filter((s): s is string => s !== null)
    .join(' ');
  if (onWord)
    return (
      <SpokenWordTargets
        words={feedback.words}
        written={written}
        label={(w) => t('speak.word_open', { word: w.text })}
        onWord={onWord}
      />
    );
  return (
    <Text accessible accessibilityLabel={summary} style={TYPE.question}>
      {feedback.words.map((w, i) => (
        <Text key={`${i}-${w.text}`}>
          {i > 0 ? ' ' : ''}
          {written(w, i)}
        </Text>
      ))}
    </Text>
  );
}

/**
 * The sentence she was asked to say, with the words the model has judged so far marked as in
 * the finished feedback; the rest stays plain. Nothing counts as judged here — the stored
 * feedback replaces it (issue #8).
 */
function LiveWords({ prompt, words }: { prompt: string; words: SpeakStreamEvent['words'] }) {
  useTheme();
  const weak = useWeak();
  const parts = prompt.split(/(\s+)/);
  let at = 0;
  return (
    <Text accessibilityRole="header" style={[TYPE.question]}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <Text key={i}>{part}</Text>;
        const judged = words[at];
        at++;
        return (
          <Text key={i} style={judged && !judged.ok && judged.verdict !== 'unsicher' ? weak : null}>
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
  useTheme();
  const { t } = useTranslation('practice');
  const feedback = latestPronunciation(turns);
  /** The word she tapped, to hear and try on its own (issue #83). */
  const [word, setWord] = useState<SpokenWord | null>(null);
  const marked = feedback !== null && feedback.words.length > 0;

  useEffect(() => {
    if (__DEV__) usePronunciationLab.setState({ plan: item.pronunciation_plan ?? null });
  }, [item.pronunciation_plan]);
  return (
    <>
      {__DEV__ ? <PronunciationLab /> : null}
      {/* One meta line (Flows.jsx:108, "Sprechen · sag es laut"): what it is about, where the
          question names it, and what to do. */}
      <QuestionCard
        meta={item.topic ? t('speak.meta_topic', { topic: item.topic }) : t('speak.instruction')}
      >
        {sessionId && item.lang ? (
          <WordSheet
            word={word}
            sessionId={sessionId}
            itemId={item.id}
            lang={item.lang}
            plan={item.pronunciation_plan ?? null}
            onClose={() => setWord(null)}
          />
        ) : null}
        {marked ? (
          <MarkedWords
            prompt={item.prompt}
            feedback={feedback}
            {...(sessionId && item.lang ? { onWord: setWord } : {})}
          />
        ) : live && live.words.length > 0 ? (
          <LiveWords prompt={item.prompt} words={live.words} />
        ) : (
          <Text accessibilityRole="header" style={[TYPE.question]}>
            {item.prompt}
          </Text>
        )}
      </QuestionCard>
      {/* What the underline means: a quiet hint under the card, not in it (Flows.jsx:115). */}
      {marked &&
      feedback.words.some(
        (w, i) => !w.ok && feedback.breakdown?.words[i]?.verdict !== 'unsicher',
      ) ? (
        <View style={{ marginTop: QUESTION.hintGap }}>
          <Hint testID="speak-legend">{t('speak.legend')}</Hint>
        </View>
      ) : null}
    </>
  );
}

/**
 * What the judgement says, under Buddy's reply in the thread (issue #14): the verdict in
 * one line, the words worth practising with their tip, and — quietly — what was heard.
 * The thread may scroll; the card above it may not.
 */
export function PronunciationNote({ feedback }: { feedback: PronunciationFeedback }) {
  useTheme();
  const { t } = useTranslation('practice');
  const tips = feedback.words.filter((w) => !w.ok && w.tip);
  // No verdict line here: the words are marked in the card, the chip under her own turn
  // says "Fast", and Buddy's bubble says it in his words. Three times was two too many.
  return (
    <View style={{ gap: PRACTICE.speechNoteGap }}>
      {feedback.breakdown?.overall === 'unsicher' ? (
        <Text style={TYPE.meta}>{t('speak.uncertain')}</Text>
      ) : null}
      {tips.map((w, i) => (
        <Text key={`${i}-${w.text}`} style={TYPE.body}>
          {t('speak.tip', { word: w.text, tip: w.tip ?? '' })}
        </Text>
      ))}
      {feedback.heard.trim() ? (
        <Text style={TYPE.meta}>{t('speak.heard', { text: feedback.heard.trim() })}</Text>
      ) : null}
    </View>
  );
}

// ─────────────── the pinned controls ───────────────

type Pending = {
  clientTurnId: string;
  itemId: string;
  mime: AudioMime;
  base64: string;
  local: boolean;
  submission?: z.infer<typeof PronunciationSubmission>;
};

/**
 * What the speaking task is doing with her voice right now (null: nothing), for the screen's
 * head: its orb listens, then thinks (design ui_kits/app/Flows.jsx `Speak`). One panel is on
 * screen at a time; it says so here and takes it back when it goes.
 */
export const useSpeakPhase = create<{ phase: 'hearing' | 'judging' | null }>(() => ({
  phase: null,
}));

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
  const mounted = useMounted();
  /** Cancels the wait for a connection (nothing has been sent yet while it waits). */
  const waiting = useRef<AbortController | null>(null);
  const online = useOnline();
  const lang = item.lang ?? item.prompt_lang ?? 'en';
  const { local, pack } = useLocalPronunciation(item.pronunciation_plan?.language);
  const recordedLocally = useRef(false);
  /** The newest callback, so resetting on a new question needs no dependency on it. */
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => () => waiting.current?.abort(), []);

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
      p.submission ??= await pronunciationSubmission(
        item,
        { mime: p.mime, audio_base64: p.base64 },
        p.local,
        controller.signal,
      );
      if (p.submission.evidence) p.base64 = '';
      const res = await speakItem(
        sessionId,
        {
          client_turn_id: p.clientTurnId,
          item_id: p.itemId,
          ...p.submission,
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
      if (isOutdated(err)) {
        pending.current = null;
        setSending('idle');
        toast.show(messageFor(err), 'error');
        onOutdated?.();
      } else if (isRetryable(err)) {
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
      pending.current = {
        clientTurnId: newId(),
        itemId: item.id,
        mime: r.mime,
        base64: r.base64,
        local: recordedLocally.current,
      };
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
  const phase = recording ? 'hearing' : sending === 'sending' ? 'judging' : null;
  useEffect(() => {
    useSpeakPhase.setState({ phase });
    return () => useSpeakPhase.setState({ phase: null });
  }, [phase]);
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
    recordedLocally.current = local;
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

  const micRefused = rec.denied && Platform.OS !== 'web';

  /**
   * What the one big control does right now — and it is always the thing to do next
   * (issues #185, #186): without a microphone it opens the settings, while recording it
   * finishes the recording, with a recording that did not arrive it sends that one again,
   * otherwise it starts recording. Nothing else in this bar is ever filled, so there is
   * never a second thing competing for her eye.
   */
  const lead = micRefused
    ? 'settings'
    : recording
      ? 'stop'
      : sending === 'failed'
        ? 'resend'
        : sending === 'sending' && !waitingOffline
          ? 'judging'
          : 'record';

  const leadText =
    lead === 'settings'
      ? t('speak.open_settings')
      : lead === 'stop'
        ? t('speak.record_stop')
        : lead === 'resend'
          ? t('speak.resend')
          : lead === 'judging'
            ? t('speak.listening')
            : hasFeedback
              ? t('speak.record_again')
              : t('speak.record');

  // One status row, never a stack (issue #14): what is true right now replaces what was
  // true before — a microphone that was refused, the running recording, Buddy listening,
  // a recording waiting for a connection, a send that failed, or a quiet hint.
  // A refused microphone used to explain itself here and offer its own button — three
  // rows above the one she actually pressed, with two "Anhören" buttons in between, while
  // "Sprechen" sat there looking as inviting as ever. The owner pressed it and wrote "der
  // sprechen button funktioniert nicht. kp wieso" (01.10., issue #185). The sentence stays;
  // the button is gone, because the big one below says it now.
  //
  // What a row like this still needs — dropping a recording, skipping while it waits — are
  // the same small ghost pills as the rest of the quiet controls (issue #186). "Nochmal
  // senden" is not among them: it is the leading action while a send has failed, so it
  // stands in the big control below rather than as a second filled button up here.
  const status = rec.denied ? (
    <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
      {Platform.OS === 'web' ? t('speak.denied_web') : t('speak.denied')}
    </Text>
  ) : recording ? (
    <RecordingStatus elapsedMs={rec.elapsedMs} maxMs={MAX_RECORDING_MS} />
  ) : waitingOffline ? (
    <View style={{ gap: SPACE.sm }}>
      <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
        {t('speak.waiting_offline')}
      </Text>
      <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <Btn size="sm" pill variant="ghost" onPress={discard} disabled={disabled}>
          {t('speak.record_new')}
        </Btn>
        {onSkip ? (
          <Btn size="sm" pill variant="ghost" onPress={skipWhileWaiting} disabled={disabled}>
            {t('skip')}
          </Btn>
        ) : null}
      </View>
    </View>
  ) : sending === 'failed' ? (
    <View style={{ gap: SPACE.sm }}>
      <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
        {t('speak.send_failed')}
      </Text>
      {/* Sending it again is the big control below ("Nochmal senden"); letting go of this
          recording is the quiet alternative. */}
      <Btn size="sm" pill variant="ghost" onPress={discard} disabled={disabled}>
        {t('speak.record_new')}
      </Btn>
    </View>
  ) : problem ? (
    <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
      {t(`speak.problem.${problem}`)}
    </Text>
  ) : (
    <PronunciationStatus local={local} pack={pack} />
  );

  return (
    <BottomBar>
      {status}

      {/* The quiet controls stand above the primary as one row of chips (Flows.jsx:119–121):
          hearing the sentence is ONE thing with a slower variant (`ListenButton` decides that,
          once, issue #186), and beside it the way past this sentence — the only one: for a
          sentence she is to SAY there is no solution to show, so the screen's "Lösung zeigen"
          chip (the same `reveal` call under another name) is not offered next to it
          (app/practice/[id].tsx). */}
      <View
        testID="speak-chips"
        style={[{ flexDirection: 'row', flexWrap: 'wrap' }, PRACTICE_SCREEN.chipRow]}
      >
        <ListenButton source={{ text: item.prompt, lang }} slow disabled={recording || busy} />
        {onSkip && !recording && !waitingOffline ? (
          <Chip onPress={onSkip} disabled={locked}>
            {t('skip')}
          </Chip>
        ) : null}
      </View>

      {/* The one leading action: the only filled thing in the bar, and it always says what
          pressing it will do — "Sprechen", "Fertig" while she speaks, and while Buddy listens
          it waits and says so (Flows.jsx:122–124). Without the microphone that is "open the
          settings", not "speak" — a button that cannot do its job must not keep offering it
          (issue #185). */}
      <Btn
        size="lg"
        full
        pill
        variant="primary"
        {...(lead === 'stop'
          ? { icon: 'check' as const }
          : lead === 'record'
            ? { icon: 'mic' as const }
            : {})}
        busy={lead === 'judging'}
        onPress={
          lead === 'settings'
            ? () => void Linking.openSettings()
            : lead === 'resend'
              ? () => void send()
              : toggleRecording
        }
        disabled={lead === 'record' ? locked : lead === 'resend' ? disabled : false}
        accessibilityLabel={
          lead === 'settings'
            ? t('speak.open_settings')
            : lead === 'stop'
              ? t('speak.record_stop_label')
              : lead === 'resend'
                ? t('speak.resend')
                : lead === 'judging'
                  ? t('speak.listening')
                  : t('speak.record_label')
        }
        {...(lead === 'record' ? { accessibilityHint: t('speak.record_hint') } : {})}
      >
        {leadText}
      </Btn>
    </BottomBar>
  );
}
