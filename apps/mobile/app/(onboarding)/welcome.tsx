// Auth landing. Standard tabbed pattern: Sign Up / Log In on one screen,
// email + password, single black CTA. No floating links, no overlay,
// nothing hidden. Doc 05 §1 + DESIGN-BRIEF §forms.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { signup } from '../../lib/api/auth.js';
import { ApiError } from '../../lib/api/client.js';
import { getSessionSync, setSession } from '../../lib/auth/session.js';
import { devResetAll } from '../../lib/dev/reset.js';
import { supabase } from '../../lib/supabase.js';
import { LB } from '../../lib/theme/colors.js';

type Mode = 'signup' | 'login';

export default function WelcomeScreen() {
  const [mode, setMode] = useState<Mode>('signup');
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
      if (mode === 'signup') {
        const res = await signup({
          email: trimmedEmail,
          password,
          locale: 'de',
          country_code: 'DE',
        });
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
            setError('Zu viele Versuche. Bitte ein paar Minuten warten.');
          } else {
            setError('E-Mail oder Passwort stimmt nicht.');
          }
          return;
        }
        // onAuthStateChange handles navigation.
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'conflict') setError('Diese E-Mail ist schon vergeben.');
        else if (e.code === 'validation_failed' || e.status === 400)
          setError('Bitte E-Mail und Passwort (mindestens 8 Zeichen) prüfen.');
        else setError('Da ist gerade was schiefgelaufen. Probier es gleich nochmal.');
      } else {
        setError('Keine Verbindung. Bitte später nochmal versuchen.');
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
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 28,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: LB.ink, letterSpacing: 0.5 }}>
              LearnBuddy
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

          {/* Tabs */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: LB.bg,
              borderRadius: 12,
              padding: 4,
              marginBottom: 24,
            }}
          >
            <Tab
              label="Registrieren"
              active={mode === 'signup'}
              onPress={() => setMode('signup')}
            />
            <Tab label="Anmelden" active={mode === 'login'} onPress={() => setMode('login')} />
          </View>

          {/* Headline */}
          <Text style={{ fontSize: 28, fontWeight: '700', color: LB.ink, letterSpacing: -0.5 }}>
            {mode === 'signup' ? 'Konto erstellen' : 'Willkommen zurück'}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, marginTop: 6, lineHeight: 20 }}>
            {mode === 'signup'
              ? 'Du brauchst nur eine E-Mail-Adresse und ein Passwort.'
              : 'Melde dich mit deiner E-Mail und deinem Passwort an.'}
          </Text>

          {/* Form */}
          <View style={{ marginTop: 24, gap: 12 }}>
            <Field label="E-Mail">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={LB.ink3}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                style={inputStyle}
              />
            </Field>
            <Field label="Passwort">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mindestens 8 Zeichen"
                placeholderTextColor={LB.ink3}
                secureTextEntry
                editable={!busy}
                style={inputStyle}
              />
            </Field>
            {error && <Text style={{ color: LB.danger, fontSize: 13, marginTop: 2 }}>{error}</Text>}
            {mode === 'login' && (
              <Pressable onPress={() => router.push('/reset-password')} hitSlop={8}>
                <Text
                  style={{
                    fontSize: 13,
                    color: LB.ink2,
                    textDecorationLine: 'underline',
                    marginTop: 4,
                  }}
                >
                  Passwort vergessen?
                </Text>
              </Pressable>
            )}
          </View>

          <View style={{ flex: 1 }} />

          <Btn
            size="lg"
            full
            variant={canSubmit ? 'primary' : 'ghost'}
            onPress={onSubmit}
            disabled={!canSubmit}
          >
            {busy ? 'Moment …' : mode === 'signup' ? 'Konto erstellen' : 'Anmelden'}
          </Btn>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: active ? '#fff' : 'transparent',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: active ? LB.ink : LB.ink2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: LB.ink2, fontWeight: '500' }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: '#fff',
  borderColor: LB.hairline,
  borderWidth: 1,
  borderRadius: 12,
  paddingHorizontal: 14,
  height: 50,
  fontSize: 15,
  color: LB.ink,
} as const;
