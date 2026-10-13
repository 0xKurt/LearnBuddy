// One step of the setup that asks or tells one thing (issues #518, #526): Buddy's orb, a headline,
// what the step says, and its answers pinned at the bottom. Privacy, the profile, the notification
// question, the hand-over, the voice and the cards before the first conversation are this one
// shell, so they stand and breathe alike (Engineering-Regel 6: the same thing looks the same).
// Design: ui_kits/app/Onboarding.jsx `OnbPage` — small orb left, the count at its right, the
// title left, the actions in the bar below; nothing above the orb.

import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER_OUTER, pinnedBar, SPACE } from '../../lib/theme/space.js';
import { ONBOARDING } from '../../lib/theme/onboarding.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb, type MoonState } from '../lb/BuddyOrb.js';
import { Screen } from '../lb/Screen.js';
import { KeyboardSafe } from '../lb/KeyboardSafe.js';
import { FormFrameContext, useFormViewport } from '../lb/FormFrameClearance.js';
import { setupStep, type SetupStation } from './setupSteps.js';

export function SetupStep({
  title,
  orbState,
  children,
  footer,
  lead,
  step,
  scrollTestID,
  keyboardSafe = false,
}: {
  title: string;
  orbState?: MoonState;
  lead?: string;
  /** Which of the setup's four this page belongs to; a page that settles nothing has none. */
  step?: SetupStation;
  scrollTestID?: string;
  /** Editable forms keep their fields and pinned action above the keyboard. */
  keyboardSafe?: boolean;
  /** What the step says or offers, under the headline. */
  children: ReactNode;
  /** Its answers, pinned at the bottom: the one main action first, a way back or out below. */
  footer: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const form = useFormViewport();
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  // The design's "x von 4"; at the end counted as it was walked, or not at all (setupSteps.ts).
  const at = step ? setupStep(step) : null;
  const count = at ? t('onboarding.step_label', at) : null;
  const content = (
    <>
      <ScrollView
        ref={form.scroll}
        onLayout={form.controller.refresh}
        onContentSizeChange={form.controller.refresh}
        onScroll={(event) => {
          form.offset.current = event.nativeEvent.contentOffset.y;
        }}
        testID={scrollTestID}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-start',
          paddingHorizontal: GUTTER_OUTER,
          paddingTop: ONBOARDING.top,
          paddingBottom: ONBOARDING.bottom,
          gap: ONBOARDING.gap,
        }}
      >
        <View style={{ gap: ONBOARDING.heroGap, paddingTop: ONBOARDING.heroTop }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <BuddyOrb size={ONBOARDING.orb} state={orbState} />
            {count ? (
              <Text testID="setup-step" style={TYPE.label}>
                {count}
              </Text>
            ) : null}
          </View>
          <Text accessibilityRole="header" style={TYPE.pageHeadline}>
            {title}
          </Text>
          {lead ? <Text style={[TYPE.body, { color: palette.ink2 }]}>{lead}</Text> : null}
        </View>
        {children}
      </ScrollView>
      <View
        style={[
          pinnedBar(insets.bottom),
          { gap: SPACE.xs, paddingBottom: insets.bottom + ONBOARDING.footerBottom },
        ]}
      >
        {footer}
      </View>
    </>
  );
  return (
    <Screen>
      <FormFrameContext.Provider value={form.controller}>
        {keyboardSafe ? <KeyboardSafe>{content}</KeyboardSafe> : content}
      </FormFrameContext.Provider>
    </Screen>
  );
}
