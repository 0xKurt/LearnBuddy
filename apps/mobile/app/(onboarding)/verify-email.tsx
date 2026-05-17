// Verify email screen. Doc 04 §Auth ("Login and password reset handled
// client-side via Supabase Auth SDK") + Doc 05 §Onboarding step 5
// "Polls Supabase auth state. Deep-link handling: tapping the verification
// link in the email returns the user here with the session ready."
//
// Three paths land the user on this screen with (or without) a session:
//
//   1. Cold start from the email link — Linking.getInitialURL() returns the
//      `learnbuddy://verify-email#access_token=…` URL; we feed it to
//      supabase.auth.setSession.
//   2. Warm start from the email link — Linking.addEventListener fires.
//   3. Manual "Ich hab's bestätigt" tap — the user verified on another
//      device. We call supabase.auth.getSession() in case the SDK already
//      hydrated, otherwise show an actionable German error.
//
// On SIGNED_IN we persist tokens through lib/auth/session.ts (which writes
// expo-secure-store) and navigate to the consent screen.

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { getSessionSync, setSession } from '../../lib/auth/session.js';
import { parseAuthTokensFromUrl, supabase } from '../../lib/supabase.js';
import { LB } from '../../lib/theme/colors.js';

export default function VerifyEmailScreen() {
  const { t } = useTranslation('auth');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError(t('verify_email.error_expired'));
        handledRef.current = false;
      }
      // onAuthStateChange fires on success; navigation happens there.
    }

    const sub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled || event !== 'SIGNED_IN' || !session) return;
      if (!session.user.email) return;
      // signup() doesn't persist an account_id when Supabase requires email
      // verification (no session minted yet); A2's GET /account refresh will
      // backfill. Keep whatever account_id we already have, otherwise empty.
      const existing = getSessionSync();
      await setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
        account_id: existing?.account_id ?? '',
      });
      router.replace('/(onboarding)/consent');
    });

    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {
        /* getInitialURL can throw on simulator cold start — non-fatal */
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

  async function onManualCheck() {
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.getSession();
      if (err || !data.session) {
        setError(t('verify_email.error_not_yet'));
        return;
      }
      // onAuthStateChange will fire and handle navigation; if for some
      // reason it has already fired and unsubscribed, force-forward.
      if (!handledRef.current) {
        router.replace('/(onboarding)/consent');
      }
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
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: '600',
            color: LB.ink,
            textAlign: 'center',
            letterSpacing: -0.4,
          }}
        >
          {t('verify_email.title')}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: LB.ink2,
            textAlign: 'center',
            lineHeight: 21,
            maxWidth: 300,
          }}
        >
          {t('verify_email.body')}
        </Text>
        {error && (
          <Text
            style={{
              color: LB.danger ?? '#c0392b',
              fontSize: 12,
              textAlign: 'center',
              maxWidth: 300,
            }}
          >
            {error}
          </Text>
        )}
        <Btn size="lg" full variant="ghost" onPress={onManualCheck}>
          {busy ? t('verify_email.busy') : t('verify_email.cta')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
