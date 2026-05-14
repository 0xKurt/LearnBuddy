// Profile creation. Doc 05 §8.
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function AddProfileScreen() {
  const [name, setName] = useState('');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32, justifyContent: 'space-between' }}>
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            Profil anlegen
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Vorname"
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
              marginTop: 12,
            }}
          />
        </View>
        <Btn size="lg" full onPress={() => router.push('/(onboarding)/pin-setup')}>
          Weiter
        </Btn>
      </View>
    </SafeAreaView>
  );
}
