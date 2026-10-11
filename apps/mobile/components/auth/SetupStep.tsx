// One step of the setup that asks or tells one thing (issues #518, #526): Buddy's orb, a headline,
// what the step says, and its answers pinned at the bottom. The hand-over, the notification
// question and the voice step are this one shell, so they stand and breathe alike (Engineering-
// Regel 6: the same thing looks the same).

import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, pinnedBar, RHYTHM, SPACE } from '../../lib/theme/space.js';
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
  compact = false,
  variant = 'centered',
  lead,
  step,
  scrollTestID,
  keyboardSafe = false,
}: {
  title: string;
  orbState?: MoonState;
  variant?: 'centered' | 'onboarding';
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
  /** The tighter rhythm a small phone needs (`formDensity`). */
  compact?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const form = useFormViewport();
  const { palette } = useTheme();
  const onboarding = variant === 'onboarding';
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
          justifyContent: onboarding ? 'flex-start' : 'center',
          paddingHorizontal: GUTTER,
          paddingTop: onboarding ? ONBOARDING.top : compact ? SPACE.lg : SPACE.xl,
          paddingBottom: onboarding ? ONBOARDING.bottom : compact ? SPACE.lg : SPACE.xl,
          gap: onboarding ? ONBOARDING.gap : compact ? RHYTHM.stack : RHYTHM.sections,
        }}
      >
        {onboarding ? (
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
        ) : (
          <>
            <View style={{ alignItems: 'center' }}>
              <BuddyOrb
                state={orbState}
                size={compact ? ONBOARDING.legacyOrb.compact : ONBOARDING.legacyOrb.roomy}
              />
            </View>
            <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
              {title}
            </Text>
          </>
        )}
        {children}
      </ScrollView>
      <View
        style={[
          pinnedBar(insets.bottom),
          onboarding
            ? { gap: SPACE.xs, paddingBottom: insets.bottom + ONBOARDING.footerBottom }
            : { gap: SPACE.sm },
        ]}
      >
        {footer}
      </View>
    </>
  );
  return (
    <Screen>
      {onboarding && top ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: GUTTER }}>{top}</View>
      ) : (
        top
      )}
      <FormFrameContext.Provider value={form.controller}>
        {keyboardSafe ? <KeyboardSafe>{content}</KeyboardSafe> : content}
      </FormFrameContext.Provider>
    </Screen>
  );
}
