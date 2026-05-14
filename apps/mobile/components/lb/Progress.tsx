import { View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

export function Progress({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{
        flex: 1,
        height: 4,
        borderRadius: 4,
        backgroundColor: 'rgba(20,15,30,0.08)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: LB.primary,
          borderRadius: 4,
        }}
      />
    </View>
  );
}
