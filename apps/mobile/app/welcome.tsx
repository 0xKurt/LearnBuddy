// Sign up or sign in. CLAUDE.md rule 15: the CTA is pinned outside the
// ScrollView, inside a KeyboardAvoidingView, so the keyboard never hides it.
// The first impression: Buddy's soft light and orb, one headline, two pills to
// choose, soft white fields.

import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Glow } from '../components/lb/Glow.js';
import { Icon } from '../components/lb/Icon.js';
import { LbTextInput } from '../components/lb/LbTextInput.js';
import { Segmented } from '../components/lb/Segmented.js';
import { toast } from '../components/lb/Toast.js';
import { requestPasswordReset, signIn, signUp } from '../lib/auth/supabase.js';
import { messageFor } from '../lib/errors.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

export default function Welcome() {
  const { t } = useTranslation('auth');
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 8;

  async function submit() {
    setBusy(true);
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
      toast.show(messageFor(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      toast.show(t('welcome.reset_needs_email'), 'error');
      return;
    }
    try {
      await requestPasswordReset(email.trim());
    } catch {
      // Same answer either way: never reveal whether an address has an account.
    }
    toast.show(t('welcome.reset_sent'));
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
            paddingTop: 16,
            paddingBottom: 24,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: 14, marginBottom: 4 }}>
            <BuddyOrb size={88} />
            <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
              {t('welcome.title')}
            </Text>
            <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center', maxWidth: 420 }]}>
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
            onChange={setMode}
          />
          <View style={{ gap: 10 }}>
            <LbTextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('welcome.email')}
              accessibilityLabel={t('welcome.email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <LbTextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('welcome.password')}
              accessibilityLabel={t('welcome.password')}
              secureTextEntry={!shown}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              showToggle
              shown={shown}
              onToggle={() => setShown((s) => !s)}
              toggleAccessibilityLabel={
                shown ? t('welcome.hide_password') : t('welcome.show_password')
              }
            />
            {mode === 'signup' ? (
              <Text style={[TYPE.small, { paddingHorizontal: 4 }]}>
                {t('welcome.password_hint')}
              </Text>
            ) : null}
          </View>
          {mode === 'signin' ? (
            <Btn variant="ghost" pill onPress={() => void forgot()}>
              {t('welcome.forgot')}
            </Btn>
          ) : (
            <Card tone="lavender" padding={16}>
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
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <Btn size="lg" pill full disabled={!valid || busy} onPress={() => void submit()}>
            {mode === 'signup' ? t('welcome.cta_signup') : t('welcome.cta_signin')}
          </Btn>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
