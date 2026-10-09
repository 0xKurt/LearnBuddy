// A quiet small heading over a group of cards; with `dot`, a round pastel mark
// before it (a subject's colour in "Mein Stoff" — decorative, the name says it).

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { circle } from '../../lib/theme/radius.js';
import { RHYTHM, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

/** The round mark before the title. */
const DOT = 10;

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
  const { palette } = useTheme();
  return (
    <View style={{ gap: RHYTHM.parts }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: RHYTHM.parts,
          paddingHorizontal: SPACE.xs,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flex: 1 }}>
          {dot ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: DOT, height: DOT, borderRadius: circle(DOT), backgroundColor: dot }}
            />
          ) : null}
          <Text
            accessibilityRole="header"
            // textTransform, not toUpperCase(): some screen readers spell an
            // all-caps string letter by letter.
            style={[
              TYPE.label,
              { flex: 1, color: palette.ink2, letterSpacing: 0.8, textTransform: 'uppercase' },
            ]}
          >
            {title}
          </Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}
