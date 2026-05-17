// Email + password signup. Doc 04 §auth + doc 05 §4.
//
// Calls POST /auth/account/signup. On success the API has created account,
// subscription (trial), and credit_bucket rows; mobile then drops the user
// on the verify-email screen until they confirm via the email link.

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Icon } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';
import { signup } from '../../lib/api/auth.js';
import { ApiError } from '../../lib/api/client.js';
import { i18n } from '../../lib/i18n/index.js';
import { type AppLocale } from '../../lib/i18n/locale-storage.js';

const LOCALE_COUNTRY: Record<AppLocale, string> = {
  de: 'DE',
  en: 'US',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
};

export default function SignupScreen() {
  const { t } = useTranslation('onboarding');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const trimmedEmail = email.trim();
  const canSubmit = trimmedEmail.length > 3 && password.length >= 8 && !busy;

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const appLocale = (i18n.language ?? 'de') as AppLocale;
      const res = await signup({
        email: trimmedEmail,
        password,
        locale: appLocale,
        country_code: LOCALE_COUNTRY[appLocale],
      });
      if (res.requires_verification) {
        router.push('/(onboarding)/verify-email');
      } else {
        // Dev path: API returned a session immediately (email-confirmed
        // up-front). Drop through the index router so the consent /
        // who-uses gate runs in one place.
        router.replace('/');
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'conflict') {
          setError(t('signup.error_conflict'));
        } else if (e.code === 'validation_failed' || e.status === 400) {
          setError(t('signup.error_validation'));
        } else {
          setError(t('signup.error_generic'));
        }
      } else {
        setError(t('signup.error_network'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 28,
          paddingTop: 32,
          paddingBottom: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            {t('signup.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {t('signup.subtitle')}
          </Text>

          <View style={{ marginTop: 18, gap: 12 }}>
            <Input
              placeholder={t('signup.placeholder_email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            <View style={{ position: 'relative' }}>
              <TextInput
                placeholder={t('signup.placeholder_password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!busy}
                placeholderTextColor={LB.ink3}
                style={{
                  backgroundColor: LB.bg,
                  borderColor: LB.hairline,
                  borderWidth: 1,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingRight: 48,
                  height: 50,
                  fontSize: 15,
                  color: LB.ink,
                }}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: 0,
                  bottom: 0,
                  justifyContent: 'center',
                }}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} color={LB.ink3} />
              </Pressable>
            </View>
            {error && <Text style={{ color: LB.danger, fontSize: 12 }}>{error}</Text>}
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 28, paddingBottom: 24, paddingTop: 8, gap: 10 }}>
        <Btn size="lg" full variant="primary" onPress={onSubmit} disabled={!canSubmit}>
          {busy ? t('signup.busy') : t('signup.cta')}
        </Btn>
        <Pressable
          onPress={() => router.push('/(onboarding)/hand-off-to-adult')}
          hitSlop={12}
          style={{ alignSelf: 'center', paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 12, color: LB.ink2, textDecorationLine: 'underline' }}>
            {t('signup.minor_link')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={LB.ink3}
      style={{
        backgroundColor: LB.bg,
        borderColor: LB.hairline,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 50,
        fontSize: 15,
        color: LB.ink,
      }}
    />
  );
}
