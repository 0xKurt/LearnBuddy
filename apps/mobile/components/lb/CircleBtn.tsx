import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';
import { Icon } from './Icon.js';

const LABEL_KEY: Record<
  'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak' | 'camera' | 'keyboard' | 'headphones',
  string
> = {
  back: 'a11y.back',
  close: 'a11y.close',
  more: 'a11y.more',
  plus: 'a11y.add',
  mic: 'a11y.mic',
  speak: 'a11y.speak',
  camera: 'a11y.camera',
  keyboard: 'a11y.keyboard',
  headphones: 'a11y.talk',
};

export function CircleBtn({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  plain = false,
}: {
  icon: 'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak' | 'camera' | 'keyboard' | 'headphones';
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** No ring or fill: an icon button inside another surface (the composer bar). */
  plain?: boolean;
}) {
  const { t } = useTranslation('common');
  const inner = (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: plain ? 'transparent' : '#fff',
        borderColor: LB.hairline,
        borderWidth: plain ? 0 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={plain ? 24 : 20} color={plain ? LB.ink2 : LB.ink} />
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t(LABEL_KEY[icon])}
      accessibilityHint={accessibilityHint}
    >
      {inner}
    </Pressable>
  );
}
