// Three calm cards after the profile, before the first conversation: how to
// talk to Buddy (write / speak / photo), what photos become, and that Buddy
// thinks ahead. Skippable at every step — the app explains itself in use too
// (docs/UX-PRINCIPLES.md; owner request 2026-09-28). The get-to-know itself is
// no form: it is Buddy's first conversation.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SetupStep } from '../components/auth/SetupStep.js';
import { Btn } from '../components/lb/Btn.js';
import type { IconName } from '../components/lb/Icon.js';
import { IconDisc } from '../components/lb/IconDisc.js';
import { FamilyChoice, ModeChoice } from '../components/lb/LookChoice.js';
import { prefetchHome, useMe, useSettings } from '../lib/api/queries.js';
import { gateRoute } from '../lib/gate.js';
import { registerDeviceForPush } from '../lib/push.js';
import { useAnnounce } from '../lib/announce.js';
import { formDensity } from '../lib/keyboard.js';
import { useVisibleHeight } from '../lib/useVisibleHeight.js';
import { INTRO } from '../lib/theme/intro.js';
import { RHYTHM, SPACE } from '../lib/theme/space.js';

// The look comes last: it is the one answer she sees IMMEDIATELY — the next screen is
// already in the colours she picked (issue #136). Three tips deep in the settings, nobody
// ever found it.
const STEPS = ['s1', 's2', 's3', 's4'] as const;

/** Survives the remount a palette change causes (issue #171); reset when she is done. */
const keptStep = { at: 0 };
/** The three ways in, shown on the first card (decorative — the body names them). */
const WAYS: IconName[] = ['keyboard', 'mic', 'camera'];

export default function Onboarding() {
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
  const next = me.data ? gateRoute(me.data) : null;
  // The home is loaded before she leaves the cards, so it stands there with its words the moment
  // she does — not as a wordless skeleton for a round trip (issue #392, measured per frame in
  // tests/web/tour.spec.ts). The profile step starts it as soon as the learner exists; this
  // covers an app that opens on the cards. Only when the home is where she goes: a learner who
  // still has to consent would only be refused.
  useEffect(() => {
    if (next === '/buddy') prefetchHome();
  }, [next]);
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
    router.replace(next ?? '/');
  };

  useAnnounce(`${t(`onboarding.${key}_title`)}. ${t(`onboarding.${key}_body`)}`, { key: step });

  return (
    <SetupStep
      orbState={last ? 'happy' : 'idle'}
      title={t(`onboarding.${key}_title`)}
      lead={t(`onboarding.${key}_body`)}
      step={t('onboarding.step_label', { n: step + 1, count: STEPS.length })}
      footer={
        <>
          <Btn size="lg" pill full onPress={() => (last ? done() : setStep((s) => s + 1))}>
            {last ? t('onboarding.start') : t('onboarding.next')}
          </Btn>
          {last ? null : (
            <Btn variant="ghost" pill onPress={done}>
              {t('onboarding.skip')}
            </Btn>
          )}
        </>
      }
    >
      {key === 's4' ? (
        <View style={{ gap: compact ? SPACE.sm : SPACE.md }}>
          <FamilyChoice variant="onboarding" />
          <ModeChoice />
        </View>
      ) : null}
      {step === 0 ? (
        <View
          accessibilityElementsHidden
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', gap: RHYTHM.sections, marginTop: SPACE.xs }}
        >
          {WAYS.map((way) => (
            <IconDisc key={way} name={way} size={INTRO.wayFace} iconSize={INTRO.wayGlyph} />
          ))}
        </View>
      ) : null}
    </SetupStep>
  );
}
