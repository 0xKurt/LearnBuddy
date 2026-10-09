import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { circle } from '../../lib/theme/radius.js';
import { TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon } from './Icon.js';

const LABEL_KEY: Record<
  'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak' | 'stop' | 'camera' | 'keyboard',
  string
> = {
  back: 'a11y.back',
  close: 'a11y.close',
  more: 'a11y.more',
  plus: 'a11y.add',
  mic: 'a11y.mic',
  speak: 'a11y.speak',
  stop: 'a11y.stop',
  camera: 'a11y.camera',
  keyboard: 'a11y.keyboard',
};

export function CircleBtn({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  plain = false,
}: {
  icon: 'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak' | 'stop' | 'camera' | 'keyboard';
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** No ring or fill: an icon button inside another surface (the composer bar). */
  plain?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  // Every other control in the system answers a finger; this one did not (audit 30.09.,
  // #133 position 6). The same dip Btn and StartRow use, so a press feels the same
  // wherever it lands.
  const inner = (pressed: boolean) => (
    <View
      style={{
        width: TOUCH,
        height: TOUCH,
        borderRadius: circle(TOUCH),
        // A filled circle, not paper + hairline: the hairline sits at ~1.2:1 on the page
        // and the button read as a floating icon without a boundary (WCAG 1.4.11).
        backgroundColor: plain ? 'transparent' : palette.canvas,
        borderColor: palette.hairline,
        borderWidth: plain ? 0 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.78 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      }}
    >
      <Icon name={icon} size={plain ? 24 : 20} color={plain ? palette.ink2 : palette.ink} />
    </View>
  );
  if (!onPress) return inner(false);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t(LABEL_KEY[icon])}
      accessibilityHint={accessibilityHint}
    >
      {({ pressed }) => inner(pressed)}
    </Pressable>
  );
}
