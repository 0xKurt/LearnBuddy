import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function MinorConsentScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32, justifyContent: 'space-between' }}>
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
            Einwilligung für minderjähriges Profil
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            Ich willige in die Verarbeitung der Daten meines Kindes ein.
          </Text>
        </View>
        <Btn size="lg" full onPress={() => router.push('/(onboarding)/pin-setup')}>
          Einverstanden
        </Btn>
      </View>
    </SafeAreaView>
  );
}
