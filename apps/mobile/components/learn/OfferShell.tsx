// The frame of an offer Buddy puts under his message: the soft accent card, a row with its icon and
// what it is in small capitals, and below it what the offer holds. One frame for every offer (to
// learn, OfferCard; to rehearse or read aloud, RehearseCard, issue #264), so the same kind of thing
// looks the same in the chat.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { CARD_PAD, RHYTHM, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { CHAT } from '../../lib/theme/chat.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon, type IconName } from '../lb/Icon.js';

export function OfferShell({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <Card padding={CARD_PAD.base} radius={RADIUS.lg}>
      <View style={{ gap: RHYTHM.parts }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={icon} size={CHAT.overlay.glyph} color={palette.primaryDk} />
          </View>
          <Text style={[TYPE.meta, { color: palette.ink2 }]}>{label}</Text>
        </View>
        {children}
      </View>
    </Card>
  );
}
