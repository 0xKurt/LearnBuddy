// A calm line at the top of the app while the device is offline. It sits above
// the screens (never over their back button or title) and takes the top safe
// area itself, so screens below it get no second notch gap: the hook insets
// are handed on with top = 0, and the native SafeAreaView measures its own
// position anyway. Queries and answers wait meanwhile (lib/api/queries.ts,
// lib/api/whenOnline.ts), so there is nothing to do but wait.

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnline } from '../../lib/api/queries.js';
import { LB } from '../../lib/theme/colors.js';
import { Banner } from './Banner.js';

export function OfflineFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation('errors');
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const wasOnline = useRef(true);
  const message = t('offline_banner');

  useEffect(() => {
    if (wasOnline.current && !online) AccessibilityInfo.announceForAccessibility(message);
    wasOnline.current = online;
  }, [online, message]);

  return (
    <View style={{ flex: 1, backgroundColor: LB.bg }}>
      {online ? null : (
        <View
          accessibilityLiveRegion="polite"
          style={{
            paddingTop: insets.top + 8,
            paddingBottom: 8,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
            backgroundColor: LB.bg,
          }}
        >
          <Banner tone="info">{message}</Banner>
        </View>
      )}
      <SafeAreaInsetsContext.Provider value={online ? insets : { ...insets, top: 0 }}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
