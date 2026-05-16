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
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Btn,
  Card,
  Chip,
  FillBlank,
  FunctionPlot,
  LatexText,
  MathInput,
  MathKeyboard,
  SessionTopBar,
} from '../../../components/lb/index.js';
import { startSession, submitAttempt } from '../../../lib/api/sessions.js';
import { localEvaluate, type EvaluatableItem } from '../../../lib/eval/local.js';
import { LB } from '../../../lib/theme/colors.js';
import type { Item } from '@learnbuddy/shared-types';

export default function SessionScreen() {
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

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [fillValues, setFillValues] = useState<string[]>([]);
  const [mcSelected, setMcSelected] = useState<number | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ verdict: string; text: string | null } | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  const submitMut = useMutation({
    mutationFn: (input: Parameters<typeof submitAttempt>[1]) => submitAttempt(learnerId, input),
    onSuccess: (res) => {
      setFeedback({ verdict: res.verdict, text: res.feedback });
      if (res.next_hint) setHints((h) => [...h, res.next_hint as string]);
    },
    onError: (err: Error) => Alert.alert('Ups.', err.message),
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
          <Text style={{ fontSize: 18, color: LB.ink2, textAlign: 'center' }}>
            Wir konnten gerade keine Aufgaben finden. Versuch es nochmal — oder fotografier neues
            Material.
          </Text>
          <Btn onPress={() => router.replace('/(learner)/home')}>Zurück</Btn>
        </View>
      </SafeAreaView>
    );
  }

  const items = sessionQuery.data.items;
  const total = items.length;
  if (idx >= total) {
    // session complete
    setTimeout(() => router.replace('/(learner)/result'), 0);
    return null;
  }
  const item = items[idx]!;

  const resetForNext = () => {
    setIdx((i) => i + 1);
    setAnswer('');
    setFillValues([]);
    setMcSelected(null);
    setHints([]);
    setFeedback(null);
    startedAtRef.current = Date.now();
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

  const onSubmit = () => {
    const { text, mode } = buildKidAnswer();
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <SessionTopBar
        progress={(idx + 1) / total}
        index={`${idx + 1} / ${total}`}
        badge={testMode ? 'Test' : 'Üben'}
        onExit={() =>
          Alert.alert('Sitzung beenden?', undefined, [
            { text: 'Weiter üben', style: 'cancel' },
            {
              text: 'Beenden',
              style: 'destructive',
              onPress: () => router.replace('/(learner)/home'),
            },
          ])
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
        <Card tone="lavender" padding={20}>
          <Text
            style={{
              fontSize: 11,
              color: LB.ink2,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Frage {idx + 1}
          </Text>
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
        </Card>

        <View style={{ marginTop: 18 }}>
          {renderAnswerArea({
            item,
            answer,
            setAnswer,
            fillValues,
            setFillValues,
            mcSelected,
            setMcSelected,
          })}
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
              {verdictLabel(feedback.verdict)}
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
              Weiter
            </Btn>
          ) : (
            <Btn size="lg" full onPress={onSubmit} disabled={submitMut.isPending}>
              {submitMut.isPending ? 'Prüfe …' : 'Senden'}
            </Btn>
          )}
        </View>
      </ScrollView>

      {(item.answer_kind === 'formula' || item.answer_kind === 'numeric') && !feedback && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: LB.bg,
            borderTopColor: LB.hairline,
            borderTopWidth: 1,
          }}
        >
          <MathKeyboard
            onInsert={(t) => setAnswer((a) => (t === 'BACKSPACE' ? a.slice(0, -1) : a + t))}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function renderAnswerArea(props: {
  item: Item;
  answer: string;
  setAnswer: (s: string) => void;
  fillValues: string[];
  setFillValues: (v: string[]) => void;
  mcSelected: number | null;
  setMcSelected: (i: number | null) => void;
}) {
  const { item, answer, setAnswer, fillValues, setFillValues, mcSelected, setMcSelected } = props;
  switch (item.answer_kind) {
    case 'multiple_choice':
      return (
        <View style={{ gap: 8 }}>
          {(item.mc_options ?? []).map((opt, i) => (
            <Pressable
              key={i}
              onPress={() => setMcSelected(i)}
              style={{
                padding: 14,
                borderRadius: 14,
                backgroundColor: mcSelected === i ? LB.primaryLt : '#fff',
                borderColor: mcSelected === i ? LB.primaryDk : LB.hairline,
                borderWidth: 1,
              }}
            >
              <Text style={{ fontSize: 15, color: LB.ink }}>{opt}</Text>
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
          placeholder={item.answer_kind === 'numeric' ? 'Zahl' : 'Formel'}
        />
      );
    case 'short':
    case 'long':
    default:
      return (
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          placeholder="Antwort"
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

function verdictLabel(v: string): string {
  if (v === 'correct') return 'Genau!';
  if (v === 'partially_correct') return 'Fast richtig';
  return 'Noch nicht ganz';
}
