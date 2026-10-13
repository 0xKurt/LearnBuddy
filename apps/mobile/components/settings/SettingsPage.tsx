// What every page under "Einstellungen" is made of (issues #589, #599): the way back in the
// shared head, and under the head groups of rows one under the other (ui_kits/app/Settings.jsx,
// Flows.jsx `Page`). A page fits the phone; only a list she browses on purpose (`list`: the
// settings themselves, the licences, the parents' forms) may grow past it (tests/web/fit.ts,
// CLAUDE.md rule 16). The head itself is each route's own `<Screen>`
// (lib/__tests__/headerShell.test.ts).
//
// The parents' PIN counts for the step it was asked for: leaving a page ends it, so the child
// holding the phone afterwards cannot use it (docs/privacy.md §PIN gate).

import type { UseQueryResult } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearAdminToken } from '../../lib/admin.js';
import { SETTINGS } from '../../lib/theme/settings.js';
import { bottomRoom, GUTTER_APP, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { FormFrameContext, useFormViewport } from '../lb/FormFrameClearance.js';
import { KeyboardSafe } from '../lb/KeyboardSafe.js';
import { LoadFailed } from '../lb/LoadFailed.js';
import { Screen } from '../lb/Screen.js';
import { SettingsSkeleton, type SettingsStart } from '../lb/Skeletons.js';

/** A page's way back: to where she came from; opened by a link, to the settings. */
export const SETTINGS_BACK = {
  icon: 'back' as const,
  onPress: () => (router.canGoBack() ? router.back() : router.replace('/settings')),
};

type BodyProps = {
  /** A list she browses on purpose: it may scroll, and says so by name. */
  list?: boolean;
  /** Pull to load again. */
  refresh?: { refreshing: boolean; onRefresh: () => void };
  children: ReactNode;
};

/** Under the head: the page's groups, with the room the design gives them (`18px 16px 26px`). */
export function SettingsBody({ list = false, refresh, children }: BodyProps) {
  const insets = useSafeAreaInsets();
  const form = useFormViewport();
  // Leaving the page (also for the PIN pad, which sets a fresh one) ends the parents' PIN.
  useFocusEffect(useCallback(() => () => clearAdminToken(), []));
  return (
    <KeyboardSafe style={{ flex: 1 }}>
      <ScrollView
        // A focused field (the parents' PIN) is kept whole above the keyboard.
        {...form.follow}
        ref={form.scroll}
        testID={list ? 'scroll-list' : undefined}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: GUTTER_APP,
          paddingTop: SETTINGS.page.top,
          paddingBottom: bottomRoom(insets.bottom, SETTINGS.page.bottom),
          gap: SPACE.xl,
        }}
        refreshControl={refresh ? <RefreshControl {...refresh} /> : undefined}
      >
        <FormFrameContext.Provider value={form.controller}>{children}</FormFrameContext.Provider>
      </ScrollView>
    </KeyboardSafe>
  );
}

type PendingProps = {
  title: string;
  subtitle?: string;
  /** The settings themselves leave with the head's own back. */
  root?: boolean;
  /** What the page opens with, so its bones start where its content will (#599). */
  start?: SettingsStart;
  queries: ReadonlyArray<Pick<UseQueryResult, 'data' | 'error' | 'refetch'>>;
};

/**
 * A page while what it needs has not arrived: the failure with "Nochmal versuchen", or the
 * bones — under the same head, with Buddy thinking.
 */
export function SettingsPending({ title, subtitle, root = false, start, queries }: PendingProps) {
  const { t } = useTranslation('common');
  const failed = queries.find((q) => q.data === undefined && q.error);
  return (
    <Screen
      title={title}
      subtitle={subtitle}
      state="think"
      back={root}
      leading={root ? undefined : SETTINGS_BACK}
    >
      {failed ? (
        <LoadFailed
          error={failed.error}
          onRetry={() => void Promise.all(queries.map((q) => q.refetch()))}
        />
      ) : (
        <SettingsSkeleton label={t('loading')} start={start} />
      )}
    </Screen>
  );
}

/** A quiet line between groups (Flows.jsx `Hint`: 400 14/20, ink-2, 4 in from the group). */
export function Hint({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Text style={[TYPE.meta, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}>
      {children}
    </Text>
  );
}
