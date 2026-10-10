// An icon in a round disc (issue #311): the shield beside the under-16 note and on the PIN card,
// the ways to learn on the first onboarding step, the round mark of a subject, an exercise or a
// sheet in "Dein Material". Each wrote the
// same circle by hand. It only shows: what it stands for is the text beside it, so screen readers
// skip it. Something to tap is a `<CircleBtn>`.

import { View, type ViewStyle } from 'react-native';

import { circle } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon, type IconName } from './Icon.js';

/** A disc in a colour of its own (a subject's pastel), with a hairline edge where it has one. */
export type DiscTint = { fill: string; edge?: string };

export function IconDisc({
  name,
  size,
  iconSize,
  tone = 'paper',
  style,
}: {
  name: IconName;
  /** The disc's diameter. */
  size: number;
  iconSize: number;
  /** The disc's colour: white paper on a tinted card, lavender on white, or a tint of its own. */
  tone?: 'paper' | 'lavender' | DiscTint;
  /** Its place in the layout (alignment, margin) — never its look. */
  style?: Pick<ViewStyle, 'alignSelf' | 'marginBottom'>;
}) {
  const { palette } = useTheme();
  const tint: DiscTint = typeof tone === 'string' ? { fill: palette[tone] } : tone;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        ...style,
        width: size,
        height: size,
        borderRadius: circle(size),
        backgroundColor: tint.fill,
        ...(tint.edge ? { borderWidth: 1, borderColor: tint.edge } : null),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={iconSize} color={palette.primaryDk} />
    </View>
  );
}
