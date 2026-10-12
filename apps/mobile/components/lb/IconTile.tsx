// Decorative square tone tile; callers own actions and accessible names.
import { View } from 'react-native';
import { ICON_TILE } from '../../lib/theme/iconTile.js';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon, type IconName } from './Icon.js';
export function IconTile({ icon, tone }: { icon: IconName; tone: SubjectTone }) {
  const { tones } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[ICON_TILE.frame, { backgroundColor: tones.bg[tone] }]}
    >
      <Icon name={icon} size={ICON_TILE.glyph} color={tones.deep[tone]} />
    </View>
  );
}
