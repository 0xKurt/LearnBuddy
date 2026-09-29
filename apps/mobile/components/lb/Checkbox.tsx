// A consent-style checkbox row (not a CTA): the whole row toggles.

import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from './Icon.js';

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      // An unticked box must say so, not stay silent: on the web `accessibilityState`
      // alone leaves out `aria-checked` (axe: aria-required-attr, issue #73).
      aria-checked={checked}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      hitSlop={6}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 9,
            borderWidth: 1.5,
            borderColor: checked ? palette.primary : palette.ink3,
            backgroundColor: checked ? palette.primary : palette.paper,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}
        >
          {checked ? <Icon name="check" size={16} color={palette.paper} /> : null}
        </View>
        <Text style={[TYPE.body, { flex: 1, fontSize: 15 }]}>{label}</Text>
      </View>
    </Pressable>
  );
}
