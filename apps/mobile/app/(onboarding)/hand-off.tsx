// Final onboarding screen. Drops into the learner surface.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function HandOffScreen() {
  const { t } = useTranslation('onboarding');
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
        <Text style={{ fontSize: 56 }}>✨</Text>
        <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6, textAlign: 'center' }}>
          {t('hand_off_final.title')}
        </Text>
        <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 21, textAlign: 'center' }}>
          {t('hand_off_final.subtitle')}
        </Text>
        <View style={{ width: '100%', marginTop: 24 }}>
          <Btn size="lg" full onPress={() => router.replace('/(learner)/home')}>
            {t('hand_off_final.cta')}
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}
