// Home — warm greeting, subject grid. Doc 05 §home.
// No pending counter. No "must do" copy.
//
// Real data lands here via TanStack Query against /account (to discover the
// active learner) and /learners/:id/subjects (decorated tiles). For minor
// profiles the floating "+" routes through admin unlock first per Doc 05 §home.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Chip, EmptyState, Icon, SubjectGlyph } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { createSubject, listSubjects, type SubjectListItem } from '../../lib/api/subjects.js';
import { LB, SUBJECT_TONES, TONE_BG, type SubjectTone } from '../../lib/theme/colors.js';

type SubjectKindOption = {
  kind: 'math' | 'physics' | 'biology' | 'language_native' | 'language_foreign' | 'general';
  label: string;
  glyph: string;
};

const SUBJECT_KINDS: readonly SubjectKindOption[] = [
  { kind: 'math', label: 'Mathematik', glyph: '📐' },
  { kind: 'biology', label: 'Biologie', glyph: '🌱' },
  { kind: 'physics', label: 'Physik', glyph: '🧪' },
  { kind: 'language_native', label: 'Deutsch', glyph: '📖' },
  { kind: 'language_foreign', label: 'Sprache', glyph: '🗣️' },
  { kind: 'general', label: 'Anderes', glyph: '✨' },
];

const SUBJECT_COLOR_HEXES: Record<SubjectKindOption['kind'], string> = {
  math: '#6B8AFD',
  physics: '#B58A3C',
  biology: '#3FA876',
  language_native: '#B1715C',
  language_foreign: '#9272B5',
  general: '#928D9C',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Schönen Abend';
}

function toneForIndex(i: number): SubjectTone {
  return SUBJECT_TONES[i % SUBJECT_TONES.length] as SubjectTone;
}

function glyphForKind(kind: string): string {
  return SUBJECT_KINDS.find((k) => k.kind === kind)?.glyph ?? '✨';
}

function isMinor(birthYear: number, now = new Date()): boolean {
  return now.getFullYear() - birthYear < 16;
}

export default function HomeScreen() {
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

  const [creating, setCreating] = useState(false);

  const onAddTap = () => {
    if (minor) {
      router.push('/(admin)/unlock');
      return;
    }
    setCreating(true);
  };

  const tiles = subjectsQuery.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}
        refreshControl={undefined}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8,
            marginBottom: 18,
          }}
        >
          <Pressable
            onPress={() => router.push('/(admin)/unlock')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Text style={{ fontSize: 12, color: LB.ink3, fontWeight: '500' }}>{greeting()}</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: LB.ink, letterSpacing: -0.3 }}>
              {learnerName || '…'}
            </Text>
          </Pressable>
        </View>

        {accountQuery.isLoading || (subjectsQuery.isLoading && !!learnerId) ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={LB.ink2} />
          </View>
        ) : subjectsQuery.isError ? (
          <EmptyState
            glyph="⚠️"
            title="Konnte Fächer nicht laden."
            body="Bitte zieh die Liste nach unten, um es erneut zu versuchen."
          />
        ) : tiles.length === 0 ? (
          <EmptyState
            glyph="🌱"
            title="Noch keine Fächer."
            body="Leg ein Fach an oder fotografier dein erstes Material — wir kümmern uns um den Rest."
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
            {tiles.map((s, i) => (
              <SubjectTile key={s.id} subject={s} tone={toneForIndex(i)} />
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
    </SafeAreaView>
  );
}

function SubjectTile({ subject, tone }: { subject: SubjectListItem; tone: SubjectTone }) {
  return (
    <Pressable
      onPress={() => router.push(`/(learner)/subject/${subject.id}`)}
      style={{
        width: '48%',
        backgroundColor: TONE_BG[tone],
        borderRadius: 18,
        padding: 16,
        minHeight: 130,
        justifyContent: 'space-between',
      }}
    >
      <SubjectGlyph glyph={glyphForKind(subject.subject_kind)} />
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: LB.ink, letterSpacing: -0.2 }}>
          {subject.name}
        </Text>
        {subject.upcoming_test_in_days != null && (
          <Chip tone="warning">{`Test in ${subject.upcoming_test_in_days} Tagen`}</Chip>
        )}
      </View>
    </Pressable>
  );
}

function AddSubjectTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: '48%',
        borderRadius: 18,
        padding: 16,
        minHeight: 130,
        borderColor: LB.hairline,
        borderWidth: 1,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <Icon name="plus" size={24} color={LB.ink3} />
      <Text style={{ fontSize: 13, color: LB.ink3, fontWeight: '500' }}>Fach hinzufügen</Text>
    </Pressable>
  );
}

function AddSubjectModal({
  visible,
  learnerId,
  onClose,
}: {
  visible: boolean;
  learnerId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kindIdx, setKindIdx] = useState(0);
  const kind = SUBJECT_KINDS[kindIdx]!;
  const placeholder = useMemo(() => kind.label, [kind]);

  const mut = useMutation({
    mutationFn: () =>
      createSubject(learnerId, {
        name: name.trim() || placeholder,
        subject_kind: kind.kind,
        color_hex: SUBJECT_COLOR_HEXES[kind.kind],
        icon_id: null,
        sort_order: 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects', learnerId] });
      setName('');
      setKindIdx(0);
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert('Ups.', err.message);
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
        <View style={{ padding: 22, gap: 18, flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            Neues Fach
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUBJECT_KINDS.map((k, i) => (
              <Pressable
                key={k.kind}
                onPress={() => setKindIdx(i)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: i === kindIdx ? LB.primary : LB.hairline,
                  backgroundColor: i === kindIdx ? LB.primaryLt : '#fff',
                  flexDirection: 'row',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <Text>{k.glyph}</Text>
                <Text style={{ color: LB.ink, fontWeight: '500' }}>{k.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: LB.ink2 }}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={placeholder}
              autoFocus
              placeholderTextColor={LB.ink3}
              style={{
                borderWidth: 1,
                borderColor: LB.hairline,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                color: LB.ink,
                backgroundColor: '#fff',
              }}
            />
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Btn variant="outline" full onPress={onClose}>
                Abbrechen
              </Btn>
            </View>
            <View style={{ flex: 2 }}>
              <Btn full onPress={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? 'Wird angelegt…' : 'Anlegen'}
              </Btn>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
