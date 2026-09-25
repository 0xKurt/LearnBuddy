// A quiet small heading over a group of cards; with `dot`, a round pastel mark
// before it (a subject's colour in "Mein Stoff" — decorative, the name says it).

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';

export function Section({
  title,
  children,
  right,
  dot,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  /** A colour for the round mark before the title. */
  dot?: string;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingHorizontal: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          {dot ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }}
            />
          ) : null}
          <Text
            accessibilityRole="header"
            style={[TYPE.label, { flex: 1, color: LB.ink2, letterSpacing: 0.8 }]}
          >
            {title.toUpperCase()}
          </Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}
