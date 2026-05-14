// Under-16 friendly redirect. Doc 05 §3 + handoff ScreenHandOff.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function HandOffToAdultScreen() {
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
          gap: 18,
        }}
      >
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 30,
            backgroundColor: LB.primaryLt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 48 }}>👋</Text>
        </View>
        <Text
          style={{
            fontSize: 24,
            fontWeight: '600',
            color: LB.ink,
            letterSpacing: -0.5,
            textAlign: 'center',
          }}
        >
          {t('hand_off_adult.title')}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: LB.ink2,
            lineHeight: 21,
            textAlign: 'center',
            maxWidth: 300,
          }}
        >
          {t('hand_off_adult.body')}
        </Text>
        <View style={{ marginTop: 24, width: '100%' }}>
          <Btn size="lg" full onPress={() => router.replace('/(onboarding)/age-check')}>
            {t('hand_off_adult.cta')}
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}
