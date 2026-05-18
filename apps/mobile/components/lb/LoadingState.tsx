// Shared full-screen loading state. One loading language across the app —
// previously Home used skeletons while Session/Subject/Material/Practice
// each rendered a bare, differently-spaced ActivityIndicator.

import { ActivityIndicator, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';

export function LoadingState({ label }: { label?: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        gap: 12,
      }}
    >
      <ActivityIndicator color={LB.ink2} />
      {label ? (
        <Text style={{ fontSize: 13, color: LB.ink2, textAlign: 'center' }}>{label}</Text>
      ) : null}
    </View>
  );
}
