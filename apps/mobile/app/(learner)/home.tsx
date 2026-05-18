// Home — warm greeting, subject grid. Doc 05 §home.
// No pending counter. No "must do" copy.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Btn,
  Chip,
  CoachMark,
  EmptyState,
  Icon,
  LbHeader,
  SubjectGlyph,
  toast,
} from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import {
  createSubject,
  getScheduleSummary,
  listSubjects,
  type SubjectListItem,
} from '../../lib/api/subjects.js';
import { useFirstTime } from '../../lib/onboarding/coach.js';
import { LB } from '../../lib/theme/colors.js';

type SubjectKindKey =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'geography'
  | 'history'
  | 'language_native'
  | 'language_foreign'
  | 'religion_ethics'
  | 'art_music'
  | 'general'
  | 'other'
  | 'computer_science'
  | 'economics'
  | 'law'
  | 'philosophy'
  | 'literature'
  | 'sports';

type SubjectKindOption = {
  kind: SubjectKindKey;
  glyph: string;
  color: string;
};

const SUBJECT_KINDS: readonly SubjectKindOption[] = [
  { kind: 'math', glyph: '📐', color: '#6B8AFD' },
  { kind: 'physics', glyph: '🧪', color: '#B58A3C' },
  { kind: 'chemistry', glyph: '⚗️', color: '#3E9B9B' },
  { kind: 'biology', glyph: '🌱', color: '#3FA876' },
  { kind: 'geography', glyph: '🌍', color: '#E8844A' },
  { kind: 'history', glyph: '📜', color: '#C0534A' },
  { kind: 'language_native', glyph: '📖', color: '#B1715C' },
  { kind: 'language_foreign', glyph: '🗣️', color: '#9272B5' },
  { kind: 'religion_ethics', glyph: '☯️', color: '#8B7355' },
  { kind: 'art_music', glyph: '🎨', color: '#D4688A' },
  { kind: 'computer_science', glyph: '💻', color: '#7C3AED' },
  { kind: 'economics', glyph: '📊', color: '#0891B2' },
  { kind: 'law', glyph: '⚖️', color: '#475569' },
  { kind: 'philosophy', glyph: '🧠', color: '#6D28D9' },
  { kind: 'literature', glyph: '✍️', color: '#D97706' },
  { kind: 'sports', glyph: '🏃', color: '#16A34A' },
  { kind: 'general', glyph: '✨', color: '#928D9C' },
  { kind: 'other', glyph: '📚', color: '#5A6470' },
];

// Color palette for the color picker = the 12 kind-specific colors.
const COLOR_PALETTE = SUBJECT_KINDS.map((k) => k.color);

function greetingKey(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 11) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function glyphForKind(kind: string): string {
  return SUBJECT_KINDS.find((k) => k.kind === kind)?.glyph ?? '✨';
}

function isMinor(birthYear: number, now = new Date()): boolean {
  return now.getFullYear() - birthYear < 16;
}

export default function HomeScreen() {
  const { t } = useTranslation('home');
  const { t: tCoach } = useTranslation('coach');
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;
  const learnerBirthYear = accountQuery.data?.learner?.birth_year;
  const learnerName = accountQuery.data?.learner?.display_name ?? '';
  const minor = learnerBirthYear != null && isMinor(learnerBirthYear);

  const subjectsQuery = useQuery({
    queryKey: ['subjects', learnerId],
    queryFn: () => listSubjects(learnerId as string),
    enabled: !!learnerId,
  });

  const scheduleQuery = useQuery({
    queryKey: ['schedule-summary', learnerId],
    queryFn: () => getScheduleSummary(learnerId as string),
    enabled: !!learnerId,
  });
  const streak = scheduleQuery.data?.streak_current ?? 0;
  const lastSessionAt = scheduleQuery.data?.last_session_at ?? null;
  const streakCoach = useFirstTime('streak', { enabled: streak > 0 });

  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([accountQuery.refetch(), subjectsQuery.refetch(), scheduleQuery.refetch()]);
    setRefreshing(false);
  };

  const onAddTap = () => {
    if (minor) {
      router.push('/(admin)/unlock');
      return;
    }
    setCreating(true);
  };

  const tiles = subjectsQuery.data ?? [];

  const firstSubject = tiles[0];
  const noPracticeYet = tiles.length > 0 && !lastSessionAt;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <LbHeader
        right={
          streak > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#FFF3E0',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
              }}
            >
              <Text style={{ fontSize: 14 }}>🔥</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#E65100' }}>{streak}</Text>
            </View>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
      >
        <Pressable
          onPress={() => router.push('/(admin)/unlock')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}
        >
          <Text style={{ fontSize: 12, color: LB.ink3, fontWeight: '500' }}>
            {t(`greeting.${greetingKey()}`)}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: LB.ink, letterSpacing: -0.3 }}>
            {learnerName || '…'}
          </Text>
        </Pressable>

        {/* "Fang an!" card when subjects exist but no practice session yet */}
        {noPracticeYet && firstSubject && (
          <Pressable
            onPress={() => router.push(`/(learner)/subject/${firstSubject.id}`)}
            style={{ marginBottom: 18 }}
          >
            <View
              style={{
                backgroundColor: LB.lavender,
                borderRadius: 18,
                padding: 18,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: LB.primary }}>
                  {t('cta_first_session.title')}
                </Text>
                <Text style={{ fontSize: 12, color: LB.ink2, lineHeight: 17 }}>
                  {t('cta_first_session.body', { name: firstSubject.name })}
                </Text>
              </View>
              <Text style={{ fontSize: 24, marginLeft: 12 }}>▶</Text>
            </View>
          </Pressable>
        )}

        {/* "Zuletzt gelernt" badge when practice exists */}
        {lastSessionAt && (
          <Text style={{ fontSize: 12, color: LB.ink3, marginBottom: 14 }}>
            {t('last_session', { date: new Date(lastSessionAt).toLocaleDateString() })}
          </Text>
        )}

        {accountQuery.isLoading || (subjectsQuery.isLoading && !!learnerId) ? (
          <SubjectGridSkeleton />
        ) : subjectsQuery.isError ? (
          <EmptyState
            glyph="⚠️"
            title={t('loading_error.title')}
            body={t('loading_error.body')}
            action={
              <Btn size="sm" onPress={() => void subjectsQuery.refetch()}>
                {t('loading_error.retry')}
              </Btn>
            }
          />
        ) : tiles.length === 0 ? (
          <EmptyState
            glyph="📚"
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              <Btn size="sm" onPress={onAddTap}>
                {t('add_subject_tile')}
              </Btn>
            }
          />
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              rowGap: 12,
            }}
          >
            {tiles.map((s) => (
              <SubjectTile key={s.id} subject={s} />
            ))}
            <AddSubjectTile onPress={onAddTap} />
          </View>
        )}
      </ScrollView>

      <AddSubjectModal
        visible={creating && !!learnerId}
        learnerId={learnerId ?? ''}
        onClose={() => setCreating(false)}
      />

      <CoachMark
        visible={streakCoach.shown}
        onDismiss={streakCoach.dismiss}
        title={tCoach('streak.title', { count: streak })}
        body={tCoach('streak.body')}
        ctaLabel={tCoach('dismiss')}
        glyph="🔥"
      />
    </SafeAreaView>
  );
}

function SubjectTile({ subject }: { subject: SubjectListItem }) {
  const { t } = useTranslation('home');
  // Use the subject's stored color as a soft tint background.
  const bgColor = `${subject.color_hex}26`; // ~15% opacity tint
  return (
    <Pressable
      onPress={() => router.push(`/(learner)/subject/${subject.id}`)}
      accessibilityRole="button"
      accessibilityLabel={subject.name}
      style={{ width: '48%' }}
    >
      <View
        style={{
          backgroundColor: bgColor,
          borderRadius: 18,
          padding: 16,
          minHeight: 130,
          justifyContent: 'space-between',
        }}
      >
        <SubjectGlyph glyph={subject.custom_glyph ?? glyphForKind(subject.subject_kind)} />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: LB.ink, letterSpacing: -0.2 }}>
            {subject.name}
          </Text>
          {subject.upcoming_test_in_days != null && (
            <Chip tone="warning">
              {t('test_in_days', { count: subject.upcoming_test_in_days })}
            </Chip>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function AddSubjectTile({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('home');
  return (
    <Pressable onPress={onPress} style={{ width: '48%' }}>
      <View
        style={{
          borderRadius: 18,
          padding: 16,
          minHeight: 130,
          borderColor: LB.hairline,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Icon name="plus" size={24} color={LB.ink3} />
        <Text style={{ fontSize: 13, color: LB.ink3, fontWeight: '500' }}>
          {t('add_subject_tile')}
        </Text>
      </View>
    </Pressable>
  );
}

// Groups kinds into rows of 4 for the grid.
function chunkKinds<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size) as T[]);
  }
  return result;
}
const KIND_ROWS = chunkKinds(SUBJECT_KINDS, 4);

const EMOJI_GRID = [
  // Objects & learning
  '📌',
  '🔖',
  '📎',
  '✂️',
  '🔬',
  '🔭',
  '💡',
  '🧲',
  '🎯',
  '🏆',
  // Nature & science
  '🌈',
  '🌊',
  '🌋',
  '🌺',
  '🌸',
  '🍃',
  '🦋',
  '🐬',
  '🦅',
  '⚡',
  // Math & tech
  '🔢',
  '💯',
  '∑',
  'π',
  '🖥️',
  '📱',
  '⌨️',
  '🖨️',
  '💾',
  '🔌',
  // Art & culture
  '🎭',
  '🎬',
  '🎵',
  '🎸',
  '🎺',
  '🎻',
  '🎹',
  '🖼️',
  '🎨',
  '✒️',
  // Social & people
  '🌍',
  '🗺️',
  '🏛️',
  '⛪',
  '🕌',
  '🗼',
  '🌃',
  '🎢',
  '🏟️',
  '🎡',
  // Sports & body
  '⚽',
  '🏀',
  '🏊',
  '🤸',
  '🥊',
  '🏋️',
  '🤺',
  '🏇',
  '⛷️',
  '🎾',
  // Food & everyday
  '🍎',
  '🍕',
  '☕',
  '🧪',
  '⚗️',
  '🧬',
  '🦠',
  '🩺',
  '💊',
  '🏥',
  // Symbols & misc
  '⭐',
  '💫',
  '🌟',
  '✨',
  '🎉',
  '🎊',
  '🎁',
  '🔑',
  '🗝️',
  '🧩',
  // Faces & expressions
  '🤔',
  '💪',
  '🙌',
  '👁️',
  '🧠',
  '❤️',
  '💚',
  '💙',
  '🔥',
  '💎',
  // Animals
  '🦁',
  '🐯',
  '🦊',
  '🐺',
  '🦝',
  '🐘',
  '🦒',
  '🐪',
  '🦓',
  '🦋',
] as const;

function AddSubjectModal({
  visible,
  learnerId,
  onClose,
}: {
  visible: boolean;
  learnerId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('home');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kindIdx, setKindIdx] = useState(0);
  const [color, setColor] = useState(SUBJECT_KINDS[0]!.color);
  const [customGlyph, setCustomGlyph] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Track which kind last auto-filled the name so we can replace it when
  // the user switches to a different kind without having typed anything custom.
  const [nameAutoFrom, setNameAutoFrom] = useState<SubjectKindKey | null>(null);

  // Reset all state whenever the modal opens.
  useEffect(() => {
    if (!visible) return;
    setName('');
    setKindIdx(0);
    setColor(SUBJECT_KINDS[0]!.color);
    setCustomGlyph(null);
    setShowEmojiPicker(false);
    setNameAutoFrom(null);
  }, [visible]);

  const currentKind = SUBJECT_KINDS[kindIdx]!;

  function onKindPress(idx: number) {
    const k = SUBJECT_KINDS[idx]!;
    setKindIdx(idx);
    setColor(k.color);
    // Auto-fill name only if still empty or the user hasn't manually edited it.
    const prevDefault = nameAutoFrom ? t(`subjects.${nameAutoFrom}`) : null;
    if (!name.trim() || name === prevDefault) {
      setName(t(`subjects.${k.kind}`));
      setNameAutoFrom(k.kind);
    }
  }

  const activeGlyph = customGlyph ?? currentKind.glyph;

  const mut = useMutation({
    mutationFn: () =>
      createSubject(learnerId, {
        name: name.trim() || t(`subjects.${currentKind.kind}`),
        subject_kind: currentKind.kind,
        color_hex: color,
        icon_id: null,
        custom_glyph: customGlyph,
        sort_order: 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects', learnerId] });
      onClose();
    },
    onError: () => {
      toast.error(t('modal.error_title'));
    },
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
        <ScrollView
          contentContainerStyle={{ padding: 22 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 20 }}>
            {/* Header */}
            <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
              {t('modal.title')}
            </Text>

            {/* Name field with live glyph suffix */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: LB.ink2, fontWeight: '500' }}>
                {t('modal.name_label')}
              </Text>
              <View>
                <TextInput
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    // If the user types something other than the auto-filled default,
                    // stop treating the name as auto-managed.
                    const prevDefault = nameAutoFrom ? t(`subjects.${nameAutoFrom}`) : '';
                    if (v !== prevDefault) setNameAutoFrom(null);
                  }}
                  placeholder={t(`subjects.${currentKind.kind}`)}
                  autoFocus
                  placeholderTextColor={LB.ink3}
                  returnKeyType="done"
                  style={{
                    borderWidth: 1,
                    borderColor: LB.hairline,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 13,
                    paddingRight: 48,
                    fontSize: 16,
                    color: LB.ink,
                    backgroundColor: '#fff',
                  }}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{activeGlyph}</Text>
                </View>
              </View>
            </View>

            {/* Kind grid — 4 columns × 3 rows */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, color: LB.ink2, fontWeight: '500' }}>
                {t('modal.kind_label')}
              </Text>
              <View style={{ gap: 8 }}>
                {KIND_ROWS.map((row, rowIdx) => (
                  <View key={rowIdx} style={{ flexDirection: 'row', gap: 8 }}>
                    {row.map((k, colIdx) => {
                      const idx = rowIdx * 4 + colIdx; // 4-column grid
                      const selected = idx === kindIdx;
                      return (
                        <Pressable
                          key={k.kind}
                          onPress={() => onKindPress(idx)}
                          style={{ flex: 1 }}
                        >
                          <View
                            style={{
                              alignItems: 'center',
                              paddingVertical: 10,
                              paddingHorizontal: 4,
                              borderRadius: 12,
                              borderWidth: 1.5,
                              borderColor: selected ? k.color : LB.hairline,
                              backgroundColor: selected ? `${k.color}1A` : '#fff',
                              gap: 4,
                            }}
                          >
                            <Text style={{ fontSize: 22 }}>{k.glyph}</Text>
                            <Text
                              numberOfLines={1}
                              style={{
                                fontSize: 10,
                                color: selected ? k.color : LB.ink2,
                                fontWeight: selected ? '600' : '400',
                                textAlign: 'center',
                              }}
                            >
                              {t(`subjects.${k.kind}`)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            {/* Color swatches */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, color: LB.ink2, fontWeight: '500' }}>
                {t('modal.color_label')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {COLOR_PALETTE.map((c) => {
                  const selected = color === c;
                  return (
                    <Pressable key={c} onPress={() => setColor(c)}>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: c,
                          borderWidth: selected ? 3 : 0,
                          borderColor: '#fff',
                          shadowColor: c,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: selected ? 0.7 : 0,
                          shadowRadius: 5,
                          elevation: selected ? 4 : 0,
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Custom emoji picker */}
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setShowEmojiPicker((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ fontSize: 12, color: LB.ink2, fontWeight: '500' }}>
                  {t('modal.emoji_label')}
                </Text>
                {customGlyph && <Text style={{ fontSize: 18 }}>{customGlyph}</Text>}
                <Text style={{ fontSize: 11, color: LB.primary }}>
                  {showEmojiPicker ? '▲ schließen' : '▼ wählen'}
                </Text>
                {customGlyph && (
                  <Pressable
                    hitSlop={6}
                    onPress={() => {
                      setCustomGlyph(null);
                      setShowEmojiPicker(false);
                    }}
                  >
                    <Text style={{ fontSize: 11, color: LB.ink3 }}>✕ zurücksetzen</Text>
                  </Pressable>
                )}
              </Pressable>
              {showEmojiPicker && (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 4,
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    borderColor: LB.hairline,
                    borderWidth: 1,
                    padding: 8,
                  }}
                >
                  {EMOJI_GRID.map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => {
                        setCustomGlyph(emoji);
                        setShowEmojiPicker(false);
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        backgroundColor: customGlyph === emoji ? `${color}26` : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Live tile preview */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, color: LB.ink2, fontWeight: '500' }}>
                {t('modal.preview_label')}
              </Text>
              <View
                style={{
                  backgroundColor: `${color}26`,
                  borderRadius: 18,
                  padding: 16,
                  width: '50%',
                  aspectRatio: 1,
                  justifyContent: 'space-between',
                }}
              >
                <SubjectGlyph glyph={activeGlyph} />
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: '600', color: LB.ink, letterSpacing: -0.2 }}
                >
                  {name.trim() || t(`subjects.${currentKind.kind}`)}
                </Text>
              </View>
            </View>

            {/* CTAs */}
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Btn variant="outline" full onPress={onClose}>
                  {t('modal.cancel')}
                </Btn>
              </View>
              <View style={{ flex: 2 }}>
                <Btn full onPress={() => mut.mutate()} disabled={mut.isPending}>
                  {mut.isPending ? t('modal.creating') : t('modal.create')}
                </Btn>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SkeletonTile({ pulse }: { pulse: Animated.Value }) {
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });
  return (
    <Animated.View
      style={{
        width: '48%',
        borderRadius: 18,
        minHeight: 130,
        backgroundColor: LB.hairline,
        opacity,
      }}
    />
  );
}

function SubjectGridSkeleton() {
  const pulse = useState(new Animated.Value(0))[0];
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 12,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <SkeletonTile key={i} pulse={pulse} />
      ))}
    </View>
  );
}
