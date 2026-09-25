// 4-digit numeric PIN pad. Used by (onboarding)/pin-setup and (admin)/unlock.
//
// Renders 4 dots above a 3×4 keypad (1–9, blank, 0, ⌫). Calls `onComplete`
// once the 4th digit is entered; the parent clears or advances state.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';

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
  const { t } = useTranslation('common');
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
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('a11y.pin_progress', { count: entered.length })}
        style={{ flexDirection: 'row', gap: 14 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: i < entered.length ? LB.primary : LB.paper,
              borderWidth: 1.5,
              borderColor: i < entered.length ? LB.primary : LB.ink3,
            }}
          />
        ))}
      </View>
      <View
        style={{
          width: 264,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          rowGap: 14,
        }}
      >
        {KEYS.map((k, i) => (
          <Pressable
            key={`${k.label}-${i}`}
            onPress={() => press(k)}
            disabled={disabled || k.value === 'none'}
            accessibilityRole="button"
            accessibilityLabel={k.value === 'back' ? t('a11y.pin_delete') : k.label}
            accessibilityElementsHidden={k.value === 'none'}
            importantForAccessibility={k.value === 'none' ? 'no-hide-descendants' : 'auto'}
            style={{ opacity: disabled ? 0.4 : 1 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  width: 80,
                  height: 60,
                  borderRadius: 30,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    k.value === 'none' ? 'transparent' : pressed ? LB.primaryLt : LB.paper,
                  ...(k.value === 'digit' ? SHADOW.soft : null),
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
