import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function VerifyEmailScreen() {
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
        <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink, textAlign: 'center', letterSpacing: -0.4 }}>
          Bestätige deine E-Mail
        </Text>
        <Text style={{ fontSize: 14, color: LB.ink2, textAlign: 'center', lineHeight: 21, maxWidth: 300 }}>
          Wir haben dir einen Link geschickt. Tippe ihn an, dann geht es hier weiter.
        </Text>
        <Btn size="lg" full onPress={() => router.push('/(onboarding)/consent')}>
          Weiter
        </Btn>
      </View>
    </SafeAreaView>
  );
}
