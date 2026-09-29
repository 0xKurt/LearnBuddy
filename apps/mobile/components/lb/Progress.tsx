import { View } from 'react-native';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export function Progress({ value }: { value: number }) {
  const { palette } = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{
        flex: 1,
        height: 6,
        borderRadius: 3,
        backgroundColor: palette.primaryLt,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: palette.primary,
          borderRadius: 3,
        }}
      />
    </View>
  );
}
