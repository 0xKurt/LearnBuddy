// Two to five mutually exclusive choices, built from Btn: round pills that wrap
// onto a second line on a narrow phone; the chosen one is filled violet and
// read out as the selected radio button (never colour alone).

import { View } from 'react-native';

import { Btn } from './Btn.js';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Btn
          key={o.value}
          variant={o.value === value ? 'primary' : 'outline'}
          pill
          selected={o.value === value}
          onPress={() => onChange(o.value)}
          accessibilityLabel={o.label}
        >
          {o.label}
        </Btn>
      ))}
    </View>
  );
}
