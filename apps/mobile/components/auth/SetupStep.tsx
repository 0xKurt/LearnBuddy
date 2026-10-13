// One step of the setup that asks or tells one thing (issues #518, #526): Buddy's orb, a headline,
// what the step says, and its answers pinned at the bottom. The hand-over, the notification
// question and the voice step are this one shell, so they stand and breathe alike (Engineering-
// Regel 6: the same thing looks the same).

import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, pinnedBar, SPACE } from '../../lib/theme/space.js';
import { ONBOARDING } from '../../lib/theme/onboarding.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb, type MoonState } from '../lb/BuddyOrb.js';
import { Screen } from '../lb/Screen.js';
import { KeyboardSafe } from '../lb/KeyboardSafe.js';
import { FormFrameContext, useFormViewport } from '../lb/FormFrameClearance.js';

export function SetupStep({
  title,
  orbState,
  children,
  footer,
  top = null,
  lead,
  step,
  scrollTestID,
  keyboardSafe = false,
}: {
  title: string;
  orbState?: MoonState;
  lead?: string;
  step?: string;
  scrollTestID?: string;
  /** Editable forms keep their fields and pinned action above the keyboard. */
  keyboardSafe?: boolean;
  /** What the step says or offers, under the headline. */
  children: ReactNode;
  /** Its answers, pinned at the bottom. */
  footer: ReactNode;
  /** Above everything, outside the scroll: a way back. */
  top?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const form = useFormViewport();
  const { palette } = useTheme();
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
          paddingHorizontal: GUTTER,
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
            {step ? <Text style={TYPE.label}>{step}</Text> : null}
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
      {top ? <View style={{ flexDirection: 'row', paddingHorizontal: GUTTER }}>{top}</View> : null}
      <FormFrameContext.Provider value={form.controller}>
        {keyboardSafe ? <KeyboardSafe>{content}</KeyboardSafe> : content}
      </FormFrameContext.Provider>
    </Screen>
  );
}
