// Sign up or sign in. CLAUDE.md rule 15: the CTA is pinned outside the
// ScrollView, inside <KeyboardSafe>, so the keyboard never hides it.
// The first impression: Buddy's soft light and orb, one headline, two pills to
// choose, soft white fields. Problems stay on the screen (a text above the CTA,
// field errors below their field) — never only a vanishing toast.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View, type TextInput } from 'react-native';
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
import { WaitHint } from '../components/lb/WaitHint.js';
import { useAnnounce } from '../lib/announce.js';
import { MIN_PASSWORD_LENGTH, looksLikeEmail } from '../lib/auth/recovery.js';
import {
  AuthFailure,
  requestPasswordReset,
  signIn,
  signUp,
  resendConfirmation,
} from '../lib/auth/supabase.js';
import { messageFor } from '../lib/errors.js';
import { chooseDeviceLocale, currentLocale } from '../lib/i18n/index.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { KeyboardSafe } from '../components/lb/KeyboardSafe.js';
import { formDensity } from '../lib/keyboard.js';
import { useVisibleHeight } from '../lib/useVisibleHeight.js';

/** How long before the confirmation mail may be sent again (issue #132). */
const RESEND_COOLDOWN_S = 60;

export default function Welcome() {
  const { palette } = useTheme();
  const { t } = useTranslation(['auth', 'common']);
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [shown, setShown] = useState(false);
  const [shownRepeat, setShownRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  /** The address the mail went to, so the card can show it: a typo is invisible otherwise. */
  const [confirmEmail, setConfirmEmail] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  /** Seconds until the mail may be sent again — Supabase rate-limits it, and so do we. */
  const [resendIn, setResendIn] = useState(0);
  // The screen follows the device language; a tap on a flag switches at once,
  // and the choice flows into the profile step (which saves it to the learner).
  const lang = currentLocale();
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Validation appears once a field was left, never while first typing it.
  const [touched, setTouched] = useState({ email: false, password: false });
  // A problem stays visible above the CTA until the next attempt or edit.
  const [failure, setFailure] = useState<string | null>(null);
  /** The sign-in failed because the address is unconfirmed: the resend belongs right here. */
  const [notConfirmed, setNotConfirmed] = useState(false);
  const [failureSeq, setFailureSeq] = useState(0);
  // She tapped the waiting CTA: from then on the line above it says what is still
  // missing (issue #97). Counted, so every further tap announces it again.
  const [whyWait, setWhyWait] = useState(0);
  const passwordRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);
  const inFlight = useRef(false);
  // A small phone (e.g. 360×740) gets a smaller orb and tighter spacing, so the
  // under-16 hint and the pinned CTA fit without scrolling (CLAUDE.md rule 16). Decided on
  // what is VISIBLE: with the keyboard up the window keeps its height (edge-to-edge), and a
  // roomy layout then left one field above the pinned CTA and hid the others and their
  // errors below it (issue #289).
  const view = useVisibleHeight();
  const density = formDensity(view.window, view.overlap);
  const compact = density !== 'roomy';
  // While she types, only the form fits (567 pt on the owner's phone, ~440 on a 360×740).
  const tight = density === 'tight';

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

  // The first thing still missing, in form order — shown once she asked (tap on the
  // waiting CTA) and gone with the button's muted skin when everything is filled.
  const waitHint = !emailOk
    ? t('welcome.cta_hint_email')
    : !passwordOk
      ? t('welcome.cta_hint_password')
      : !repeatOk
        ? t('welcome.cta_hint_repeat')
        : null;

  // Counts down while the card is up; cleared with it, so nothing ticks in the background.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);
  useAnnounce(confirmSent ? t('welcome.confirm_title') : null);
  useAnnounce(resetSent ? t('welcome.reset_sent') : null);
  useAnnounce(failure, { key: failureSeq });
  useAnnounce(whyWait > 0 ? waitHint : null, { key: whyWait });

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
          setConfirmEmail(email.trim());
          setConfirmSent(true);
          setMode('signin');
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      router.replace('/');
    } catch (err) {
      setNotConfirmed(err instanceof AuthFailure && err.reason === 'email_not_confirmed');
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

  /**
   * The mail again (issue #132). Supabase's links expire and spam filters eat them; without
   * this a family is locked out of the account they just made, with nothing in the app to
   * click. The cooldown is ours as well as theirs — a second tap two seconds later helps
   * nobody and can trip the provider's own limit.
   */
  async function resend() {
    if (resendBusy || resendIn > 0) return;
    const to = (confirmEmail || email).trim();
    if (!looksLikeEmail(to)) {
      fail(t('welcome.reset_needs_email'));
      return;
    }
    setResendBusy(true);
    setFailure(null);
    try {
      await resendConfirmation(to);
      setConfirmEmail(to);
      setConfirmSent(true);
      setResendIn(RESEND_COOLDOWN_S);
    } catch (err) {
      // A request that never left the phone must not pretend a mail is coming.
      fail(messageFor(err));
    } finally {
      setResendBusy(false);
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

  // Signing up carries two rows more than signing in (the repeated password and the note
  // for under-16s): it gets the tighter layout on every phone, so nothing waits below the
  // edge unseen (issue #55, caught by tests/web/fit.ts).
  const dense = compact || mode === 'signup';
  const gap = dense ? 8 : 14;
  // A small phone signing up has no room for the orb: the headline carries the brand,
  // and every field must be visible without scrolling (issue #55, tests/web/fit.ts).
  const showOrb = !(compact && mode === 'signup');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <Glow height={420} />
      <KeyboardSafe style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: dense ? 4 : 16,
            paddingBottom: 24,
            gap,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* While she types (`tight`), only the form fits: the flags, Buddy and the words
              above it wait until the keyboard goes — the form starts at the choice of
              signing up or in, and every field with its error stays above the pinned CTA
              (issue #289, tests/web/visible.spec.ts). */}
          {tight ? null : (
            <>
              {/* The very first thing: pick your language with one tap on a flag
                  (owner decision 2026-09-28). */}
              <LanguageFlags value={lang} onChange={chooseDeviceLocale} compact={dense} />
              <View style={{ alignItems: 'center', gap, marginBottom: 4 }}>
                {showOrb ? <BuddyOrb size={dense ? 52 : 88} /> : null}
                <Text
                  accessibilityRole="header"
                  style={[dense ? TYPE.displaySm : TYPE.display, { textAlign: 'center' }]}
                >
                  {t('welcome.title')}
                </Text>
                {/* Never clamped: the two-line cap from issue #55 outlived the tall layout it
                    was for and cut the sentence mid-word on 360×740 while ~70 pt sat free
                    below (issue #95). The page still fits both phones — tests/web/fit.ts. */}
                <Text
                  style={[
                    dense ? TYPE.small : TYPE.body,
                    { color: palette.ink2, textAlign: 'center', maxWidth: 420 },
                  ]}
                >
                  {t('welcome.body')}
                </Text>
              </View>
            </>
          )}

          {confirmSent ? (
            <Card tone="mint">
              <Text style={TYPE.title}>{t('welcome.confirm_title')}</Text>
              <Text style={[TYPE.body, { marginTop: 4 }]}>
                {t('welcome.confirm_body', { email: confirmEmail })}
              </Text>
              <Text style={[TYPE.small, { marginTop: 4 }]}>{t('welcome.confirm_spam')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Btn
                  variant="outline"
                  size="sm"
                  pill
                  busy={resendBusy}
                  disabled={resendIn > 0}
                  onPress={() => void resend()}
                >
                  {resendIn > 0 ? t('welcome.confirm_wait') : t('welcome.confirm_resend')}
                </Btn>
                <Btn
                  variant="ghost"
                  size="sm"
                  pill
                  onPress={() => {
                    setConfirmSent(false);
                    setConfirmEmail('');
                    setMode('signup');
                    setEmail('');
                  }}
                >
                  {t('welcome.confirm_other')}
                </Btn>
              </View>
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
                // A corrected address may ask for a fresh reset mail (review 28.09.).
                setResetSent(false);
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              placeholder={t('welcome.email')}
              accessibilityLabel={t('welcome.email')}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              clearable
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
            <Card tone="lavender" padding={dense ? 12 : 16}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: palette.paper,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="shield" size={18} color={palette.primaryDk} />
                </View>
                <Text style={[TYPE.small, { flex: 1, color: palette.ink }]}>
                  {t('welcome.minor_hint')}
                </Text>
              </View>
            </Card>
          )}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 8 }}>
          {failure ? (
            <>
              <Text
                accessibilityLiveRegion="polite"
                style={[TYPE.small, { color: palette.danger, textAlign: 'center' }]}
              >
                {failure}
              </Text>
              {/* Told to confirm an address, with no way to get the mail again, is a dead
                  end — and the card that had the button may be long gone (issue #132). */}
              {notConfirmed ? (
                <Btn
                  variant="ghost"
                  size="sm"
                  pill
                  busy={resendBusy}
                  disabled={resendIn > 0}
                  onPress={() => void resend()}
                >
                  {resendIn > 0 ? t('welcome.confirm_wait') : t('welcome.confirm_resend')}
                </Btn>
              ) : null}
            </>
          ) : whyWait > 0 ? (
            <WaitHint>{waitHint}</WaitHint>
          ) : null}
          <Btn
            size="lg"
            pill
            full
            busy={busy}
            disabled={!valid}
            onDisabledPress={() => setWhyWait((n) => n + 1)}
            onPress={() => void submit()}
          >
            {mode === 'signup' ? t('welcome.cta_signup') : t('welcome.cta_signin')}
          </Btn>
        </View>
      </KeyboardSafe>
    </SafeAreaView>
  );
}
