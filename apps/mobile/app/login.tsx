// Login. Doc 04 §Auth + Doc 05 §login.
//
// Email + password only. Magic link removed — it requires a working email
// pipeline and adds little for a single-account family-mode app where the
// password flow is already there. Password reset link is kept for the case
// the adult forgets the password.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, LbTextInput } from '../components/lb/index.js';
import { getSessionSync, setSession } from '../lib/auth/session.js';
import { useAppStore } from '../lib/store/index.js';
import { supabase } from '../lib/supabase.js';
import { LB } from '../lib/theme/colors.js';

export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const { unlock } = useLocalSearchParams<{ unlock?: string }>();
  const isUnlockFallback = unlock === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFormatError, setEmailFormatError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const trimmedEmail = email.trim();
  const canSubmit = trimmedEmail.length > 3 && password.length >= 8 && !busy;

  const onEmailBlur = () => {
    if (trimmedEmail.length > 0 && !trimmedEmail.includes('@')) {
      setEmailFormatError(true);
    } else {
      setEmailFormatError(false);
    }
  };

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session) return;
      const existing = getSessionSync();
      await setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
        account_id: existing?.account_id ?? '',
      });
      if (isUnlockFallback) {
        // Password was used to bypass a forgotten PIN → grant admin access and
        // land on the admin overview so the user can update their PIN.
        useAppStore.getState().set_admin_unlocked(true);
        router.replace('/(admin)/overview');
      } else {
        router.replace('/');
      }
    });
    return () => sub.data.subscription.unsubscribe();
  }, [isUnlockFallback]);

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (err || !data.session) {
        const msg = err?.message?.toLowerCase() ?? '';
        if (msg.includes('rate') || msg.includes('too many')) {
          setError(t('login.error_rate_limited'));
        } else {
          setError(t('login.error_invalid'));
        }
        return;
      }
      // onAuthStateChange will fire SIGNED_IN; navigation happens there.
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 28,
            paddingVertical: 32,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 14, marginTop: 24 }}>
            <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
              {isUnlockFallback ? t('login.unlock_title') : t('login.title')}
            </Text>
            <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
              {isUnlockFallback ? t('login.unlock_subtitle') : t('login.subtitle')}
            </Text>

            <View style={{ marginTop: 18, gap: 12 }}>
              <LbTextInput
                placeholder={t('login.email_placeholder')}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setEmailFormatError(false);
                }}
                onBlur={onEmailBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!busy}
                error={emailFormatError}
                errorMessage={emailFormatError ? t('login.error_email_format') : undefined}
              />
              <LbTextInput
                ref={passwordRef}
                placeholder={t('login.password_placeholder')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                editable={!busy}
                showToggle
                shown={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                toggleAccessibilityLabel={
                  showPassword ? t('login.hide_password') : t('login.show_password')
                }
              />
              {error && <Text style={{ color: LB.danger, fontSize: 12 }}>{error}</Text>}
              <Pressable onPress={() => router.push('/reset-password')} disabled={busy} hitSlop={8}>
                <Text
                  style={{
                    color: LB.ink2,
                    fontSize: 12,
                    textDecorationLine: 'underline',
                    paddingTop: 4,
                  }}
                >
                  {t('login.forgot_password')}
                </Text>
              </Pressable>
            </View>
          </View>

          <Btn size="lg" full variant="primary" onPress={onSubmit} disabled={!canSubmit}>
            {busy ? t('login.busy') : t('login.password_cta')}
          </Btn>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
