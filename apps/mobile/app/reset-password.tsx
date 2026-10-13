// A new password from the reset e-mail (lib/auth/supabase.ts
// requestPasswordReset leads here). The link's session is opened in the
// Supabase client only; the app's session is saved once the new password is
// set, then the start screen routes on. An expired, used or foreign link gets a
// calm explanation and the way back. CLAUDE.md rule 15: the CTA is pinned
// outside the ScrollView, inside the shared KeyboardSafe wrapper.

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NewPasswordFields } from '../components/auth/NewPasswordFields.js';
import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { Field } from '../components/lb/Field.js';
import { Glow } from '../components/lb/Glow.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { toast } from '../components/lb/Toast.js';
import { clearAdminToken } from '../lib/admin.js';
import { queryClient } from '../lib/api/queries.js';
import {
  looksLikeEmail,
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
  requestPasswordReset,
  startRecovery,
} from '../lib/auth/supabase.js';
import { messageFor } from '../lib/errors.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { GUTTER_OUTER, pinnedBar } from '../lib/theme/space.js';
import { RESET } from '../lib/theme/reset.js';
import { KeyboardSafe } from '../components/lb/KeyboardSafe.js';

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
  const { palette } = useTheme();
  const { t } = useTranslation('auth');
  // The newest URL the app was opened with (also when it was already running).
  const latestUrl = Linking.useLinkingURL();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetTouched, setResetTouched] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetFailure, setResetFailure] = useState<string | null>(null);
  const requesting = useRef(false);
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
      // The confirmation is for the start screen the replace() leads to (issue #91).
      toast.show(t('reset.saved'), 'info', { survivesNavigation: true });
      router.replace('/');
    } catch (err) {
      if (err instanceof AuthFailure && err.reason === 'link_invalid') setPhase('invalid');
      else toast.show(messageFor(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function requestLink() {
    if (requesting.current || !looksLikeEmail(resetEmail.trim()) || resetSent) return;
    requesting.current = true;
    setResetBusy(true);
    setResetFailure(null);
    try {
      await requestPasswordReset(resetEmail.trim());
      setResetSent(true);
    } catch (err) {
      if (err instanceof AuthFailure && (err.reason === 'network' || err.reason === 'rate_limited'))
        setResetFailure(messageFor(err));
      else setResetSent(true); // Same answer for every account outcome, as on Welcome.
    } finally {
      requesting.current = false;
      setResetBusy(false);
    }
  }

  function leave() {
    void abandonRecovery();
    router.replace(currentSession() ? '/' : '/welcome');
  }

  const backLabel = currentSession() ? t('reset.back_app') : t('reset.back_signin');

  if (phase === 'checking') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <Glow />
        <LoadingState label={t('reset.checking')} />
      </SafeAreaView>
    );
  }

  if (phase === 'invalid' || phase === 'offline') {
    const offline = phase === 'offline';
    const emailError =
      resetTouched && resetEmail.trim().length > 0 && !looksLikeEmail(resetEmail.trim());
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <Glow />
        <KeyboardSafe style={{ flex: 1 }}>
          <ResetPage
            title={t(offline ? 'reset.offline_title' : 'reset.invalid_title')}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[TYPE.body, { color: palette.ink2 }]}>
              {t(offline ? 'reset.offline_body' : 'reset.invalid_body')}
            </Text>
            {offline ? null : (
              <Field
                label={t('welcome.email')}
                accessibilityLabel={t('welcome.email')}
                value={resetEmail}
                onChangeText={(value) => {
                  setResetEmail(value);
                  setResetSent(false);
                  setResetFailure(null);
                }}
                onBlur={() => setResetTouched(true)}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="send"
                editable={!resetBusy}
                onSubmitEditing={() => void requestLink()}
                error={emailError}
                errorMessage={emailError ? t('error.invalid_email') : undefined}
              />
            )}
            {resetSent ? (
              <Text accessibilityRole="alert" style={TYPE.meta}>
                {t('welcome.reset_sent')}
              </Text>
            ) : null}
            {resetFailure ? (
              <Text accessibilityRole="alert" style={[TYPE.meta, { color: palette.danger }]}>
                {resetFailure}
              </Text>
            ) : null}
          </ResetPage>
          <View style={[pinnedBar(0), { gap: RESET.gap, paddingBottom: RESET.bottom }]}>
            <Btn
              full
              size="lg"
              busy={resetBusy}
              disabled={!offline && (resetSent || !looksLikeEmail(resetEmail.trim()))}
              onPress={() => (offline ? void open(current.current) : void requestLink())}
            >
              {t(offline ? 'reset.retry' : 'reset.request')}
            </Btn>
            <Btn variant="ghost" full disabled={resetBusy} onPress={leave}>
              {backLabel}
            </Btn>
          </View>
        </KeyboardSafe>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <Glow />
      <KeyboardSafe style={{ flex: 1 }}>
        <ResetPage title={t('reset.title')} keyboardShouldPersistTaps="handled">
          <Text style={[TYPE.body, { color: palette.ink2 }]}>{t('reset.body')}</Text>
          <NewPasswordFields
            password={password}
            repeat={repeat}
            onChangePassword={setPassword}
            onChangeRepeat={setRepeat}
            onSubmit={() => void save()}
            editable={!busy}
          />
          {/* Not while saving: leaving then would change the password without a word
              (p2-leave-during-save-race). */}
          <Btn variant="ghost" pill center disabled={busy} onPress={leave}>
            {backLabel}
          </Btn>
        </ResetPage>
        {/* The SafeAreaView keeps the bottom edge: no inset left to clear. */}
        <View style={[pinnedBar(0), { paddingBottom: RESET.bottom }]}>
          <Btn
            size="lg"
            pill
            full
            busy={busy}
            disabled={!valid || busy}
            onPress={() => void save()}
          >
            {busy ? t('reset.saving') : t('reset.cta')}
          </Btn>
        </View>
      </KeyboardSafe>
    </SafeAreaView>
  );
}

/**
 * The page every phase after the check shares: Buddy, the title, what the phase says and its
 * field in one column at one distance (design ui_kits/app/Flows.jsx `ResetInvalid`). Both password
 * and resend forms keep taps while the keyboard is up.
 */
function ResetPage({
  title,
  keyboardShouldPersistTaps,
  children,
}: {
  title: string;
  keyboardShouldPersistTaps?: 'handled';
  children: ReactNode;
}) {
  return (
    <ScrollView
      contentContainerStyle={{
        // The margin before the app (design tokens/space.css `--space-gutter`).
        paddingHorizontal: GUTTER_OUTER,
        paddingTop: RESET.top,
        paddingBottom: RESET.gap,
        gap: RESET.gap,
      }}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    >
      <View style={{ alignItems: 'flex-start' }}>
        <BuddyOrb size={RESET.orb} />
      </View>
      <Text accessibilityRole="header" style={TYPE.pageHeadline}>
        {title}
      </Text>
      {children}
    </ScrollView>
  );
}
