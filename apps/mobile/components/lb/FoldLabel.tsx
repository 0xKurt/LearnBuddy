// The one line a folded thing shows of itself (issues #233, #379): its sign, what it is, and the
// word for what a tap does — the reading text above a question ("Der Schulweg · Aufklappen") and a
// question's drawing while she types ("Abbildung · Ansehen"). One component, so both read as the
// same kind of control (CLAUDE.md: one UI element, one component). Words and a sign, never colour
// alone. The caller makes it tappable (a `<Btn>` label, a `Zoomable`).

import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon, type IconName } from './Icon.js';

type Props = {
  icon: IconName;
  title: string;
  /** What a tap does ("Aufklappen", "Ansehen"). */
  action: string;
  /** A chevron after the action: up while open, down while folded (the reading text). */
  open?: boolean;
};

export function FoldLabel({ icon, title, action, open }: Props) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <Icon name={icon} size={18} color={palette.primaryDk} />
      <Text numberOfLines={1} style={[TYPE.label, { flex: 1, color: palette.ink }]}>
        {title}
      </Text>
      <Text style={[TYPE.label, { color: palette.primaryDk }]}>{action}</Text>
      {open === undefined ? null : (
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <Icon name="chevron" size={16} color={palette.primaryDk} />
        </View>
      )}
    </View>
  );
}
