// Profile creation. Doc 04 §learners + doc 05 §8.
//
// Collects display_name. birth_date is carried over from the signup form
// (welcome.tsx) via the store. grade_level removed from UI — stored as null
// until a future settings flow lets users set it.

import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';
import { createLearner } from '../../lib/api/learners.js';
import { ApiError } from '../../lib/api/client.js';
import { devNukeAccount, devResetAll } from '../../lib/dev/reset.js';
import { i18n } from '../../lib/i18n/index.js';
import { type AppLocale } from '../../lib/i18n/locale-storage.js';
import { useAppStore } from '../../lib/store/index.js';

export default function AddProfileScreen() {
  const { t } = useTranslation('onboarding');
  const storedBirthDate = useAppStore((s) => s.pending_birth_date);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && storedBirthDate !== null && !busy;

  async function onContinue() {
    if (!canSubmit || storedBirthDate === null) return;
    setBusy(true);
    setError(null);
    try {
      await createLearner({
        display_name: name.trim(),
        birth_date: storedBirthDate,
        grade_level: null,
        ui_locale: (i18n.language ?? 'de') as AppLocale,
        avatar_id: 1,
        preferred_answer_mode: 'voice',
        minor_consent_version: null,
      });
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 14, marginTop: 24 }}>
          {__DEV__ && (
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-end' }}>
              <Pressable
                onPress={() =>
                  void devResetAll().then(() => router.replace('/(onboarding)/language' as never))
                }
              >
                <View
                  style={{
                    backgroundColor: '#d1361c',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}
                  >
                    DEV · RESET
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() =>
                  void devNukeAccount().then(() =>
                    router.replace('/(onboarding)/language' as never),
                  )
                }
              >
                <View
                  style={{
                    backgroundColor: '#7b1fa2',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}
                  >
                    DEV · NUKE
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            {t('add_profile.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {t('add_profile.body')}
          </Text>

          <View style={{ marginTop: 18, gap: 16 }}>
            <Field label={t('add_profile.field_first_name')}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('add_profile.placeholder_first_name')}
                placeholderTextColor={LB.ink3}
                autoCapitalize="words"
                style={inputStyle}
              />
            </Field>
            {error && <Text style={{ color: LB.danger, fontSize: 12 }}>{error}</Text>}
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 28, paddingBottom: 24, paddingTop: 8 }}>
        <Btn size="lg" full variant="primary" onPress={onContinue} disabled={!canSubmit}>
          {busy ? t('add_profile.busy') : t('add_profile.cta')}
        </Btn>
      </View>
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
