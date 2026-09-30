// Three calm cards after the profile, before the first conversation: how to
// talk to Buddy (write / speak / photo), what photos become, and that Buddy
// thinks ahead. Skippable at every step — the app explains itself in use too
// (docs/UX-PRINCIPLES.md; owner request 2026-09-28). The get-to-know itself is
// no form: it is Buddy's first conversation.

import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { Glow } from '../components/lb/Glow.js';
import { Icon, type IconName } from '../components/lb/Icon.js';
import { FamilyChoice, ModeChoice } from '../components/lb/LookChoice.js';
import { useSettings } from '../lib/api/queries.js';
import { registerDeviceForPush } from '../lib/push.js';
import { useAnnounce } from '../lib/announce.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { SPACE, bottomRoom } from '../lib/theme/space.js';

// The look comes last: it is the one answer she sees IMMEDIATELY — the next screen is
// already in the colours she picked (issue #136). Three tips deep in the settings, nobody
// ever found it.
const STEPS = ['s1', 's2', 's3', 's4'] as const;
/** The three ways in, shown on the first card (decorative — the body names them). */
const WAYS: IconName[] = ['keyboard', 'mic', 'camera'];

export default function Onboarding() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');
  const [step, setStep] = useState(0);
  const compact = useWindowDimensions().height < 780;
  const key = STEPS[step] ?? 's1';
  const last = step === STEPS.length - 1;
  const settings = useSettings();
  const done = () => {
    // Contact was allowed at registration: ask the OS right after the card
    // that explained why (permissions come with their context, never earlier).
    if (settings.data?.contact_enabled) void registerDeviceForPush().catch(() => undefined);
    router.replace('/');
  };

  useAnnounce(`${t(`onboarding.${key}_title`)}. ${t(`onboarding.${key}_body`)}`, { key: step });

  return (
    // The bottom inset belongs to the footer below, not to the frame as well (#64).
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.bg }}>
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
        <BuddyOrb size={key === 's4' ? 56 : compact ? 72 : 96} state={last ? 'happy' : 'idle'} />
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {t(`onboarding.${key}_title`)}
        </Text>
        <Text style={[TYPE.body, { color: palette.ink2, textAlign: 'center', maxWidth: 340 }]}>
          {t(`onboarding.${key}_body`)}
        </Text>
        {key === 's4' ? (
          <View style={{ alignSelf: 'stretch', gap: compact ? SPACE.sm : SPACE.md }}>
            <FamilyChoice compact />
            <ModeChoice compact />
          </View>
        ) : null}
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
                  backgroundColor: palette.paper,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={way} size={24} color={palette.primaryDk} />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: bottomRoom(insets.bottom, SPACE.md),
          gap: SPACE.md,
          alignItems: 'center',
        }}
      >
        <View
          // The dots say where she is; `accessible` makes them one thing with a name
          // instead of a bare label on a box, which ARIA forbids (axe: aria-prohibited-attr,
          // issue #73).
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('onboarding.step_label', { n: step + 1, count: STEPS.length })}
          accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}
          style={{ flexDirection: 'row', gap: 8 }}
        >
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === step ? palette.primary : palette.ink4,
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
