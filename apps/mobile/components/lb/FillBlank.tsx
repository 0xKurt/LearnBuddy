// FillBlank — renders a template with ___ placeholders as inline TextInputs.
// Doc 07 §3.6.

import { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';

type Props = {
  template: string;
  values: string[];
  onChange: (idx: number, value: string) => void;
};

export function FillBlank({ template, values, onChange }: Props) {
  const parts = useMemo(() => template.split(/_{3,}/u), [template]);
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        rowGap: 8,
      }}
    >
      {parts.map((segment, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 16, color: LB.ink }}>{segment}</Text>
          {i < parts.length - 1 && (
            <TextInput
              value={values[i] ?? ''}
              onChangeText={(v) => onChange(i, v)}
              placeholder="___"
              placeholderTextColor={LB.ink3}
              style={{
                minWidth: 72,
                paddingHorizontal: 8,
                paddingVertical: 4,
                marginHorizontal: 4,
                fontSize: 16,
                color: LB.primaryDk,
                backgroundColor: LB.primaryLt,
                borderRadius: 8,
                textAlign: 'center',
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
        </View>
      ))}
    </View>
  );
}
