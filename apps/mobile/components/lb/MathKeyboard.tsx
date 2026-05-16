// MathKeyboard — soft-keyboard for math input. Doc 05 §components.
// Inserts tokens at the caret position via an onInsert callback.

import { Pressable, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';

const ROWS: Array<{ label: string; insert: string }[]> = [
  [
    { label: '7', insert: '7' },
    { label: '8', insert: '8' },
    { label: '9', insert: '9' },
    { label: '÷', insert: '/' },
    { label: 'x²', insert: '^2' },
    { label: '(', insert: '(' },
  ],
  [
    { label: '4', insert: '4' },
    { label: '5', insert: '5' },
    { label: '6', insert: '6' },
    { label: '×', insert: '*' },
    { label: 'xⁿ', insert: '^' },
    { label: ')', insert: ')' },
  ],
  [
    { label: '1', insert: '1' },
    { label: '2', insert: '2' },
    { label: '3', insert: '3' },
    { label: '−', insert: '-' },
    { label: '√', insert: 'sqrt(' },
    { label: 'π', insert: 'pi' },
  ],
  [
    { label: '0', insert: '0' },
    { label: ',', insert: '.' },
    { label: '=', insert: '=' },
    { label: '+', insert: '+' },
    { label: 'Δ', insert: 'd' },
    { label: '⌫', insert: 'BACKSPACE' },
  ],
];

type Props = {
  onInsert: (token: string) => void;
};

export function MathKeyboard({ onInsert }: Props) {
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
      {ROWS.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
          {row.map((key) => (
            <Pressable
              key={key.label}
              onPress={() => onInsert(key.insert)}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                backgroundColor: '#fff',
                borderColor: LB.hairline,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, color: LB.ink, fontWeight: '500' }}>{key.label}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
