// A calm line at the top of the app while the device is offline. It sits above
// the screens (never over their back button or title; the design draws it under the
// head, which only the screens' own shells could do) and takes the top safe
// area itself, so screens below it get no second notch gap: the hook insets
// are handed on with top = 0, and the native SafeAreaView measures its own
// position anyway. Queries and answers wait meanwhile (lib/api/queries.ts,
// lib/api/whenOnline.ts), so there is nothing to do but wait.

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { announce } from '../../lib/announce.js';
import { useOnline } from '../../lib/api/queries.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Banner } from './Banner.js';

export function OfflineFrame({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  const { t } = useTranslation('errors');
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const wasOnline = useRef(true);
  const message = t('offline_banner');

  useEffect(() => {
    // liveRegion: true — the banner's own live region speaks on Android; this
    // covers iOS without doubling TalkBack (lib/announcePlan.ts).
    if (wasOnline.current && !online) announce(message, { liveRegion: true });
    wasOnline.current = online;
  }, [online, message]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {online ? null : (
        // The design's offline banner (components/core/States.jsx `Banner`): canvas from edge to
        // edge, and up under the status bar, whose room it takes.
        <View
          accessibilityLiveRegion="polite"
          style={{
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            backgroundColor: palette.canvas,
          }}
        >
          <Banner bar>{message}</Banner>
        </View>
      )}
      <SafeAreaInsetsContext.Provider value={online ? insets : { ...insets, top: 0 }}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
