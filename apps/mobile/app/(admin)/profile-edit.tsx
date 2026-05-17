// Profile edit. Doc 05 §profile-edit. Edits the single learner profile.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { updateLearner } from '../../lib/api/learners.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function ProfileEditScreen() {
  const { t } = useTranslation('admin');
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const qc = useQueryClient();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learner = accountQuery.data?.learner;

  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [grade, setGrade] = useState('');

  useEffect(() => {
    if (learner) {
      setName(learner.display_name ?? '');
      setBirthYear(String(learner.birth_year ?? ''));
      setGrade(String(learner.grade_level ?? ''));
    }
  }, [learner]);

  const mut = useMutation({
    mutationFn: () =>
      updateLearner(learner!.id, {
        display_name: name.trim(),
        grade_level: grade ? Number(grade) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account'] });
      router.back();
    },
    onError: (err: Error) => Alert.alert(t('profile_edit.error_title'), err.message),
  });

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;
  if (!learner) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <Text style={{ padding: 24 }}>{t('profile_edit.not_found')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <Header title={t('profile_edit.title')} />
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
        <Field label={t('profile_edit.field_name')} value={name} onChange={setName} />
        <Text style={{ fontSize: 12, color: LB.ink3 }}>
          {t('profile_edit.birth_year_hint', { year: birthYear || '—' })}
        </Text>
        <Field
          label={t('profile_edit.field_grade')}
          value={grade}
          onChange={setGrade}
          keyboardType="number-pad"
        />
        <View style={{ height: 8 }} />
        <Btn full onPress={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? t('profile_edit.saving') : t('profile_edit.save')}
        </Btn>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <CircleBtn icon="back" onPress={() => router.back()} />
      <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>{title}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: LB.ink2 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
        style={{
          backgroundColor: '#fff',
          borderColor: LB.hairline,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontSize: 16,
          color: LB.ink,
        }}
      />
    </View>
  );
}
