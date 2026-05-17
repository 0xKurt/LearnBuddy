import { Pressable, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';
import { Icon } from './Icon.js';

const DEFAULT_LABEL: Record<'back' | 'close' | 'more' | 'plus' | 'mic' | 'speak', string> = {
  back: 'Zurück',
  close: 'Schließen',
  more: 'Mehr Optionen',
  plus: 'Hinzufügen',
  mic: 'Mikrofon',
  speak: 'Vorlesen',
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
      accessibilityLabel={accessibilityLabel ?? DEFAULT_LABEL[icon]}
      accessibilityHint={accessibilityHint}
    >
      {inner}
    </Pressable>
  );
}
