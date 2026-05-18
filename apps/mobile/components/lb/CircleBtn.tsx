import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';
import { Icon } from './Icon.js';

const LABEL_KEY: Record<'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak', string> = {
  back: 'a11y.back',
  close: 'a11y.close',
  more: 'a11y.more',
  plus: 'a11y.add',
  mic: 'a11y.mic',
  speak: 'a11y.speak',
};

export function CircleBtn({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  icon: 'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak';
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const { t } = useTranslation('common');
  const inner = (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fff',
        borderColor: LB.hairline,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={18} color={LB.ink} />
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
