// Login. Doc 04 §Auth + Doc 05 §login.
//
// Email + password only. Magic link removed — it requires a working email
// pipeline and adds little for a single-account family-mode app where the
// password flow is already there. Password reset link is kept for the case
// the adult forgets the password.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../components/lb/index.js';
import { getSessionSync, setSession } from '../lib/auth/session.js';
import { supabase } from '../lib/supabase.js';
import { LB } from '../lib/theme/colors.js';

export default function LoginScreen() {
  const { t } = useTranslation('auth');
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

        <Btn size="lg" full variant="primary" onPress={onSubmit}>
          {busy ? 'Moment …' : t('login.password_cta')}
        </Btn>
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
