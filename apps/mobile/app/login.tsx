// Login. Doc 04 §Auth ("Login and password reset handled client-side via
// Supabase Auth SDK. No custom API endpoints.") + Doc 05 §login.
//
// Three signin paths share this screen:
//   1. Email + password — supabase.auth.signInWithPassword.
//   2. Magic link — supabase.auth.signInWithOtp, deep-link redirects back here.
//   3. Forgot password — navigates to /reset-password.
//
// On a successful SIGNED_IN (from any path) we persist the session via
// lib/auth/session.ts and replace to '/' so app/index.tsx routes the user
// onward via GET /account.

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../components/lb/index.js';
import { getSessionSync, setSession } from '../lib/auth/session.js';
import { parseAuthTokensFromUrl, supabase } from '../lib/supabase.js';
import { LB } from '../lib/theme/colors.js';

export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const handledRef = useRef(false);

  const trimmedEmail = email.trim();
  const canPassword = trimmedEmail.length > 3 && password.length >= 8 && !busy;
  const canMagic = trimmedEmail.length > 3 && !busy;

  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string | null) {
      if (cancelled || handledRef.current || !url) return;
      const tokens = parseAuthTokensFromUrl(url);
      if (!tokens) return;
      handledRef.current = true;
      const res = await supabase.auth.setSession(tokens);
      if (res.error) {
        setError(t('login.error_generic'));
        handledRef.current = false;
      }
    }

    const sub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled || event !== 'SIGNED_IN' || !session) return;
      const existing = getSessionSync();
      await setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
        account_id: existing?.account_id ?? '',
      });
      router.replace('/');
    });

    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {
        /* simulator cold-start sometimes throws; non-fatal */
      });
    const urlSub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
      urlSub.remove();
    };
  }, [t]);

  async function onPasswordLogin() {
    if (!canPassword) return;
    setBusy(true);
    setError(null);
    setInfo(null);
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

  async function onMagicLink() {
    if (!canMagic) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: { emailRedirectTo: 'learnbuddy://login' },
      });
      if (err) {
        const msg = err.message?.toLowerCase() ?? '';
        if (msg.includes('rate') || msg.includes('too many')) {
          setError(t('login.error_rate_limited'));
        } else {
          setError(t('login.error_generic'));
        }
        return;
      }
      setInfo(t('login.magic_link_sent'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 28,
          paddingVertical: 32,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '600',
              color: LB.ink,
              letterSpacing: -0.6,
            }}
          >
            {t('login.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {t('login.subtitle')}
          </Text>

          <View style={{ marginTop: 18, gap: 12 }}>
            <Input
              placeholder={t('login.email_placeholder')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            <Input
              placeholder={t('login.password_placeholder')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
            />
            {info && <Text style={{ color: LB.ink2, fontSize: 12 }}>{info}</Text>}
            {error && <Text style={{ color: LB.danger ?? '#c0392b', fontSize: 12 }}>{error}</Text>}
            <Pressable onPress={() => router.push('/reset-password')} disabled={busy}>
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

        <View style={{ gap: 10 }}>
          <Btn size="lg" full variant={canPassword ? 'primary' : 'ghost'} onPress={onPasswordLogin}>
            {busy ? 'Moment …' : t('login.password_cta')}
          </Btn>
          <Btn size="lg" full variant={canMagic ? 'outline' : 'ghost'} onPress={onMagicLink}>
            {t('login.magic_link_cta')}
          </Btn>
        </View>
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
