// Profile creation. Doc 04 §learners + doc 05 §8.
//
// Collects display_name, birth_year, grade_level, ui_locale, avatar, answer
// mode. Adult profiles POST inline and forward to PIN setup. Minor profiles
// stash the draft in the Zustand store and forward to profile-minor-consent,
// which captures the consent record and owns the POST itself.

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';
import { createLearner } from '../../lib/api/learners.js';
import { ApiError } from '../../lib/api/client.js';
import { useAppStore } from '../../lib/store/index.js';

const GRADE_VALUES: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export default function AddProfileScreen() {
  const { t } = useTranslation('onboarding');
  const setActiveLearner = useAppStore((s) => s.set_active_learner);
  const setPendingDraft = useAppStore((s) => s.set_pending_profile_draft);

  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [grade, setGrade] = useState<number>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedYear = useMemo(() => {
    const n = Number.parseInt(birthYear, 10);
    return Number.isFinite(n) && n >= 1900 && n <= new Date().getUTCFullYear() ? n : null;
  }, [birthYear]);
  const ageThisYear = parsedYear ? new Date().getUTCFullYear() - parsedYear : null;
  const isMinor = ageThisYear !== null && ageThisYear < 16;

  const canSubmit = name.trim().length > 0 && parsedYear !== null && !busy;

  async function onContinue() {
    if (!canSubmit || parsedYear === null) return;
    const baseDraft = {
      display_name: name.trim(),
      birth_year: parsedYear,
      grade_level: grade,
      ui_locale: 'de' as const,
      avatar_id: 1,
      preferred_answer_mode: 'voice' as const,
    };
    if (isMinor) {
      setPendingDraft(baseDraft);
      router.push('/(onboarding)/profile-minor-consent');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const learner = await createLearner({ ...baseDraft, minor_consent_version: null });
      setActiveLearner(learner.id);
      router.push('/(onboarding)/pin-setup');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'learner_already_exists') {
        setError(t('add_profile.error_already'));
      } else if (e instanceof ApiError && e.code === 'validation_failed') {
        setError(t('add_profile.error_validation'));
      } else {
        setError(t('add_profile.error_generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingVertical: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            {t('add_profile.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {t('add_profile.body')}
          </Text>

          <View style={{ marginTop: 18, gap: 12 }}>
            <Field label={t('add_profile.field_first_name')}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('add_profile.placeholder_first_name')}
                placeholderTextColor={LB.ink3}
                style={inputStyle}
              />
            </Field>
            <Field label={t('add_profile.field_birth_year')}>
              <TextInput
                value={birthYear}
                onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
                placeholder={t('add_profile.placeholder_birth_year')}
                placeholderTextColor={LB.ink3}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </Field>
            <Field label={t('add_profile.field_grade')}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {GRADE_VALUES.map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setGrade(value)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: grade === value ? LB.primaryLt : LB.bg,
                      borderColor: grade === value ? LB.primary : LB.hairline,
                      borderWidth: 1,
                    }}
                  >
                    <Text
                      style={{
                        color: grade === value ? LB.primaryDk : LB.ink,
                        fontSize: 12,
                        fontWeight: grade === value ? '600' : '400',
                      }}
                    >
                      {t(`add_profile.grades.${value}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            {isMinor && (
              <Text style={{ fontSize: 12, color: LB.ink2, lineHeight: 18 }}>
                {t('add_profile.minor_hint')}
              </Text>
            )}
            {error && <Text style={{ color: LB.danger, fontSize: 12 }}>{error}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 32 }}>
          <Btn size="lg" full variant="primary" onPress={onContinue}>
            {busy ? t('add_profile.busy') : t('add_profile.cta')}
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{ fontSize: 11, color: LB.ink2, textTransform: 'uppercase', letterSpacing: 0.6 }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: LB.bg,
  borderColor: LB.hairline,
  borderWidth: 1,
  borderRadius: 12,
  paddingHorizontal: 16,
  height: 50,
  fontSize: 15,
  color: LB.ink,
} as const;
