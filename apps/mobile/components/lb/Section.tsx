// A quiet label over something that is not a list card — the topics of a subject as chips
// (ui_kits/app/More.jsx:77–79). The same label a `ListGroup` carries, so the groups of one page
// read as one family: 13/700, sentence case, 4 in from the edge, 8 above what it names.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      <Text accessibilityRole="header" style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}
