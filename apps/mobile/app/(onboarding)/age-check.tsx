// Age check. Branches under-16 to hand-off-to-adult; 16+ proceeds to signup.
// Doc 05 §2.
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { devResetAll } from '../../lib/dev/reset.js';
import { LB } from '../../lib/theme/colors.js';

export default function AgeCheckScreen() {
  const { t } = useTranslation('onboarding');
  const [year, setYear] = useState<number | null>(null);
  const currentYear = new Date().getFullYear();
  const choices = Array.from({ length: 20 }, (_, i) => currentYear - i - 1);

  const onContinue = () => {
    if (!year) return;
    const age = currentYear - year;
    if (age < 16) router.push('/(onboarding)/hand-off-to-adult');
    else router.push('/(onboarding)/account-signup');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 28,
          paddingVertical: 32,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 12, marginTop: 24 }}>
          {__DEV__ && (
            <Pressable
              onPress={() =>
                void devResetAll().then(() => router.replace('/(onboarding)/language' as never))
              }
              style={{ alignSelf: 'flex-end' }}
            >
              <View
                style={{
                  backgroundColor: '#d1361c',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}
                >
                  DEV · RESET
                </Text>
              </View>
            </Pressable>
          )}
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            {t('age_check.title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 21 }}>
            {t('age_check.subtitle')}
          </Text>

          <View
            style={{
              marginTop: 18,
              maxHeight: 360,
              backgroundColor: LB.bg,
              borderRadius: 14,
              padding: 4,
            }}
          >
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}
            >
              {choices.slice(0, 12).map((y) => {
                const on = y === year;
                return (
                  <Pressable
                    key={y}
                    onPress={() => setYear(y)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: y === year }}
                    accessibilityLabel={String(y)}
                    style={{ margin: 4 }}
                  >
                    <View
                      style={{
                        backgroundColor: on ? LB.primary : '#fff',
                        paddingVertical: 12,
                        paddingHorizontal: 18,
                        borderRadius: 10,
                        minWidth: 88,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: on ? '#fff' : LB.ink, fontWeight: '600' }}>{y}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Btn size="lg" full onPress={onContinue} disabled={!year}>
          {t('age_check.cta')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
