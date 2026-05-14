// Branching: solo adult vs. parent + minor. Doc 05 §7.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function WhoUsesScreen() {
  const { t } = useTranslation('onboarding');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32, gap: 18 }}>
        <Text
          style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6, marginTop: 24 }}
        >
          {t('who_uses.title')}
        </Text>
        <View style={{ gap: 12, marginTop: 18 }}>
          <Card onPress={() => router.push('/(onboarding)/add-profile?for=self')} padding={20}>
            <Text style={{ fontSize: 24, marginBottom: 6 }}>🧑</Text>
            <Text style={{ fontSize: 17, fontWeight: '600', color: LB.ink }}>{t('who_uses.self')}</Text>
            <Text style={{ fontSize: 12, color: LB.ink2, marginTop: 4 }}>
              Solo-Lerner, 16+
            </Text>
          </Card>
          <Card onPress={() => router.push('/(onboarding)/add-profile?for=child')} padding={20}>
            <Text style={{ fontSize: 24, marginBottom: 6 }}>👨‍👧</Text>
            <Text style={{ fontSize: 17, fontWeight: '600', color: LB.ink }}>{t('who_uses.child')}</Text>
            <Text style={{ fontSize: 12, color: LB.ink2, marginTop: 4 }}>
              Du legst das Profil deines Kindes an
            </Text>
          </Card>
        </View>
      </View>
    </SafeAreaView>
  );
}
