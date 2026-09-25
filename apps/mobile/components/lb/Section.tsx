import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { TYPE } from '../../lib/theme/type.js';

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={TYPE.label}>
          {title.toUpperCase()}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}
