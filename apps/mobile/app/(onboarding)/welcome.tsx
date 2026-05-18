// Auth landing. Standard tabbed pattern: Sign Up / Log In on one screen,
// email + password, single black CTA. Button is inside the ScrollView with
// a flex-1 spacer — the only pattern that reliably shows the CTA on both
// iOS and Android regardless of screen size. Doc 05 §1 + DESIGN-BRIEF §forms.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Icon, LbTextInput } from '../../components/lb/index.js';
import { signup } from '../../lib/api/auth.js';
import { ApiError } from '../../lib/api/client.js';
import { getSessionSync, setSession } from '../../lib/auth/session.js';
import { devResetAll } from '../../lib/dev/reset.js';
import { i18n } from '../../lib/i18n/index.js';
import { type AppLocale } from '../../lib/i18n/locale-storage.js';
import { useAppStore } from '../../lib/store/index.js';
import { supabase } from '../../lib/supabase.js';
import { LB } from '../../lib/theme/colors.js';

const LOCALE_COUNTRY: Record<AppLocale, string> = {
  de: 'DE',
  en: 'US',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
};

type Mode = 'signup' | 'login';

export default function WelcomeScreen() {
  const { t } = useTranslation('auth');
  const setPendingBirthYear = useAppStore((s) => s.set_pending_birth_year);
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedAge, setAcceptedAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [emailFormatError, setEmailFormatError] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const birthYearRef = useRef<TextInput>(null);

  const trimmedEmail = email.trim();
  const passwordsMatch = mode === 'login' || password === confirmPassword;
  const parsedBirthYear = (() => {
    if (mode !== 'signup') return null;
    const n = Number.parseInt(birthYear, 10);
    const currentYear = new Date().getUTCFullYear();
    return Number.isFinite(n) && n >= 1920 && n <= currentYear ? n : null;
  })();
  const signupReady = parsedBirthYear !== null && acceptedTerms && acceptedAge;
  const canSubmit =
    trimmedEmail.length > 3 &&
    password.length >= 8 &&
    passwordsMatch &&
    !busy &&
    (mode === 'login' || signupReady);

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
        const appLocale = (i18n.language ?? 'de') as AppLocale;
        const res = await signup({
          email: trimmedEmail,
          password,
          locale: appLocale,
          country_code: LOCALE_COUNTRY[appLocale],
        });
        Keyboard.dismiss();
        if (parsedBirthYear !== null) setPendingBirthYear(parsedBirthYear);
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
                <Text
                  style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}
                >
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
                setConfirmPassword('');
                setBirthYear('');
                setAcceptedTerms(false);
                setAcceptedAge(false);
              }}
            />
            <Tab
              label={t('welcome.tab_login')}
              active={mode === 'login'}
              onPress={() => {
                setMode('login');
                setError(null);
                setConfirmPassword('');
              }}
            />
          </View>

          {/* ── Form ── */}
          <View style={{ gap: 14 }}>
            <Field label={t('welcome.field_email')}>
              <LbTextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setEmailFormatError(false);
                }}
                onBlur={onEmailBlur}
                placeholder={t('welcome.email_placeholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!busy}
                error={emailFormatError}
                errorMessage={emailFormatError ? t('welcome.error_email_format') : undefined}
              />
            </Field>
            <Field label={t('welcome.field_password')}>
              <LbTextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder={t('welcome.password_placeholder')}
                secureTextEntry={!showPassword}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                returnKeyType={mode === 'signup' ? 'next' : 'go'}
                onSubmitEditing={mode === 'signup' ? () => confirmRef.current?.focus() : onSubmit}
                editable={!busy}
                showToggle
                shown={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                toggleAccessibilityLabel={
                  showPassword ? t('welcome.hide_password') : t('welcome.show_password')
                }
              />
              {mode === 'signup' && password.length > 0 && <PasswordStrength password={password} />}
            </Field>
            {mode === 'signup' && (
              <Field label={t('welcome.field_confirm')}>
                <LbTextInput
                  ref={confirmRef}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={t('welcome.placeholder_confirm')}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() => birthYearRef.current?.focus()}
                  editable={!busy}
                  error={confirmPassword.length > 0 && !passwordsMatch}
                  errorMessage={
                    confirmPassword.length > 0 && !passwordsMatch
                      ? t('welcome.error_password_mismatch')
                      : undefined
                  }
                />
              </Field>
            )}
            {mode === 'signup' && (
              <Field label={t('welcome.field_birth_year')}>
                <LbTextInput
                  ref={birthYearRef}
                  value={birthYear}
                  onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
                  placeholder={t('welcome.placeholder_birth_year')}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={onSubmit}
                  editable={!busy}
                />
              </Field>
            )}
            {mode === 'signup' && (
              <View style={{ gap: 10, marginTop: 4 }}>
                <WelcomeCheckbox
                  value={acceptedTerms}
                  onChange={setAcceptedTerms}
                  label={t('welcome.consent_terms')}
                />
                <WelcomeCheckbox
                  value={acceptedAge}
                  onChange={setAcceptedAge}
                  label={t('welcome.consent_age')}
                />
              </View>
            )}
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

        {/* ── CTA pinned below scroll, lifted above keyboard by KeyboardAvoidingView ── */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 20,
            backgroundColor: LB.paper,
            borderTopColor: LB.hairline,
            borderTopWidth: 1,
          }}
        >
          <Btn size="lg" full variant="primary" onPress={onSubmit} disabled={!canSubmit}>
            {busy
              ? t('welcome.busy')
              : mode === 'signup'
                ? t('welcome.signup_cta')
                : t('welcome.login_cta')}
          </Btn>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{ flex: 1 }}
    >
      <View
        style={{
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
      </View>
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

function WelcomeCheckbox({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: value ? LB.primary : LB.ink4,
          backgroundColor: value ? LB.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {value && <Icon name="check" size={14} color="#fff" />}
      </View>
      <Text style={{ flex: 1, fontSize: 12, color: LB.ink2, lineHeight: 18 }}>{label}</Text>
    </Pressable>
  );
}

function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH_COLORS = ['#e0e0e0', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71'];

function PasswordStrength({ password }: { password: string }) {
  const score = passwordStrength(password);
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
      {[1, 2, 3, 4].map((level) => (
        <View
          key={level}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: score >= level ? STRENGTH_COLORS[score] : '#e0e0e0',
          }}
        />
      ))}
    </View>
  );
}
