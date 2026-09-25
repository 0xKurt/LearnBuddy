// A new password from the reset e-mail (lib/auth/supabase.ts
// requestPasswordReset leads here). The link's session is opened in the
// Supabase client only; the app's session is saved once the new password is
// set, then the start screen routes on. An expired, used or foreign link gets a
// calm explanation and the way back. CLAUDE.md rule 15: the CTA is pinned
// outside the ScrollView, inside a KeyboardAvoidingView (like app/welcome.tsx).

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NewPasswordFields } from '../components/auth/NewPasswordFields.js';
import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Glow } from '../components/lb/Glow.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { toast } from '../components/lb/Toast.js';
import { clearAdminToken } from '../lib/admin.js';
import { queryClient } from '../lib/api/queries.js';
import {
  parseRecoveryUrl,
  passwordProblem,
  withoutSecrets,
  type RecoveryLink,
} from '../lib/auth/recovery.js';
import { currentSession } from '../lib/auth/session.js';
import {
  abandonRecovery,
  AuthFailure,
  finishRecovery,
  startRecovery,
} from '../lib/auth/supabase.js';
import { messageFor } from '../lib/errors.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

// On the web the page address is the link; kept from load time in case the
// router touches the address bar before this screen reads it.
const pageUrlAtLoad =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;

type Phase = 'checking' | 'offline' | 'invalid' | 'form';

function pickLink(latest: string | null): { url: string | null; link: RecoveryLink } {
  for (const url of [latest, pageUrlAtLoad]) {
    const link = parseRecoveryUrl(url);
    if (link.kind !== 'invalid') return { url, link };
  }
  return { url: latest, link: { kind: 'invalid' } };
}

export default function ResetPassword() {
  const { t } = useTranslation('auth');
  // The newest URL the app was opened with (also when it was already running).
  const latestUrl = Linking.useLinkingURL();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const handled = useRef<string | null>(null);
  const current = useRef<RecoveryLink>({ kind: 'invalid' });

  const open = useCallback(async (link: RecoveryLink) => {
    setPhase('checking');
    try {
      await startRecovery(link);
      setPhase('form');
    } catch (err) {
      setPhase(err instanceof AuthFailure && err.reason === 'network' ? 'offline' : 'invalid');
    }
  }, []);

  useEffect(() => {
    const { url, link } = pickLink(latestUrl);
    const key = url ?? '';
    if (handled.current === key) return;
    handled.current = key;
    current.current = link;
    // The tokens are read; they should not stay in the address bar or the history.
    if (Platform.OS === 'web' && typeof window !== 'undefined' && link.kind !== 'invalid') {
      window.history.replaceState(null, '', withoutSecrets(window.location.href));
    }
    if (link.kind === 'invalid') setPhase('invalid');
    else void open(link);
  }, [latestUrl, open]);

  const valid = passwordProblem(password, repeat) === null;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const before = currentSession()?.user_id ?? null;
      await finishRecovery(password);
      // Signed in as someone else before: nothing of theirs may stay on screen.
      if (before !== currentSession()?.user_id) {
        clearAdminToken();
        queryClient.clear();
      }
      toast.show(t('reset.saved'));
      router.replace('/');
    } catch (err) {
      if (err instanceof AuthFailure && err.reason === 'link_invalid') setPhase('invalid');
      else toast.show(messageFor(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    void abandonRecovery();
    router.replace(currentSession() ? '/' : '/welcome');
  }

  const backLabel = currentSession() ? t('reset.back_app') : t('reset.back_signin');

  if (phase === 'checking') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg }}>
        <Glow height={320} />
        <LoadingState label={t('reset.checking')} />
      </SafeAreaView>
    );
  }

  if (phase === 'invalid' || phase === 'offline') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg }}>
        <Glow height={420} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 28,
            paddingBottom: 24,
            gap: 18,
          }}
        >
          <View style={{ alignItems: 'center', gap: 14 }}>
            <BuddyOrb size={72} />
            <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
              {t('reset.title')}
            </Text>
          </View>
          <Card tone={phase === 'offline' ? 'sky' : 'butter'} padding={20}>
            <Text style={TYPE.title}>
              {phase === 'offline' ? t('reset.offline_title') : t('reset.invalid_title')}
            </Text>
            <Text style={[TYPE.body, { marginTop: 4 }]}>
              {phase === 'offline' ? t('reset.offline_body') : t('reset.invalid_body')}
            </Text>
          </Card>
          <View style={{ gap: 10 }}>
            {phase === 'offline' ? (
              <Btn pill full onPress={() => void open(current.current)}>
                {t('reset.retry')}
              </Btn>
            ) : null}
            <Btn variant={phase === 'offline' ? 'ghost' : 'primary'} pill full onPress={leave}>
              {backLabel}
            </Btn>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg }}>
      <Glow height={420} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 28,
            paddingBottom: 24,
            gap: 18,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: 14 }}>
            <BuddyOrb size={72} />
            <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
              {t('reset.title')}
            </Text>
          </View>
          <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center' }]}>
            {t('reset.body')}
          </Text>
          <NewPasswordFields
            password={password}
            repeat={repeat}
            onChangePassword={setPassword}
            onChangeRepeat={setRepeat}
            onSubmit={() => void save()}
          />
          <Btn variant="ghost" pill center onPress={leave}>
            {backLabel}
          </Btn>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <Btn size="lg" pill full disabled={!valid || busy} onPress={() => void save()}>
            {busy ? t('reset.saving') : t('reset.cta')}
          </Btn>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
