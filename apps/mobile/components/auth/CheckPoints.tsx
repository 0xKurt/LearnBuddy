// What a page promises, point by point, each with a check in front: the consent's six points
// and the hand-over's three (app/consent.tsx, app/profile.tsx).

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { CARD_PAD, RHYTHM, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { ONBOARDING } from '../../lib/theme/onboarding.js';
import { circle } from '../../lib/theme/radius.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';

/** The round badge with the check, in front of each point. */
const BADGE = ONBOARDING.legacyFacts.badge;
const BADGE_RADIUS = circle(BADGE);

const density = () =>
  ({
    /** Legacy compact cards for callers not yet migrated to plain fact rows. */
    compact: {
      padding: CARD_PAD.snug,
      gap: SPACE.sm,
      // token-exempt: the badge centred on the first line of the 14/20 type
      badge: { marginTop: ONBOARDING.legacyFacts.opticalTop },
      text: TYPE.meta,
    },
    /** A few points with room around them (the hand-over). */
    roomy: {
      padding: SPACE.lg,
      gap: RHYTHM.parts,
      badge: null,
      text: null,
    },
  }) as const;

type Props = {
  /** The points, already in her language. */
  points: readonly (string | { key: string; content: ReactNode })[];
  compact?: boolean;
  plain?: boolean;
};

export function CheckPoints({ points, compact = false, plain = false }: Props) {
  const { palette } = useTheme();
  const look = density()[compact ? 'compact' : 'roomy'];
  const facts = points.map((point) =>
    typeof point === 'string' ? { key: point, content: point } : point,
  );
  const rows = (
    <View style={{ gap: plain ? ONBOARDING.facts.gap : look.gap }}>
      {facts.map(({ key, content }) => (
        <View key={key} style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={
              plain
                ? { paddingTop: ONBOARDING.facts.opticalTop }
                : {
                    width: BADGE,
                    height: BADGE,
                    borderRadius: BADGE_RADIUS,
                    ...look.badge,
                    backgroundColor: palette.lavender,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }
            }
          >
            <Icon
              name="check"
              size={plain ? ONBOARDING.facts.glyph : ONBOARDING.legacyFacts.glyph}
              color={palette.primaryDk}
            />
          </View>
          <Text
            style={plain ? [TYPE.paragraph, { flex: 1 }] : [TYPE.body, { flex: 1, ...look.text }]}
          >
            {content}
          </Text>
        </View>
      ))}
    </View>
  );
  return plain ? rows : <Card padding={look.padding}>{rows}</Card>;
}
