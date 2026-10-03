// Three calm cards after the profile, before the first conversation: how to
// talk to Buddy (write / speak / photo), what photos become, and that Buddy
// thinks ahead. Skippable at every step — the app explains itself in use too
// (docs/UX-PRINCIPLES.md; owner request 2026-09-28). The get-to-know itself is
// no form: it is Buddy's first conversation.

import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { Glow } from '../components/lb/Glow.js';
import { Icon, type IconName } from '../components/lb/Icon.js';
import { FamilyChoice, ModeChoice } from '../components/lb/LookChoice.js';
import { useMe, useSettings } from '../lib/api/queries.js';
import { gateRoute } from '../lib/gate.js';
import { registerDeviceForPush } from '../lib/push.js';
import { useAnnounce } from '../lib/announce.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { formDensity } from '../lib/keyboard.js';
import { useVisibleHeight } from '../lib/useVisibleHeight.js';
import { SPACE, bottomRoom } from '../lib/theme/space.js';

// The look comes last: it is the one answer she sees IMMEDIATELY — the next screen is
// already in the colours she picked (issue #136). Three tips deep in the settings, nobody
// ever found it.
const STEPS = ['s1', 's2', 's3', 's4'] as const;

/** Survives the remount a palette change causes (issue #171); reset when she is done. */
const keptStep = { at: 0 };
/** The three ways in, shown on the first card (decorative — the body names them). */
const WAYS: IconName[] = ['keyboard', 'mic', 'camera'];

export default function Onboarding() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');
  /**
   * Which card she is on. Kept outside the component (issue #171): a palette change
   * remounts the tree so every native view picks up the new colours (lib/theme/
   * ThemeProvider.tsx), and the colour choice sits on the LAST card — so without this she
   * would tap a colour and land back on the first card, which is exactly what #148 saw.
   * A module ref, not storage: it belongs to this run of the app, not to the device.
   */
  const [step, setStepValue] = useState(keptStep.at);
  const setStep = (next: number | ((s: number) => number)) => {
    setStepValue((s) => {
      const value = typeof next === 'function' ? next(s) : next;
      keptStep.at = value;
      return value;
    });
  };
  const view = useVisibleHeight();
  const compact = formDensity(view.window, view.overlap) !== 'roomy';
  const key = STEPS[step] ?? 's1';
  const last = step === STEPS.length - 1;
  const settings = useSettings();
  // Where she belongs, already answered: `/me` is in the cache since the gate sent her here.
  const me = useMe();
  const done = () => {
    keptStep.at = 0;
    // Contact was allowed at registration: ask the OS right after the card
    // that explained why (permissions come with their context, never earlier).
    if (settings.data?.contact_enabled) void registerDeviceForPush().catch(() => undefined);
    // Straight to where she belongs, not through `/` (issue #208, point 4). `/` renders NOTHING
    // while it decides — a `<Redirect>`, and with a cold `/me` the 250 ms `LoadingState`
    // deliberately waits before appearing. MEASURED, per frame, in `tests/web/tour.spec.ts`:
    // seven empty frames in a row over `/`, three without it. Seven is exactly the "4–6 frames"
    // the owner reported. The decision is not duplicated: it is the same `gateRoute` the start
    // screen uses, on the same cached answer. Without that answer `/` still decides.
    router.replace(me.data ? gateRoute(me.data) : '/');
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
            {/* The same two controls as in the settings (issue #172): dots for the
                colours, a segmented control for light/dark. One question, one component,
                and nothing to learn twice. */}
            <FamilyChoice />
            <ModeChoice />
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
