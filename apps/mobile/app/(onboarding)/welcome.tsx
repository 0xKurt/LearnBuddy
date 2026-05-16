// Welcome — first screen after language pick. Doc 05 §1 + DESIGN-BRIEF.
//
// Soft pastel maximalism per the brief: tinted background panel, italic
// display headline, friendly hero card with feature pills, black-pill
// primary CTA.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function WelcomeScreen() {
  const { t } = useTranslation('onboarding');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 24,
          justifyContent: 'space-between',
        }}
      >
        {/* Hero card */}
        <View
          style={{
            flex: 1,
            backgroundColor: LB.peach,
            borderRadius: 28,
            paddingHorizontal: 26,
            paddingVertical: 32,
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 12,
                color: LB.primaryDk,
                fontWeight: '700',
                letterSpacing: 1.4,
              }}
            >
              LEARNBUDDY
            </Text>
            <Text
              style={{
                fontSize: 44,
                fontWeight: '600',
                fontStyle: 'italic',
                color: LB.ink,
                letterSpacing: -1.2,
                lineHeight: 50,
                marginTop: 14,
              }}
            >
              {t('welcome.title')}
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: LB.ink2,
                lineHeight: 24,
                marginTop: 18,
              }}
            >
              {t('welcome.subtitle')}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginTop: 24,
              flexWrap: 'wrap',
            }}
          >
            <Pill emoji="📸" label="Foto" tone={LB.lavender} />
            <Pill emoji="✍️" label="Üben" tone={LB.mint} />
            <Pill emoji="🎯" label="Tests" tone={LB.blush} />
          </View>
        </View>

        {/* CTA block */}
        <View style={{ gap: 14, marginTop: 22 }}>
          <Btn size="lg" full onPress={() => router.push('/(onboarding)/account-signup')}>
            {t('welcome.cta')}
          </Btn>
          <Pressable
            onPress={() => router.push('/login')}
            hitSlop={12}
            style={{ alignSelf: 'center' }}
          >
            <Text style={{ fontSize: 13, color: LB.ink2, textDecorationLine: 'underline' }}>
              {t('welcome.signin_link')}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Pill({ emoji, label, tone }: { emoji: string; label: string; tone: string }) {
  return (
    <View
      style={{
        backgroundColor: tone,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text style={{ fontSize: 13, color: LB.ink, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
