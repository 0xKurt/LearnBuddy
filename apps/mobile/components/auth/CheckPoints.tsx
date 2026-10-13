// What a page promises, point by point, each with a check in front: the consent's six points
// and the hand-over's three (app/consent.tsx, app/profile.tsx). Plain rows on the page, no box
// around them (design ui_kits/app/Onboarding.jsx:52–57, 137–144).

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { ONBOARDING } from '../../lib/theme/onboarding.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';

type Props = {
  /** The points, already in her language. */
  points: readonly (string | { key: string; content: ReactNode })[];
};

export function CheckPoints({ points }: Props) {
  const { palette } = useTheme();
  const facts = points.map((point) =>
    typeof point === 'string' ? { key: point, content: point } : point,
  );
  return (
    <View style={{ gap: ONBOARDING.facts.gap }}>
      {facts.map(({ key, content }) => (
        <View key={key} style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ paddingTop: ONBOARDING.facts.opticalTop }}
          >
            <Icon name="check" size={ONBOARDING.facts.glyph} color={palette.primaryDk} />
          </View>
          <Text style={[TYPE.paragraph, { flex: 1 }]}>{content}</Text>
        </View>
      ))}
    </View>
  );
}
