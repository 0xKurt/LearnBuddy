import { Text, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

export function LbHeader({ right }: { right?: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 22,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          fontSize: 17,
          fontWeight: '700',
          color: LB.ink,
          letterSpacing: -0.3,
        }}
      >
        LearnBuddy
      </Text>
      {right}
    </View>
  );
}
