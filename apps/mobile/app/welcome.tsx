// Sign up or sign in. CLAUDE.md rule 15: the CTA is pinned outside the
// ScrollView, inside a KeyboardAvoidingView, so the keyboard never hides it.
// The first impression: Buddy's soft light and orb, one headline, two pills to
// choose, soft white fields. Problems stay on the screen (a text above the CTA,
// field errors below their field) — never only a vanishing toast.

import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Glow } from '../components/lb/Glow.js';
import { Icon } from '../components/lb/Icon.js';
import { LbTextInput } from '../components/lb/LbTextInput.js';
import { Segmented } from '../components/lb/Segmented.js';
import { LanguageFlags } from '../components/lb/LanguageFlags.js';
import { useAnnounce } from '../lib/announce.js';
import { MIN_PASSWORD_LENGTH, looksLikeEmail } from '../lib/auth/recovery.js';
import { AuthFailure, requestPasswordReset, signIn, signUp } from '../lib/auth/supabase.js';
import { messageFor } from '../lib/errors.js';
import { chooseDeviceLocale, currentLocale } from '../lib/i18n/index.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

export default function Welcome() {
  const { t } = useTranslation(['auth', 'common']);
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [shown, setShown] = useState(false);
  const [shownRepeat, setShownRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  // The screen follows the device language; a tap on a flag switches at once,
  // and the choice flows into the profile step (which saves it to the learner).
  const lang = currentLocale();
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Validation appears once a field was left, never while first typing it.
  const [touched, setTouched] = useState({ email: false, password: false });
  // A problem stays visible above the CTA until the next attempt or edit.
  const [failure, setFailure] = useState<string | null>(null);
  const [failureSeq, setFailureSeq] = useState(0);
  const passwordRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);
  const inFlight = useRef(false);
  // A small phone (e.g. 360×740) gets a smaller orb and tighter spacing, so the
  // under-16 hint and the pinned CTA fit without scrolling (CLAUDE.md rule 16).
  const compact = useWindowDimensions().height < 780;
  const gap = compact ? 8 : 14;

  const emailOk = looksLikeEmail(email.trim());
  // Sign-in never enforces the sign-up rule: older accounts may have shorter
  // passwords (the server's minimum differs) — the server answers, not the button.
  const passwordOk =
    mode === 'signin' ? password.length > 0 : password.length >= MIN_PASSWORD_LENGTH;
  // Owner decision (2026-09-28): the sign-up password is typed twice — a typo
  // must be seen, not discovered at the first sign-in.
  const repeatOk = mode === 'signin' || repeat === password;
  const valid = emailOk && passwordOk && repeatOk;

  const emailError = touched.email && email.trim().length > 0 && !emailOk;
  const passwordError =
    mode === 'signup' &&
    touched.password &&
    password.length > 0 &&
    password.length < MIN_PASSWORD_LENGTH;
  // Like NewPasswordFields: the repeat only complains once something is in it.
  const repeatError = mode === 'signup' && repeat.length > 0 && repeat !== password;

  useAnnounce(confirmSent ? t('welcome.confirm_title') : null);
  useAnnounce(resetSent ? t('welcome.reset_sent') : null);
  useAnnounce(failure, { key: failureSeq });

  const fail = (text: string) => {
    setFailure(text);
    setFailureSeq((s) => s + 1);
  };
  const clearFailure = () => setFailure(null);

  async function submit() {
    if (inFlight.current || !valid) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      if (mode === 'signup') {
        const signedIn = await signUp(email.trim(), password);
        if (!signedIn) {
          setConfirmSent(true);
          setMode('signin');
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      router.replace('/');
    } catch (err) {
      if (err instanceof AuthFailure && err.reason === 'already_registered') {
        // The message says "sign in" — take her there, values stay filled in.
        setMode('signin');
        passwordRef.current?.focus();
      }
      fail(messageFor(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function forgot() {
    if (resetBusy || resetSent) return;
    if (!looksLikeEmail(email.trim())) {
      fail(t('welcome.reset_needs_email'));
      return;
    }
    setResetBusy(true);
    setFailure(null);
    try {
      await requestPasswordReset(email.trim());
      setResetSent(true);
    } catch (err) {
      if (
        err instanceof AuthFailure &&
        (err.reason === 'network' || err.reason === 'rate_limited')
      ) {
        // A request that never left the phone must not pretend a mail is coming.
        fail(messageFor(err));
        return;
      }
      // Same answer either way: never reveal whether an address has an account.
      setResetSent(true);
    } finally {
      setResetBusy(false);
    }
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
            paddingTop: compact ? 4 : 16,
            paddingBottom: 24,
            gap,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* The very first thing: pick your language with one tap on a flag
              (owner decision 2026-09-28). */}
          <LanguageFlags value={lang} onChange={chooseDeviceLocale} compact={compact} />
          <View style={{ alignItems: 'center', gap, marginBottom: 4 }}>
            <BuddyOrb size={compact ? 52 : 88} />
            <Text
              accessibilityRole="header"
              style={[compact ? TYPE.displaySm : TYPE.display, { textAlign: 'center' }]}
            >
              {t('welcome.title')}
            </Text>
            <Text
              style={[
                compact ? TYPE.small : TYPE.body,
                { color: LB.ink2, textAlign: 'center', maxWidth: 420 },
              ]}
            >
              {t('welcome.body')}
            </Text>
          </View>

          {confirmSent ? (
            <Card tone="mint">
              <Text style={TYPE.title}>{t('welcome.confirm_title')}</Text>
              <Text style={[TYPE.body, { marginTop: 4 }]}>{t('welcome.confirm_body')}</Text>
            </Card>
          ) : null}

          <Segmented
            options={[
              { value: 'signup', label: t('welcome.mode_signup') },
              { value: 'signin', label: t('welcome.mode_signin') },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              clearFailure();
            }}
          />
          <View style={{ gap: 10 }}>
            <LbTextInput
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                clearFailure();
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              placeholder={t('welcome.email')}
              accessibilityLabel={t('welcome.email')}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="email"
              keyboardType="email-address"
              // On sign-up, iOS AutoFill pairs a `username` field with `newPassword`
              // to offer a strong password and save the credential.
              textContentType={mode === 'signup' ? 'username' : 'emailAddress'}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!busy}
              error={emailError}
              errorMessage={emailError ? t('error.invalid_email') : undefined}
            />
            <LbTextInput
              ref={passwordRef}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearFailure();
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              placeholder={t('welcome.password')}
              accessibilityLabel={t('welcome.password')}
              secureTextEntry={!shown}
              // Also while shown: capitalisation and autocorrect would rewrite the
              // password the moment the eye is tapped.
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              returnKeyType={mode === 'signup' ? 'next' : 'go'}
              {...(mode === 'signup' ? { submitBehavior: 'submit' as const } : {})}
              onSubmitEditing={() =>
                mode === 'signup' ? repeatRef.current?.focus() : void submit()
              }
              editable={!busy}
              showToggle
              shown={shown}
              onToggle={() => setShown((s) => !s)}
              toggleAccessibilityLabel={
                shown ? t('welcome.hide_password') : t('welcome.show_password')
              }
              error={passwordError}
              errorMessage={passwordError ? t('welcome.password_hint') : undefined}
            />
            {mode === 'signup' ? (
              <LbTextInput
                ref={repeatRef}
                value={repeat}
                onChangeText={(v) => {
                  setRepeat(v);
                  clearFailure();
                }}
                placeholder={t('welcome.password_repeat')}
                accessibilityLabel={t('welcome.password_repeat')}
                secureTextEntry={!shownRepeat}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                editable={!busy}
                showToggle
                shown={shownRepeat}
                onToggle={() => setShownRepeat((s) => !s)}
                toggleAccessibilityLabel={
                  shownRepeat ? t('welcome.hide_password') : t('welcome.show_password')
                }
                error={repeatError}
                errorMessage={repeatError ? t('new_password.mismatch') : undefined}
              />
            ) : null}
            {mode === 'signup' && !passwordError && !repeatError ? (
              <Text style={[TYPE.small, { paddingHorizontal: 4 }]}>
                {t('welcome.password_hint')}
              </Text>
            ) : null}
          </View>
          {mode === 'signin' ? (
            resetSent ? (
              <Card tone="mint">
                <Text style={TYPE.body}>{t('welcome.reset_sent')}</Text>
              </Card>
            ) : (
              <Btn variant="ghost" pill busy={resetBusy} onPress={() => void forgot()}>
                {t('welcome.forgot')}
              </Btn>
            )
          ) : (
            <Card tone="lavender" padding={compact ? 12 : 16}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: LB.paper,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="shield" size={18} color={LB.primaryDk} />
                </View>
                <Text style={[TYPE.small, { flex: 1, color: LB.ink }]}>
                  {t('welcome.minor_hint')}
                </Text>
              </View>
            </Card>
          )}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 8 }}>
          {failure ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[TYPE.small, { color: LB.danger, textAlign: 'center' }]}
            >
              {failure}
            </Text>
          ) : null}
          <Btn size="lg" pill full busy={busy} disabled={!valid} onPress={() => void submit()}>
            {mode === 'signup' ? t('welcome.cta_signup') : t('welcome.cta_signin')}
          </Btn>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
