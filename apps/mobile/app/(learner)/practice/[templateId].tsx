// Practice-run screen. Doc 05 §practice + Doc 04 §POST /templates/:id/practice-run.
//
// Flow:
//   1. mount → GET /templates/:id to fetch the template row.
//   2. generate N variants locally via lib/practice/generate.ts (mathjs).
//   3. POST /templates/:id/practice-run to open a run (server bookkeeping).
//   4. for each variant: numeric / formula input, local pass/fail per
//      lib/practice/generate.ts + parseNumericInput.
//   5. on the last variant → PATCH /templates/:id/practice-run/:run_id with
//      problems_generated / problems_correct / avg_time_ms / ended_at.
//   6. calm "Geschafft!" card → back to home.
//
// We never debit credits for practice (Doc 08): server-side the POST/PATCH
// pair is bookkeeping only.

import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseNumericInput } from '@learnbuddy/shared-math';
import {
  Btn,
  Card,
  Chip,
  MathInput,
  MathKeyboard,
  SessionTopBar,
} from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { finalizePracticeRun, getTemplate, startPracticeRun } from '../../../lib/api/templates.js';
import {
  generateVariants,
  scorePracticeAnswer,
  type PracticeVariant,
} from '../../../lib/practice/generate.js';
import { LB } from '../../../lib/theme/colors.js';

const DEFAULT_COUNT = 10;

export default function PracticeScreen() {
  const { t } = useTranslation('practice');
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const insets = useSafeAreaInsets();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? '';

  const templateQuery = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => getTemplate(learnerId, templateId as string),
    enabled: !!learnerId && !!templateId,
  });

  const variants = useMemo<PracticeVariant[]>(() => {
    if (!templateQuery.data) return [];
    return generateVariants(templateQuery.data, { count: DEFAULT_COUNT });
  }, [templateQuery.data]);

  const startRunMut = useMutation({
    mutationFn: () =>
      startPracticeRun(learnerId, templateId as string, {
        problems_generated: variants.length,
      }),
  });

  // Open the run once we have a learner id, a template, and variants. We do
  // this in an effect because variants are derived from the template query
  // and we don't want to fire the POST during render.
  useEffect(() => {
    if (
      !learnerId ||
      !templateId ||
      variants.length === 0 ||
      startRunMut.isPending ||
      startRunMut.data ||
      startRunMut.error
    ) {
      return;
    }
    startRunMut.mutate();
  }, [learnerId, templateId, variants.length, startRunMut]);

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [revealSolution, setRevealSolution] = useState(false);
  const correctCountRef = useRef(0);
  const perItemMsRef = useRef<number[]>([]);
  const itemStartedAtRef = useRef<number>(Date.now());

  const finalizeMut = useMutation({
    mutationFn: (input: {
      runId: string;
      problems_generated: number;
      problems_correct: number;
      avg_time_ms: number | null;
      ended_at: string;
    }) =>
      finalizePracticeRun(learnerId, templateId as string, input.runId, {
        problems_generated: input.problems_generated,
        problems_correct: input.problems_correct,
        avg_time_ms: input.avg_time_ms,
        ended_at: input.ended_at,
      }),
    onError: (err: Error) => Alert.alert(t('error_title'), err.message),
  });

  if (!templateId) return null;

  if (templateQuery.isLoading || accountQuery.isLoading) {
    return <Loading label={t('loading')} />;
  }
  if (templateQuery.error) {
    return (
      <ErrorView
        title={t('error_title')}
        body={t('error_body')}
        cta={t('back')}
        onCta={() => router.replace('/(learner)/home')}
      />
    );
  }
  if (!templateQuery.data) {
    return (
      <ErrorView
        title={t('error_title')}
        body={t('no_template')}
        cta={t('back')}
        onCta={() => router.replace('/(learner)/home')}
      />
    );
  }

  const total = variants.length;

  // Finish view — after the last variant.
  if (idx >= total) {
    const correct = correctCountRef.current;
    const avgMs =
      perItemMsRef.current.length === 0
        ? null
        : Math.round(
            perItemMsRef.current.reduce((acc, ms) => acc + ms, 0) / perItemMsRef.current.length,
          );

    // Fire the PATCH once. The mutation is idempotent on our side because
    // finalizeMut.isSuccess gates future calls.
    if (!finalizeMut.isPending && !finalizeMut.isSuccess && !finalizeMut.isError) {
      if (startRunMut.data) {
        finalizeMut.mutate({
          runId: startRunMut.data.id,
          problems_generated: total,
          problems_correct: correct,
          avg_time_ms: avgMs,
          ended_at: new Date().toISOString(),
        });
      }
    }

    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Card tone="mint" padding={24}>
            <Text
              style={{
                fontSize: 26,
                color: LB.ink,
                fontWeight: '600',
                letterSpacing: -0.5,
              }}
            >
              {t('finish_title')}
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: LB.ink2,
                marginTop: 8,
                lineHeight: 22,
              }}
            >
              {t('finish_body', { correct, total })}
            </Text>
          </Card>
          <Btn size="lg" full onPress={() => router.replace('/(learner)/home')}>
            {t('finish_home')}
          </Btn>
        </View>
      </SafeAreaView>
    );
  }

  const variant = variants[idx]!;
  const template = templateQuery.data;
  const answerHint =
    template.answer_kind === 'formula' ? t('answer_hint_formula') : t('answer_hint_numeric');

  const onCheck = () => {
    const parsed = parseNumericInput(answer, 'de');
    if (parsed.value == null) {
      setFeedback('incorrect');
      return;
    }
    const verdict = scorePracticeAnswer(variant, parsed.value);
    if (verdict === 'correct') correctCountRef.current += 1;
    perItemMsRef.current.push(Date.now() - itemStartedAtRef.current);
    setFeedback(verdict);
  };

  const onNext = () => {
    setIdx((i) => i + 1);
    setAnswer('');
    setFeedback(null);
    setRevealSolution(false);
    itemStartedAtRef.current = Date.now();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <SessionTopBar
        progress={(idx + 1) / total}
        index={t('progress', { current: idx + 1, total })}
        onExit={() =>
          Alert.alert(t('error_title'), undefined, [
            { text: t('back'), onPress: () => router.replace('/(learner)/home') },
          ])
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 }}>
        <Card tone="peach" padding={20}>
          <Text
            style={{
              fontSize: 11,
              color: LB.ink2,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            {t('topic_label')} · {template.topic}
          </Text>
          <Text
            style={{
              fontSize: 18,
              color: LB.ink,
              marginTop: 8,
              lineHeight: 26,
            }}
          >
            {variant.questionText}
          </Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <MathInput value={answer} onChangeText={setAnswer} placeholder={answerHint} />
        </View>

        {feedback && (
          <View
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 14,
              backgroundColor:
                feedback === 'correct' ? 'rgba(107,141,106,0.13)' : 'rgba(181,138,60,0.13)',
            }}
          >
            <Chip tone={feedback === 'correct' ? 'success' : 'warning'}>
              {t(`verdict.${feedback}`)}
            </Chip>
            {revealSolution && (
              <Text style={{ marginTop: 10, fontSize: 14, color: LB.ink, lineHeight: 20 }}>
                {t('solution_label')}: {variant.expectedAnswer}
                {template.units ? ` ${template.units}` : ''}
              </Text>
            )}
          </View>
        )}

        <View style={{ marginTop: 18, gap: 8 }}>
          {feedback ? (
            <>
              {!revealSolution && feedback === 'incorrect' && (
                <Btn full variant="outline" onPress={() => setRevealSolution(true)}>
                  {t('show_solution')}
                </Btn>
              )}
              <Btn size="lg" full onPress={onNext}>
                {t('next')}
              </Btn>
            </>
          ) : (
            <Btn size="lg" full onPress={onCheck} disabled={!answer.trim()}>
              {t('submit')}
            </Btn>
          )}
        </View>
      </ScrollView>

      {!feedback && (
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
    </SafeAreaView>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={LB.ink2} />
        <Text style={{ fontSize: 13, color: LB.ink2 }}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

function ErrorView({
  title,
  body,
  cta,
  onCta,
}: {
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>{body}</Text>
        <View style={{ marginTop: 12 }}>
          <Btn full onPress={onCta}>
            {cta}
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}
