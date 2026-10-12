// One way in, in her material (issue #311): a round tile with an icon, a name, what stands
// under it, and a chevron that says one tap goes in. A subject in the list (`SubjectCard`) and
// an exercise in a subject (`ExerciseCard`) are this card; each brings its own tile colour and
// lines.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { UI } from '../../lib/theme/components.js';
import { CARD_PAD, SPACE, TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon, type IconName } from '../lb/Icon.js';
import { IconDisc, type DiscTint } from '../lb/IconDisc.js';

type Props = {
  icon: IconName;
  /** The round tile's fill, and its edge where it has one. */
  tile: DiscTint;
  title: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  /** The lines under the title. */
  children: ReactNode;
};

export function EntryCard({
  icon,
  tile,
  title,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  children,
}: Props) {
  const { palette } = useTheme();
  return (
    <Card
      onPress={onPress}
      padding={CARD_PAD.base}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <IconDisc name={icon} size={TOUCH} iconSize={UI.iconButton.glyph} tone={tile} />
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Text style={TYPE.cell}>{title}</Text>
          {children}
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="chevron" size={UI.list.chevron} color={palette.ink3} />
        </View>
      </View>
    </Card>
  );
}
