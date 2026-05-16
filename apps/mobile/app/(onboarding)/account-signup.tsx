// Email + password signup. Doc 04 §auth + doc 05 §4.
//
// Calls POST /auth/account/signup. On success the API has created account,
// subscription (trial), and credit_bucket rows; mobile then drops the user
// on the verify-email screen until they confirm via the email link.

import { router } from 'expo-router';
import { useState } from 'react';
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
import { LB } from '../../lib/theme/colors.js';
import { signup } from '../../lib/api/auth.js';
import { ApiError } from '../../lib/api/client.js';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const canSubmit = trimmedEmail.length > 3 && password.length >= 8 && !busy;

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signup({
        email: trimmedEmail,
        password,
        locale: 'de',
        country_code: 'DE',
      });
      if (res.requires_verification) {
        router.push('/(onboarding)/verify-email');
      } else {
        // Dev path: API returned a session immediately (email-confirmed
        // up-front). Drop through the index router so the consent /
        // who-uses gate runs in one place.
        router.replace('/');
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'conflict') {
          setError('Diese E-Mail ist schon vergeben.');
        } else if (e.code === 'validation_failed' || e.status === 400) {
          setError('Bitte E-Mail und Passwort (≥ 8 Zeichen) prüfen.');
        } else {
          setError('Da ist gerade was schiefgelaufen. Probier’s gleich nochmal.');
        }
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 28,
            paddingTop: 32,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 14, marginTop: 24 }}>
            <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
              Konto erstellen
            </Text>
            <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
              Mit deiner E-Mail-Adresse und einem Passwort.
            </Text>

            <View style={{ marginTop: 18, gap: 12 }}>
              <Input
                placeholder="E-Mail"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
              <Input
                placeholder="Passwort (mindestens 8 Zeichen)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!busy}
              />
              {error && (
                <Text style={{ color: LB.danger ?? '#c0392b', fontSize: 12 }}>{error}</Text>
              )}
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ gap: 10 }}>
            <Btn size="lg" full variant={canSubmit ? 'primary' : 'ghost'} onPress={onSubmit}>
              {busy ? 'Moment …' : 'Konto erstellen'}
            </Btn>
            <Pressable
              onPress={() => router.push('/(onboarding)/hand-off-to-adult')}
              hitSlop={12}
              style={{ alignSelf: 'center', paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 12, color: LB.ink2, textDecorationLine: 'underline' }}>
                Ich bin jünger als 16
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
