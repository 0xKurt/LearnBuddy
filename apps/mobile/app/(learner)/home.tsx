// Home — warm greeting, subject grid. Doc 05 §home.
// No pending counter. No "must do" copy.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { ageInYears } from '../../lib/date.js';
import {
  createSubject,
  getScheduleSummary,
  listSubjects,
  type SubjectListItem,
} from '../../lib/api/subjects.js';
import { useFirstTime } from '../../lib/onboarding/coach.js';
import { registerPushTokenForLearner, scheduleTestDateReminders } from '../../lib/notifications.js';
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

function isLongAbsence(lastSessionAt: string | null, now = Date.now()): boolean {
  if (!lastSessionAt) return false;
  const last = new Date(lastSessionAt).getTime();
  if (Number.isNaN(last)) return false;
  return now - last > 21 * 86_400_000;
}

function isMinor(birthDate: string, now = new Date()): boolean {
  return ageInYears(birthDate, now) < 16;
}

export default function HomeScreen() {
  const { t } = useTranslation('home');
  const { t: tCoach } = useTranslation('coach');
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;
  const learnerBirthDate = accountQuery.data?.learner?.birth_date;
  const learnerName = accountQuery.data?.learner?.display_name ?? '';
  const minor = learnerBirthDate != null && isMinor(learnerBirthDate);

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

  // Register the device's Expo push token with the API so the server's
  // extraction worker can wake us up when async work finishes. Runs once
  // per learner — guarded by a ref so re-renders don't refire.
  // No-op in Expo Go (the helper returns silently).
  const pushRegisteredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!learnerId) return;
    if (pushRegisteredRef.current === learnerId) return;
    pushRegisteredRef.current = learnerId;
    void registerPushTokenForLearner(learnerId).catch(() => null);
  }, [learnerId]);

  // Sync local test-date notifications whenever schedule data changes.
  const notifKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const tests = scheduleQuery.data?.upcoming_tests;
    if (!tests) return;
    const key = tests.map((t) => `${t.folder_id}:${t.scheduled_for}`).join(',');
    if (notifKeyRef.current === key) return;
    notifKeyRef.current = key;
    void scheduleTestDateReminders(
      tests.map((t) => ({
        folder_id: t.folder_id,
        subject_id: t.subject_id,
        name: t.name,
        scheduled_for: t.scheduled_for,
      })),
    ).catch(() => null);
  }, [scheduleQuery.data?.upcoming_tests]);

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
    <View style={{ flex: 1, backgroundColor: LB.paper }}>
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
          accessibilityRole="button"
          accessibilityLabel={t('account_a11y')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}
        >
          <Text style={{ fontSize: 12, color: LB.ink3, fontWeight: '500' }}>
            {t(`greeting.${greetingKey()}`)}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: LB.ink, letterSpacing: -0.3 }}>
            {learnerName || '…'}
          </Text>
        </Pressable>

        {/* Soft re-entry nudge after a long absence (USER-FLOWS-DEEP §10). */}
        {isLongAbsence(lastSessionAt) && (
          <View
            style={{
              backgroundColor: LB.bg,
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>{t('re_entry')}</Text>
          </View>
        )}

        {/* "Fang an!" card when subjects exist but no practice session yet */}
        {noPracticeYet && firstSubject && (
          <Pressable
            onPress={() => router.push(`/(learner)/subject/${firstSubject.id}`)}
            accessibilityRole="button"
            accessibilityLabel={t('cta_first_session.title')}
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
    </View>
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
              {subject.upcoming_test_in_days === 0
                ? t('test_today')
                : t('test_in_days', { count: subject.upcoming_test_in_days })}
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('add_subject_tile')}
      style={{ width: '48%' }}
    >
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

const EMOJI_PICKER_GRID = [
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
  '🌈',
  '🌊',
  '🌋',
  '🌺',
  '🌸',
  '🦋',
  '🐬',
  '🦅',
  '⚡',
  '🔢',
  '💯',
  '🖥️',
  '📱',
  '🎭',
  '🎬',
  '🎵',
  '🎸',
  '🎨',
  '✒️',
  '🌍',
  '🗺️',
  '🏛️',
  '⚽',
  '🏀',
  '🏊',
  '🥊',
  '🍎',
  '☕',
  '🧪',
  '🧬',
  '⭐',
  '💫',
  '✨',
  '🎉',
  '🔑',
  '🧩',
  '🤔',
  '💪',
  '🧠',
  '🔥',
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
  const [showKindSheet, setShowKindSheet] = useState(false);
  const [nameAutoFrom, setNameAutoFrom] = useState<SubjectKindKey | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setKindIdx(0);
    setColor(SUBJECT_KINDS[0]!.color);
    setCustomGlyph(null);
    setShowEmojiPicker(false);
    setShowKindSheet(false);
    setNameAutoFrom(null);
  }, [visible]);

  const currentKind = SUBJECT_KINDS[kindIdx]!;
  const activeGlyph = customGlyph ?? currentKind.glyph;

  function onKindPress(idx: number) {
    const k = SUBJECT_KINDS[idx]!;
    setKindIdx(idx);
    setColor(k.color);
    const prevDefault = nameAutoFrom ? t(`subjects.${nameAutoFrom}`) : null;
    if (!name.trim() || name === prevDefault) {
      setName(t(`subjects.${k.kind}`));
      setNameAutoFrom(k.kind);
    }
  }

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
      {/* Emoji picker overlay modal */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: '#00000040', justifyContent: 'flex-end' }}
          onPress={() => setShowEmojiPicker(false)}
        >
          <View
            style={{
              backgroundColor: LB.paper,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: 36,
            }}
          >
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: LB.ink }}>
                {t('modal.emoji_label')}
              </Text>
              {customGlyph && (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setCustomGlyph(null);
                    setShowEmojiPicker(false);
                  }}
                >
                  <Text style={{ fontSize: 12, color: LB.ink3 }}>✕ {t('modal.cancel')}</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {EMOJI_PICKER_GRID.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    setCustomGlyph(emoji);
                    setShowEmojiPicker(false);
                  }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                      backgroundColor: customGlyph === emoji ? `${color}26` : '#fff',
                      borderWidth: 1,
                      borderColor: customGlyph === emoji ? color : LB.hairline,
                    }}
                  >
                    <Text style={{ fontSize: 26 }}>{emoji}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 22, gap: 18 }}>
          {/* Header row */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 20, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
              {t('modal.title')}
            </Text>
            <Pressable
              hitSlop={12}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('modal.cancel')}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: LB.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 14, color: LB.ink2, fontWeight: '600' }}>✕</Text>
              </View>
            </Pressable>
          </View>

          {/* Kind dropdown */}
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: 11,
                color: LB.ink2,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t('modal.kind_label')}
            </Text>
            <Pressable onPress={() => setShowKindSheet(true)}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: LB.hairline,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: currentKind.color,
                    }}
                  />
                  <Text style={{ fontSize: 22 }}>{currentKind.glyph}</Text>
                  <Text style={{ fontSize: 16, color: LB.ink, fontWeight: '500' }}>
                    {t(`subjects.${currentKind.kind}`)}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: LB.ink3 }}>▾</Text>
              </View>
            </Pressable>
          </View>

          {/* Kind sheet */}
          <Modal
            visible={showKindSheet}
            transparent
            animationType="slide"
            onRequestClose={() => setShowKindSheet(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: '#00000050', justifyContent: 'flex-end' }}
              onPress={() => setShowKindSheet(false)}
            >
              <View
                style={{
                  backgroundColor: LB.paper,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 20,
                  paddingBottom: 36,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: LB.ink, marginBottom: 16 }}>
                  {t('modal.kind_label')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SUBJECT_KINDS.map((k, idx) => {
                    const selected = idx === kindIdx;
                    return (
                      <Pressable
                        key={k.kind}
                        onPress={() => {
                          onKindPress(idx);
                          setShowKindSheet(false);
                        }}
                      >
                        <View
                          style={{
                            width: 74,
                            alignItems: 'center',
                            paddingVertical: 10,
                            paddingHorizontal: 4,
                            borderRadius: 14,
                            borderWidth: 1.5,
                            borderColor: selected ? k.color : LB.hairline,
                            backgroundColor: selected ? `${k.color}18` : '#fff',
                            gap: 4,
                          }}
                        >
                          <Text style={{ fontSize: 26 }}>{k.glyph}</Text>
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
              </View>
            </Pressable>
          </Modal>

          {/* Name field */}
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: 11,
                color: LB.ink2,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t('modal.name_label')}
            </Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                const prevDefault = nameAutoFrom ? t(`subjects.${nameAutoFrom}`) : '';
                if (v !== prevDefault) setNameAutoFrom(null);
              }}
              placeholder={t(`subjects.${currentKind.kind}`)}
              placeholderTextColor={LB.ink3}
              returnKeyType="done"
              style={{
                borderWidth: 1,
                borderColor: LB.hairline,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 13,
                fontSize: 16,
                color: LB.ink,
                backgroundColor: '#fff',
              }}
            />
          </View>

          {/* Icon + Color row */}
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            {/* Emoji tile */}
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: LB.ink2,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {t('modal.emoji_label')}
              </Text>
              <Pressable onPress={() => setShowEmojiPicker(true)}>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 18,
                    backgroundColor: `${color}18`,
                    borderWidth: 1.5,
                    borderColor: color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 32 }}>{activeGlyph}</Text>
                </View>
              </Pressable>
            </View>

            {/* Color swatches */}
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: LB.ink2,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {t('modal.color_label')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {COLOR_PALETTE.map((c) => {
                  const selected = color === c;
                  return (
                    <Pressable key={c} onPress={() => setColor(c)}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: c,
                          borderWidth: selected ? 3 : 1.5,
                          borderColor: selected ? '#fff' : 'transparent',
                          shadowColor: c,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: selected ? 0.6 : 0,
                          shadowRadius: 6,
                          elevation: selected ? 4 : 0,
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          {/* Create button */}
          <Btn full onPress={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? t('modal.creating') : t('modal.create')}
          </Btn>
        </View>
      </View>
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
