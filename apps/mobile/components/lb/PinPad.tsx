// 4-digit numeric PIN pad. Used by (onboarding)/pin-setup and (admin)/unlock.
//
// Renders 4 dots above a 3×4 keypad (1–9, blank, 0, ⌫). Calls `onComplete`
// once the 4th digit is entered; the parent clears or advances state.

import { useState, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';

type Props = {
  onComplete: (pin: string) => void;
  /** Reset signal — when this value changes, clear the in-progress PIN. */
  resetKey?: unknown;
  disabled?: boolean;
};

const KEYS: Array<{ label: string; value: 'digit' | 'back' | 'none'; digit?: string }> = [
  { label: '1', value: 'digit', digit: '1' },
  { label: '2', value: 'digit', digit: '2' },
  { label: '3', value: 'digit', digit: '3' },
  { label: '4', value: 'digit', digit: '4' },
  { label: '5', value: 'digit', digit: '5' },
  { label: '6', value: 'digit', digit: '6' },
  { label: '7', value: 'digit', digit: '7' },
  { label: '8', value: 'digit', digit: '8' },
  { label: '9', value: 'digit', digit: '9' },
  { label: '', value: 'none' },
  { label: '0', value: 'digit', digit: '0' },
  { label: '⌫', value: 'back' },
];

export function PinPad({ onComplete, resetKey, disabled = false }: Props) {
  const [entered, setEntered] = useState('');

  useEffect(() => {
    setEntered('');
  }, [resetKey]);

  function press(k: (typeof KEYS)[number]) {
    if (disabled) return;
    if (k.value === 'digit' && k.digit && entered.length < 4) {
      const next = entered + k.digit;
      setEntered(next);
      if (next.length === 4) {
        // Defer the callback so the 4th dot paints first.
        setTimeout(() => onComplete(next), 80);
      }
    } else if (k.value === 'back') {
      setEntered((p) => p.slice(0, -1));
    }
  }

  return (
    <View style={{ alignItems: 'center', gap: 24 }}>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: i < entered.length ? LB.ink : 'transparent',
              borderWidth: 1.5,
              borderColor: LB.ink2,
            }}
          />
        ))}
      </View>
      <View style={{ width: 264, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {KEYS.map((k, i) => (
          <Pressable
            key={`${k.label}-${i}`}
            onPress={() => press(k)}
            disabled={disabled || k.value === 'none'}
            style={{ opacity: disabled ? 0.4 : 1 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  width: 80,
                  height: 56,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    k.value === 'none' ? 'transparent' : pressed ? LB.primaryLt : LB.bg,
                }}
              >
                <Text style={{ fontSize: 22, color: LB.ink, fontWeight: '500' }}>{k.label}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
