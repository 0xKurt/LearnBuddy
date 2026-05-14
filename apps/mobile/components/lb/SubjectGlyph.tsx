import { Text, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

export function SubjectGlyph({ glyph = '📐', size = 44 }: { glyph?: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: '#fff',
        borderColor: LB.hairline,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.5, lineHeight: size }}>{glyph}</Text>
    </View>
  );
}
