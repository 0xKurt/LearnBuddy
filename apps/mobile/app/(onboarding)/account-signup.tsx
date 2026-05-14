// Email + password signup. Doc 05 §4.
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32, justifyContent: 'space-between' }}>
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            Konto erstellen
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            Mit deiner E-Mail-Adresse und einem Passwort. Wir senden einen Bestätigungs-Link.
          </Text>

          <View style={{ marginTop: 18, gap: 12 }}>
            <Input placeholder="E-Mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Input placeholder="Passwort" value={password} onChangeText={setPassword} secureTextEntry />
          </View>
        </View>

        <Btn size="lg" full onPress={() => router.push('/(onboarding)/verify-email')}>
          Weiter
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
