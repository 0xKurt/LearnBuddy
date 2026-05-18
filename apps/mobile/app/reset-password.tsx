// Password reset. Doc 04 §Auth (client-side via Supabase SDK) + Doc 05 §login.
//
// Two phases on one screen:
//   Phase 1 — user types email, screen calls resetPasswordForEmail. We
//             surface a confirmation banner. The link in the email points
//             back to learnbuddy://reset-password.
//   Phase 2 — opened from the email deep-link. Tokens land in the URL
//             fragment; supabase.auth.setSession mints a recovery session.
//             We swap to the new-password form, then call updateUser.
//
// On a successful save we persist via lib/auth/session.ts and replace to '/'
// so app/index.tsx routes onward via GET /account.

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, LbTextInput } from '../components/lb/index.js';
import { getSessionSync, setSession } from '../lib/auth/session.js';
import { parseAuthTokensFromUrl, supabase } from '../lib/supabase.js';
import { LB } from '../lib/theme/colors.js';

type Phase = 'request' | 'new_password';

export default function ResetPasswordScreen() {
  const { t } = useTranslation('auth');
  const [phase, setPhase] = useState<Phase>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string | null) {
      if (cancelled || handledRef.current || !url) return;
      const tokens = parseAuthTokensFromUrl(url);
      if (!tokens) return;
      handledRef.current = true;
      const res = await supabase.auth.setSession(tokens);
      if (res.error) {
        setError(t('reset.error_link_expired'));
        handledRef.current = false;
        return;
      }
      // Recovery session is now active; switch to the new-password form.
      setPhase('new_password');
      setInfo(null);
      setError(null);
    }

    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {
        /* simulator cold-start sometimes throws */
      });
    const urlSub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      cancelled = true;
      urlSub.remove();
    };
  }, [t]);

  async function onRequestLink() {
    const trimmed = email.trim();
    if (trimmed.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: Linking.createURL('/reset-password'),
      });
      if (err) {
        setError(t('reset.error_generic'));
        return;
      }
      setInfo(t('reset.request_sent'));
    } finally {
      setBusy(false);
    }
  }

  async function onSavePassword() {
    if (password.length < 8 || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: err } = await supabase.auth.updateUser({ password });
      if (err || !data.user) {
        setError(t('reset.error_generic'));
        return;
      }
      const session = (await supabase.auth.getSession()).data.session;
      if (session) {
        const existing = getSessionSync();
        await setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          user_id: session.user.id,
          account_id: existing?.account_id ?? '',
        });
      }
      setInfo(t('reset.saved'));
      router.replace('/');
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
              fontSize: 26,
              fontWeight: '600',
              color: LB.ink,
              letterSpacing: -0.5,
            }}
          >
            {phase === 'request' ? t('reset.request_title') : t('reset.new_title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {phase === 'request' ? t('reset.request_body') : t('reset.new_body')}
          </Text>

          <View style={{ marginTop: 18, gap: 12 }}>
            {phase === 'request' ? (
              <LbTextInput
                placeholder={t('reset.email_placeholder')}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={onRequestLink}
                editable={!busy}
              />
            ) : (
              <LbTextInput
                placeholder={t('reset.new_placeholder')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={onSavePassword}
                editable={!busy}
                showToggle
                shown={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                toggleAccessibilityLabel={
                  showPassword ? t('reset.hide_password') : t('reset.show_password')
                }
              />
            )}
            {info && <Text style={{ color: LB.ink2, fontSize: 12 }}>{info}</Text>}
            {error && <Text style={{ color: LB.danger ?? '#c0392b', fontSize: 12 }}>{error}</Text>}
          </View>
        </View>

        <Btn
          size="lg"
          full
          variant={
            phase === 'request'
              ? email.trim().length > 3
                ? 'primary'
                : 'ghost'
              : password.length >= 8
                ? 'primary'
                : 'ghost'
          }
          onPress={phase === 'request' ? onRequestLink : onSavePassword}
        >
          {busy
            ? t('welcome.busy')
            : phase === 'request'
              ? t('reset.request_cta')
              : t('reset.new_cta')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
