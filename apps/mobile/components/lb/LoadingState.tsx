// Shared full-screen loading state. One loading language across the app:
// the violet spinner and, when there is one, a short line of what is loading.

import { ActivityIndicator, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';

export function LoadingState({ label }: { label?: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        gap: 14,
      }}
    >
      <ActivityIndicator color={LB.primary} size="large" />
      {label ? <Text style={[TYPE.small, { textAlign: 'center' }]}>{label}</Text> : null}
    </View>
  );
}
