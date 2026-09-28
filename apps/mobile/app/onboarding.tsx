// Three calm cards after the profile, before the first conversation: how to
// talk to Buddy (write / speak / photo), what photos become, and that Buddy
// thinks ahead. Skippable at every step — the app explains itself in use too
// (docs/UX-PRINCIPLES.md; owner request 2026-09-28). The get-to-know itself is
// no form: it is Buddy's first conversation.

import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { Glow } from '../components/lb/Glow.js';
import { Icon, type IconName } from '../components/lb/Icon.js';
import { useAnnounce } from '../lib/announce.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

const STEPS = ['s1', 's2', 's3'] as const;
/** The three ways in, shown on the first card (decorative — the body names them). */
const WAYS: IconName[] = ['keyboard', 'mic', 'camera'];

export default function Onboarding() {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(0);
  const compact = useWindowDimensions().height < 780;
  const key = STEPS[step] ?? 's1';
  const last = step === STEPS.length - 1;
  const done = () => router.replace('/');

  useAnnounce(`${t(`onboarding.${key}_title`)}. ${t(`onboarding.${key}_body`)}`, { key: step });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg }}>
      <Glow height={420} />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          gap: compact ? 14 : 18,
        }}
      >
        <BuddyOrb size={compact ? 72 : 96} state={last ? 'happy' : 'idle'} />
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {t(`onboarding.${key}_title`)}
        </Text>
        <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center', maxWidth: 340 }]}>
          {t(`onboarding.${key}_body`)}
        </Text>
        {step === 0 ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}
          >
            {WAYS.map((way) => (
              <View
                key={way}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: LB.paper,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={way} size={24} color={LB.primaryDk} />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12, alignItems: 'center' }}>
        <View
          accessibilityLabel={t('onboarding.step_label', { n: step + 1, count: STEPS.length })}
          style={{ flexDirection: 'row', gap: 8 }}
        >
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === step ? LB.primary : LB.ink4,
              }}
            />
          ))}
        </View>
        <Btn size="lg" pill full onPress={() => (last ? done() : setStep((s) => s + 1))}>
          {last ? t('onboarding.start') : t('onboarding.next')}
        </Btn>
        {last ? null : (
          <Btn variant="ghost" pill onPress={done}>
            {t('onboarding.skip')}
          </Btn>
        )}
      </View>
    </SafeAreaView>
  );
}
