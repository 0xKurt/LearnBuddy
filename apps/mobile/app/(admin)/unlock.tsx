// Admin unlock — biometric + PIN gate. Doc 05 §admin-surface.
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function AdminUnlockScreen() {
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
        <Text style={{ fontSize: 56 }}>🔒</Text>
        <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink, textAlign: 'center', letterSpacing: -0.4 }}>
          Konto entsperren
        </Text>
        <Text style={{ fontSize: 13, color: LB.ink2, textAlign: 'center', lineHeight: 19, maxWidth: 280 }}>
          Mit Face ID oder deiner 4-stelligen PIN.
        </Text>
        <View style={{ width: '100%', marginTop: 24, gap: 10 }}>
          <Btn size="lg" full onPress={() => router.replace('/(admin)/overview')}>
            Mit Face ID entsperren
          </Btn>
          <Btn size="lg" full variant="ghost" onPress={() => router.back()}>
            Abbrechen
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}
