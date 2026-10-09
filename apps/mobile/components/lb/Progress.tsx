import { View } from 'react-native';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { circle } from '../../lib/theme/radius.js';

/** The bar's height; its ends are round. */
const BAR = 6;

export function Progress({ value }: { value: number }) {
  const { palette } = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{
        flex: 1,
        height: BAR,
        borderRadius: circle(BAR),
        backgroundColor: palette.primaryLt,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: palette.primary,
          borderRadius: circle(BAR),
        }}
      />
    </View>
  );
}
