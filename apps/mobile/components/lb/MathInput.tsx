// MathInput — TextInput + live KaTeX preview. Doc 05 §components.
// Parses MathLite via @learnbuddy/shared-math and shows the rendered formula
// above the text field as the learner types.

import { parseMathLite } from '@learnbuddy/shared-math';
import { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { LatexText } from './LatexText.js';

type Props = {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  displayMode?: boolean;
};

export function MathInput({ value, onChangeText, placeholder, displayMode = true }: Props) {
  const parsed = useMemo(() => parseMathLite(value), [value]);
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          backgroundColor: '#fff',
          borderColor: LB.hairline,
          borderWidth: 1,
          borderRadius: 14,
          padding: 14,
          minHeight: 64,
          justifyContent: 'center',
        }}
      >
        {value.trim().length === 0 ? (
          <Text style={{ color: LB.ink3, fontStyle: 'italic' }}>Vorschau erscheint hier …</Text>
        ) : parsed.errors.length > 0 ? (
          <Text style={{ color: LB.warning, fontSize: 12 }}>{value}</Text>
        ) : (
          <LatexText expression={parsed.latex} displayMode={displayMode} />
        )}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? 'Antwort'}
        placeholderTextColor={LB.ink3}
        style={{
          backgroundColor: LB.bg,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          color: LB.ink,
        }}
      />
    </View>
  );
}
