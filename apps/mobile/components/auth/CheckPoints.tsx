// What a page promises, point by point, each with a check in front: the consent's six points
// and the hand-over's three (app/consent.tsx, app/profile.tsx).

import { Text, View } from 'react-native';

import { RHYTHM, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';

/** The round badge with the check, in front of each point. */
const BADGE = 26;
const BADGE_RADIUS = BADGE / 2;

const DENSITY = {
  /** The consent's six points: in German they fit a 360×740 phone (issue #76). */
  compact: {
    padding: 14, // token-exempt: six points on a 360×740 phone (issue #76)
    gap: SPACE.sm,
    // token-exempt: the badge centred on the first line of the 14/20 type
    badge: { marginTop: -1 },
    text: { fontSize: 14, lineHeight: 20 }, // token-exempt: six points on a 360×740 phone
  },
  /** A few points with room around them (the hand-over). */
  roomy: {
    padding: SPACE.lg,
    gap: RHYTHM.parts,
    badge: null,
    text: null,
  },
} as const;

type Props = {
  /** The points, already in her language. */
  points: readonly string[];
  compact?: boolean;
};

export function CheckPoints({ points, compact = false }: Props) {
  const { palette } = useTheme();
  const look = DENSITY[compact ? 'compact' : 'roomy'];
  return (
    <Card padding={look.padding}>
      <View style={{ gap: look.gap }}>
        {points.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: BADGE,
                height: BADGE,
                borderRadius: BADGE_RADIUS,
                ...look.badge,
                backgroundColor: palette.lavender,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={15} color={palette.primaryDk} />
            </View>
            <Text style={[TYPE.body, { flex: 1, ...look.text }]}>{p}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
