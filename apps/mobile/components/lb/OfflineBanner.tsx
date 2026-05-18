import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { Animated, Text } from 'react-native';

import { useTranslation } from 'react-i18next';
import { LB } from '../../lib/theme/colors.js';

export function OfflineBanner() {
  const { t } = useTranslation('errors');
  const [offline, setOffline] = useState(false);
  const height = useState(new Animated.Value(0))[0];

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOffline = state.isConnected === false;
      setOffline(isOffline);
      Animated.timing(height, {
        toValue: isOffline ? 36 : 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    });
    return unsub;
  }, [height]);

  if (!offline) return null;

  return (
    <Animated.View
      style={{
        height,
        backgroundColor: LB.danger,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{t('offline')}</Text>
    </Animated.View>
  );
}
