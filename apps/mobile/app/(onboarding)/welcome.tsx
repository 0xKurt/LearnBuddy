// Welcome — first screen on cold start. Doc 05 §1 + handoff ScreenWelcome.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function WelcomeScreen() {
  const { t } = useTranslation('onboarding');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32, justifyContent: 'space-between' }}>
        <View style={{ gap: 12, marginTop: 60 }}>
          <Text style={{ fontSize: 14, color: LB.ink3, fontWeight: '500', letterSpacing: 0.5 }}>
            LEARNBUDDY
          </Text>
          <Text
            style={{
              fontSize: 36,
              fontWeight: '600',
              color: LB.ink,
              letterSpacing: -0.8,
              lineHeight: 42,
            }}
          >
            {t('welcome.title')}
          </Text>
          <Text style={{ fontSize: 15, color: LB.ink2, lineHeight: 22, marginTop: 8 }}>
            {t('welcome.subtitle')}
          </Text>
        </View>

        <Btn size="lg" full onPress={() => router.push('/(onboarding)/age-check')}>
          {t('welcome.cta')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
