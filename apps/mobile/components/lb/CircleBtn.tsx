import { Pressable, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';
import { Icon } from './Icon.js';

export function CircleBtn({
  icon,
  onPress,
}: {
  icon: 'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak';
  onPress?: () => void;
}) {
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
  return <Pressable onPress={onPress}>{inner}</Pressable>;
}
