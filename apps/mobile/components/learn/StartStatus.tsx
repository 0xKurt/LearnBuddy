// What happens with a start from a topic: Buddy is preparing it (a few
// seconds), there was nothing to learn from the text, or it failed. Calm
// words, never red alarm.

import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Banner } from '../lb/Banner.js';
import type { StartState } from './useStartTopic.js';

export function StartStatus({ state }: { state: StartState }) {
  const { palette } = useTheme();
  const { t } = useTranslation('learn');
  // iOS has no live regions: each status says itself (lib/announce.ts).
  useAnnounce(
    state.status === 'preparing'
      ? t('topic.preparing')
      : state.status === 'not_usable'
        ? t('topic.not_usable')
        : state.status === 'failed'
          ? state.message
          : null,
  );
  switch (state.status) {
    case 'idle':
      return null;
    case 'preparing':
      return (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}
        >
          <ActivityIndicator color={palette.primaryDk} />
          <View style={{ flex: 1 }}>
            <Text style={[TYPE.body, { fontWeight: '600' }]}>{t('topic.preparing')}</Text>
            <Text style={TYPE.small}>{t('topic.preparing_hint')}</Text>
          </View>
        </View>
      );
    case 'not_usable':
      return (
        <View accessibilityLiveRegion="polite">
          <Banner tone="info">{t('topic.not_usable')}</Banner>
        </View>
      );
    case 'failed':
      return (
        <View accessibilityLiveRegion="polite">
          <Banner tone="warning">{state.message}</Banner>
        </View>
      );
  }
}
