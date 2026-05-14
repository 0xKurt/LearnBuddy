import { Text, View } from 'react-native';
import { LB, TONE_DEEP, type SubjectTone } from '../../lib/theme/colors.js';

export function Avatar({
  name = 'L',
  tone = 'lavender',
  size = 40,
}: {
  name?: string;
  tone?: SubjectTone;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: TONE_DEEP[tone],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: size * 0.4,
          fontWeight: '600',
          color: LB.ink,
          letterSpacing: -0.3,
        }}
      >
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
