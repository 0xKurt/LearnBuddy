// Auth landing. Standard tabbed pattern: Sign Up / Log In on one screen,
// email + password, single black CTA. Button is inside the ScrollView with
// a flex-1 spacer — the only pattern that reliably shows the CTA on both
// iOS and Android regardless of screen size. Doc 05 §1 + DESIGN-BRIEF §forms.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { signup } from '../../lib/api/auth.js';
import { ApiError } from '../../lib/api/client.js';
import { getSessionSync, setSession } from '../../lib/auth/session.js';
import { devResetAll } from '../../lib/dev/reset.js';
import { supabase } from '../../lib/supabase.js';
import { LB } from '../../lib/theme/colors.js';

type Mode = 'signup' | 'login';

export default function WelcomeScreen() {
  const { t } = useTranslation('auth');
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const canSubmit = trimmedEmail.length > 3 && password.length >= 8 && !busy;

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
      router.replace('/');
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const res = await signup({
          email: trimmedEmail,
          password,
          locale: 'de',
          country_code: 'DE',
        });
        if (res.requires_verification) {
          router.push('/(onboarding)/verify-email');
        } else {
          router.replace('/');
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (err || !data.session) {
          const msg = err?.message?.toLowerCase() ?? '';
          if (msg.includes('rate') || msg.includes('too many')) {
            setError(t('welcome.error_rate_limited'));
          } else {
            setError(t('welcome.error_invalid'));
          }
          return;
        }
        // onAuthStateChange handles navigation.
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'conflict') setError(t('welcome.error_conflict'));
        else if (e.code === 'validation_failed' || e.status === 400)
          setError(t('welcome.error_validation'));
        else setError(t('welcome.error_generic'));
      } else {
        setError(t('welcome.error_offline'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 16,
            marginBottom: 32,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: LB.ink, letterSpacing: 0.4 }}>
            {t('welcome.brand')}
          </Text>
          {__DEV__ && (
            <Pressable
              onPress={() => {
                void devResetAll().then(() => {
                  setEmail('');
                  setPassword('');
                  setError(null);
                  router.replace('/(onboarding)/language' as never);
                });
              }}
              hitSlop={10}
              style={{
                backgroundColor: '#d1361c',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                DEV · RESET
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Hero tint area ── */}
        <View
          style={{
            backgroundColor: LB.lavender,
            borderRadius: 20,
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 20,
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 30, fontWeight: '700', color: LB.ink, letterSpacing: -0.6 }}>
            {mode === 'signup' ? t('welcome.signup_title') : t('welcome.login_title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, marginTop: 6, lineHeight: 20 }}>
            {mode === 'signup' ? t('welcome.signup_subtitle') : t('welcome.login_subtitle')}
          </Text>
        </View>

        {/* ── Tab switcher ── */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: LB.bg,
            borderRadius: 14,
            padding: 4,
            marginBottom: 24,
          }}
        >
          <Tab
            label={t('welcome.tab_signup')}
            active={mode === 'signup'}
            onPress={() => {
              setMode('signup');
              setError(null);
            }}
          />
          <Tab
            label={t('welcome.tab_login')}
            active={mode === 'login'}
            onPress={() => {
              setMode('login');
              setError(null);
            }}
          />
        </View>

        {/* ── Form ── */}
        <View style={{ gap: 14 }}>
          <Field label={t('welcome.field_email')}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('welcome.email_placeholder')}
              placeholderTextColor={LB.ink3}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={inputStyle}
            />
          </Field>
          <Field label={t('welcome.field_password')}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('welcome.password_placeholder')}
              placeholderTextColor={LB.ink3}
              secureTextEntry
              editable={!busy}
              style={inputStyle}
            />
          </Field>
          {error !== null && (
            <Text style={{ color: LB.danger, fontSize: 13, lineHeight: 18 }}>{error}</Text>
          )}
          {mode === 'login' && (
            <Pressable onPress={() => router.push('/reset-password')} hitSlop={8}>
              <Text
                style={{
                  fontSize: 13,
                  color: LB.ink2,
                  textDecorationLine: 'underline',
                }}
              >
                {t('welcome.forgot_password')}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── CTA pinned below scroll, always visible ── */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 8 }}>
        <Btn size="lg" full variant="primary" onPress={onSubmit} disabled={!canSubmit}>
          {busy
            ? t('welcome.busy')
            : mode === 'signup'
              ? t('welcome.signup_cta')
              : t('welcome.login_cta')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 11,
        borderRadius: 10,
        backgroundColor: active ? '#fff' : 'transparent',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: active ? LB.ink : LB.ink2,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ fontSize: 12, color: LB.ink2, fontWeight: '500', letterSpacing: 0.2 }}>
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
  borderRadius: 14,
  paddingHorizontal: 16,
  height: 52,
  fontSize: 15,
  color: LB.ink,
} as const;
