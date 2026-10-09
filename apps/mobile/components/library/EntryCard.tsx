// One way in, in her material (issue #311): a round tile with an icon, a name, what stands
// under it, and a chevron that says one tap goes in. A subject in the list (`SubjectCard`) and
// an exercise in a subject (`ExerciseCard`) are this card; each brings its own tile colour and
// lines.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon, type IconName } from '../lb/Icon.js';

type Props = {
  icon: IconName;
  /** The round tile's fill, and its edge where it has one. */
  tile: { backgroundColor: string; borderColor?: string };
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
      padding={SPACE.lg}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22, // token-exempt: circle, half its size
            backgroundColor: tile.backgroundColor,
            ...(tile.borderColor ? { borderWidth: 1, borderColor: tile.borderColor } : null),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={20} color={palette.primaryDk} />
        </View>
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{title}</Text>
          {children}
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="chevron" size={20} color={palette.ink3} />
        </View>
      </View>
    </Card>
  );
}
