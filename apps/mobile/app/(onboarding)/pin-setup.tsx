// PIN + biometric setup. Doc 05 §10. Stored in expo-secure-store.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function PinSetupScreen() {
  const { t } = useTranslation('onboarding');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32, justifyContent: 'space-between' }}>
        <View style={{ gap: 16, marginTop: 24 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              backgroundColor: LB.primaryLt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 36 }}>🔒</Text>
          </View>
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            {t('pin.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>{t('pin.subtitle')}</Text>
        </View>
        <View style={{ gap: 10 }}>
          <Btn size="lg" full onPress={() => router.push('/(onboarding)/hand-off')}>
            {t('pin.cta_face_id')}
          </Btn>
          <Btn size="lg" full variant="ghost" onPress={() => router.push('/(onboarding)/hand-off')}>
            {t('pin.cta_skip')}
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}
