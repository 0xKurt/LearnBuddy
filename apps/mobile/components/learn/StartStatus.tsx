// What happens with a start from a topic: Buddy is preparing it (a few
// seconds), there was nothing to learn from the text, or it failed. Calm
// words, never red alarm.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { SPACE } from '../../lib/theme/space.js';
import { BusyIndicator } from '../lb/BusyIndicator.js';
import { Banner } from '../lb/Banner.js';
import { SafeguardingReply } from '../buddy/SafeguardingReply.js';
import { SHEET_TEXT } from '../lb/Sheet.js';
import type { StartState } from './useStartTopic.js';

export function StartStatus({
  state,
  preparingInAction = false,
}: {
  state: StartState;
  preparingInAction?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('learn');
  // iOS has no live regions: each status says itself (lib/announce.ts).
  useAnnounce(
    state.status === 'preparing' && !preparingInAction
      ? t('topic.preparing')
      : state.status === 'not_usable'
        ? t('topic.not_usable')
        : state.status === 'failed' && !state.safeguarded
          ? state.message
          : null,
  );
  switch (state.status) {
    case 'idle':
      return null;
    case 'preparing':
      if (preparingInAction) return null;
      return (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.md,
            paddingVertical: SPACE.xs,
          }}
        >
          <BusyIndicator color={palette.primaryDk} />
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
      if (state.safeguarded)
        return (
          <View style={SHEET_TEXT}>
            <SafeguardingReply text={state.message} />
          </View>
        );
      return (
        <View accessibilityLiveRegion="polite">
          <Banner tone="warning">{state.message}</Banner>
        </View>
      );
  }
}
