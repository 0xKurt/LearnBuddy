// Session screen — Doc 05 §session. Real flow.
//
// Flow:
//   1. mount → useQuery startSession (POST /sessions) with material_id or subject_id
//   2. render current item by answer_kind (short / long / numeric / formula
//      / multiple_choice / fill_blank)
//   3. on submit: local eval → if correct, POST /attempts with
//      client_local_verdict='correct' (zero credits); else POST /attempts
//      with the kid's answer for LLM evaluation
//   4. feedback chip with verdict + next_hint (if any); advance on correct
//      or after the user dismisses
//   5. session done → router.replace('/(learner)/result')

import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Btn,
  Card,
  Chip,
  CoachMark,
  ExplainModal,
  FillBlank,
  FunctionPlot,
  LatexText,
  MathInput,
  MathKeyboard,
  SessionTopBar,
  SvgStimulus,
  VoiceButton,
} from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { finishSession, startSession, submitAttempt } from '../../../lib/api/sessions.js';
import { localEvaluate, type EvaluatableItem } from '../../../lib/eval/local.js';
import { useFirstTime } from '../../../lib/onboarding/coach.js';
import { useAppStore } from '../../../lib/store/index.js';
import { LB } from '../../../lib/theme/colors.js';
import type { Item, Locale, SvgStimulus as SvgStimulusData } from '@learnbuddy/shared-types';

export default function SessionScreen() {
  const { t } = useTranslation('session');
  const insets = useSafeAreaInsets();
  const { t: tCoach } = useTranslation('coach');
  const params = useLocalSearchParams<{
    sessionId: string;
    subjectId?: string;
    folderId?: string;
    materialId?: string;
    learnerId?: string;
    testMode?: string;
  }>();
  const learnerId = params.learnerId ?? '';
  const testMode = params.testMode === 'true';

  const sessionQuery = useQuery({
    queryKey: ['session-start', params.sessionId, params.subjectId, params.materialId],
    queryFn: () =>
      startSession(learnerId, {
        subject_id: params.subjectId ?? null,
        folder_id: params.folderId ?? null,
        material_id: params.materialId ?? null,
        test_mode: testMode,
        max_items: 20,
      }),
    enabled: !!learnerId,
  });

  // Learner profile drives two pieces of UX on this screen: preferred answer
  // mode (voice vs text/keyboard) and ui_locale (passed to the ASR engine).
  // The home screen already hydrates this query so it's typically a cache hit.
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const preferredMode = accountQuery.data?.learner?.preferred_answer_mode ?? 'text';
  const uiLocale: Locale = accountQuery.data?.learner?.ui_locale ?? 'de';

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [fillValues, setFillValues] = useState<string[]>([]);
  const [mcSelected, setMcSelected] = useState<number | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ verdict: string; text: string | null } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  const setPendingSession = useAppStore((s) => s.set_pending_session);
  const pendingSession = useAppStore((s) => s.pending_session);
  const idxRestoredRef = useRef(false);

  // Restore progress when re-entering a session that was navigated away from.
  useEffect(() => {
    if (
      !idxRestoredRef.current &&
      sessionQuery.data &&
      pendingSession?.session_id === sessionQuery.data.session_id &&
      pendingSession.idx > 0
    ) {
      setIdx(pendingSession.idx);
      idxRestoredRef.current = true;
    }
  }, [sessionQuery.data?.session_id]);

  // Diagram coach mark (USER-FLOWS-DEEP §10.4): trigger the moment the
  // learner first lands on a diagram_label item. The current item-kind is
  // derived from the session payload below; hook is declared up here so it
  // runs unconditionally regardless of the loading branches further down.
  const currentItemKind = sessionQuery.data?.items[idx]?.answer_kind ?? null;
  const diagramCoach = useFirstTime('diagram', {
    enabled: currentItemKind === 'diagram_label',
  });
  // Voice coach mark (USER-FLOWS-DEEP §10.3): fires the first time the
  // VoiceButton becomes available on this surface, which mirrors `voiceMode`
  // computed below. Declared here so the hook runs unconditionally.
  const voiceCoachEnabled =
    (accountQuery.data?.learner?.preferred_answer_mode ?? 'text') === 'voice' &&
    (currentItemKind === 'short' || currentItemKind === 'long');
  const voiceCoach = useFirstTime('voice', { enabled: voiceCoachEnabled });

  const submitMut = useMutation({
    mutationFn: (input: Parameters<typeof submitAttempt>[1]) => submitAttempt(learnerId, input),
    onSuccess: (res) => {
      setFeedback({ verdict: res.verdict, text: res.feedback });
      if (res.next_hint) setHints((h) => [...h, res.next_hint as string]);
    },
    onError: (err: Error) => Alert.alert(t('error_title'), err.message),
  });

  if (sessionQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={LB.ink2} />
        </View>
      </SafeAreaView>
    );
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View
          style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 }}
        >
          <Text style={{ fontSize: 18, color: LB.ink2, textAlign: 'center' }}>{t('no_items')}</Text>
          <Btn onPress={() => router.replace('/(learner)/home')}>{t('back')}</Btn>
        </View>
      </SafeAreaView>
    );
  }

  const items = sessionQuery.data.items;
  const total = items.length;
  if (idx >= total) {
    // session complete — mark ended_at then navigate to result with the sessionId
    // so the result screen can fetch the real summary. Fire-and-forget: the result
    // screen loads from attempts even if finish fails.
    setPendingSession(null);
    setTimeout(() => {
      void finishSession(learnerId, sessionQuery.data.session_id).catch(() => null);
      router.replace({
        pathname: '/(learner)/result',
        params: { sessionId: sessionQuery.data.session_id },
      });
    }, 0);
    return null;
  }
  const item = items[idx]!;

  const resetForNext = () => {
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    setAnswer('');
    setFillValues([]);
    setMcSelected(null);
    setHints([]);
    setFeedback(null);
    startedAtRef.current = Date.now();
    if (sessionQuery.data && nextIdx < total) {
      setPendingSession({
        session_id: sessionQuery.data.session_id,
        client_id: params.sessionId,
        learner_id: learnerId,
        idx: nextIdx,
        subject_id: params.subjectId ?? null,
        folder_id: params.folderId ?? null,
        material_id: params.materialId ?? null,
        test_mode: testMode,
      });
    } else {
      setPendingSession(null);
    }
  };

  const buildKidAnswer = (): { text: string; mode: 'voice' | 'text' | 'multiple_choice' } => {
    if (item.answer_kind === 'multiple_choice') {
      return {
        text: String(mcSelected ?? ''),
        mode: 'multiple_choice',
      };
    }
    if (item.answer_kind === 'fill_blank') {
      return { text: fillValues.join(' | '), mode: 'text' };
    }
    return { text: answer, mode: 'text' };
  };

  const fireAttempt = (text: string, mode: 'voice' | 'text' | 'multiple_choice') => {
    if (!text.trim()) return;
    const localVerdict = localEvaluate(item as EvaluatableItem, text);
    const durationMs = Date.now() - startedAtRef.current;
    submitMut.mutate({
      session_id: sessionQuery.data.session_id,
      item_id: item.id,
      mode,
      kid_answer: text,
      prior_hints_given: hints,
      duration_ms: durationMs,
      test_mode: testMode,
      client_local_verdict: localVerdict === 'correct' ? 'correct' : null,
    });
  };

  const onSubmit = () => {
    const { text, mode } = buildKidAnswer();
    fireAttempt(text, mode);
  };

  const onVoiceTranscript = (transcript: string) => {
    setAnswer(transcript);
    fireAttempt(transcript, 'voice');
  };

  // Voice replaces the keyboard for free-text answers when the learner opted
  // into voice mode in their profile. Per Doc 05 §session-voice, voice only
  // applies to short / long answer kinds (numeric & formula still need the
  // math keyboard; MC and fill_blank have their own affordances).
  const voiceMode =
    preferredMode === 'voice' && (item.answer_kind === 'short' || item.answer_kind === 'long');

  const stimulusSvg =
    item.stimulus_kind === 'svg' && item.stimulus_data
      ? (item.stimulus_data as SvgStimulusData)
      : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <SessionTopBar
        progress={(idx + 1) / total}
        index={`${idx + 1} / ${total}`}
        badge={testMode ? t('badge_test') : t('badge_practice')}
        onExit={() =>
          Alert.alert(t('exit.title'), undefined, [
            { text: t('exit.keep_going'), style: 'cancel' },
            {
              text: t('exit.end'),
              style: 'destructive',
              onPress: () => router.replace('/(learner)/home'),
            },
          ])
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
        <Card tone="lavender" padding={20}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: LB.ink2,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                flex: 1,
              }}
            >
              {t('question_label', { index: idx + 1 })}
            </Text>
            <Pressable
              onPress={() => setExplainOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('explain.open')}
            >
              <View
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: '#fff',
                  borderColor: LB.hairline,
                  borderWidth: 1,
                }}
              >
                <Text style={{ fontSize: 12, color: LB.ink, fontWeight: '600' }}>
                  {t('explain.pill')}
                </Text>
              </View>
            </Pressable>
          </View>
          <Text style={{ fontSize: 16, color: LB.ink, marginTop: 6, lineHeight: 22 }}>
            {item.question}
          </Text>
          {item.latex_expected && (
            <View style={{ marginTop: 12 }}>
              <LatexText expression={item.latex_expected} displayMode />
            </View>
          )}
          {item.stimulus_kind === 'function_plot' && item.stimulus_data && (
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <FunctionPlot
                {...(item.stimulus_data as Parameters<typeof FunctionPlot>[0])}
                width={300}
                height={200}
              />
            </View>
          )}
          {stimulusSvg && (
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <SvgStimulus
                svg={stimulusSvg.content}
                width={300}
                height={220}
                fallbackLabel={t('stimulus.fallback')}
              />
            </View>
          )}
        </Card>

        <View style={{ marginTop: 18 }}>
          {voiceMode ? (
            <VoiceButton
              locale={mapVoiceLocale(uiLocale)}
              labelIdle={t('voice.idle')}
              labelActive={t('voice.active')}
              permissionRationale={t('voice.permission_rationale')}
              unavailableLabel={t('voice.unavailable')}
              onTranscript={onVoiceTranscript}
              disabled={submitMut.isPending || !!feedback}
            />
          ) : (
            <AnswerArea
              item={item}
              answer={answer}
              setAnswer={setAnswer}
              fillValues={fillValues}
              setFillValues={setFillValues}
              mcSelected={mcSelected}
              setMcSelected={setMcSelected}
            />
          )}
        </View>

        {hints.length > 0 && (
          <View style={{ marginTop: 14, gap: 6 }}>
            {hints.map((h, i) => (
              <View
                key={i}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: LB.bg,
                }}
              >
                <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>{h}</Text>
              </View>
            ))}
          </View>
        )}

        {feedback && (
          <View
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 14,
              backgroundColor:
                feedback.verdict === 'correct'
                  ? 'rgba(107,141,106,0.13)'
                  : feedback.verdict === 'partially_correct'
                    ? 'rgba(181,138,60,0.13)'
                    : 'rgba(177,73,60,0.13)',
            }}
          >
            <Chip
              tone={
                feedback.verdict === 'correct'
                  ? 'success'
                  : feedback.verdict === 'partially_correct'
                    ? 'warning'
                    : 'gray'
              }
            >
              {verdictLabel(feedback.verdict, t)}
            </Chip>
            {feedback.text && (
              <Text style={{ marginTop: 8, fontSize: 14, color: LB.ink, lineHeight: 20 }}>
                {feedback.text}
              </Text>
            )}
          </View>
        )}

        <View style={{ marginTop: 18, flexDirection: 'row', gap: 8 }}>
          {feedback ? (
            <Btn size="lg" full onPress={resetForNext}>
              {t('next')}
            </Btn>
          ) : voiceMode ? (
            // Voice fires the attempt on release — no manual submit pill —
            // but keep "Checking …" feedback visible during the LLM round-trip.
            submitMut.isPending ? (
              <Btn size="lg" full disabled onPress={undefined}>
                {t('checking')}
              </Btn>
            ) : null
          ) : (
            <Btn size="lg" full onPress={onSubmit} disabled={submitMut.isPending}>
              {submitMut.isPending ? t('checking') : t('submit')}
            </Btn>
          )}
        </View>
      </ScrollView>

      {(item.answer_kind === 'formula' || item.answer_kind === 'numeric') &&
        !feedback &&
        !voiceMode && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: LB.bg,
              borderTopColor: LB.hairline,
              borderTopWidth: 1,
              paddingBottom: insets.bottom,
            }}
          >
            <MathKeyboard
              onInsert={(token) =>
                setAnswer((a) => (token === 'BACKSPACE' ? a.slice(0, -1) : a + token))
              }
            />
          </View>
        )}

      <CoachMark
        visible={diagramCoach.shown}
        onDismiss={diagramCoach.dismiss}
        title={tCoach('diagram.title')}
        body={tCoach('diagram.body')}
        ctaLabel={tCoach('dismiss')}
        glyph="🖼️"
      />

      <CoachMark
        visible={voiceCoach.shown}
        onDismiss={voiceCoach.dismiss}
        title={tCoach('voice.title')}
        body={tCoach('voice.body')}
        ctaLabel={tCoach('dismiss')}
        glyph="🎙️"
      />

      <ExplainModal
        visible={explainOpen}
        onClose={() => setExplainOpen(false)}
        learnerId={learnerId}
        itemId={item.id}
        topic={item.question}
        context={item.source_excerpt ?? undefined}
      />
    </SafeAreaView>
  );
}

/** Map our 2-letter app locale to a BCP-47 tag suitable for the native ASR
 *  engine. The voice module rejects bare ISO-639 codes on iOS. */
function mapVoiceLocale(locale: Locale): string {
  switch (locale) {
    case 'de':
      return 'de-DE';
    case 'en':
      return 'en-US';
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    case 'it':
      return 'it-IT';
  }
}

function AnswerArea(props: {
  item: Item;
  answer: string;
  setAnswer: (s: string) => void;
  fillValues: string[];
  setFillValues: (v: string[]) => void;
  mcSelected: number | null;
  setMcSelected: (i: number | null) => void;
}) {
  const { t } = useTranslation('session');
  const { item, answer, setAnswer, fillValues, setFillValues, mcSelected, setMcSelected } = props;
  switch (item.answer_kind) {
    case 'multiple_choice':
      return (
        <View style={{ gap: 8 }}>
          {(item.mc_options ?? []).map((opt, i) => (
            <Pressable key={i} onPress={() => setMcSelected(i)}>
              <View
                style={{
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: mcSelected === i ? LB.primaryLt : '#fff',
                  borderColor: mcSelected === i ? LB.primaryDk : LB.hairline,
                  borderWidth: 1,
                }}
              >
                <Text style={{ fontSize: 15, color: LB.ink }}>{opt}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      );
    case 'fill_blank':
      return (
        <FillBlank
          template={item.fill_blank_template ?? ''}
          values={fillValues}
          onChange={(idx, v) => {
            const next = [...fillValues];
            next[idx] = v;
            setFillValues(next);
          }}
        />
      );
    case 'numeric':
    case 'formula':
      return (
        <MathInput
          value={answer}
          onChangeText={setAnswer}
          placeholder={
            item.answer_kind === 'numeric' ? t('placeholder.number') : t('placeholder.formula')
          }
        />
      );
    case 'short':
    case 'long':
    default:
      return (
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          placeholder={t('placeholder.answer')}
          placeholderTextColor={LB.ink3}
          multiline={item.answer_kind === 'long'}
          style={{
            backgroundColor: '#fff',
            borderColor: LB.hairline,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            fontSize: 16,
            color: LB.ink,
            minHeight: item.answer_kind === 'long' ? 120 : 56,
          }}
        />
      );
  }
}

function verdictLabel(v: string, t: (key: string) => string): string {
  if (v === 'correct') return t('verdict.correct');
  if (v === 'partially_correct') return t('verdict.partially_correct');
  return t('verdict.incorrect');
}
