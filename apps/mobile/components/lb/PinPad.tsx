// 4-digit numeric PIN pad. Used by (onboarding)/pin-setup and (admin)/unlock.
//
// Renders 4 dots above a 3×4 keypad (1–9, blank, 0, ⌫). Calls `onComplete`
// once the 4th digit is entered; the parent clears or advances state.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { haptic } from '../../lib/haptics.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { circle } from '../../lib/theme/radius.js';
import { RHYTHM, SPACE } from '../../lib/theme/space.js';
import { MAX_FONT_SCALE } from './Btn.js';

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

/** One of the four dots that show how far she is. */
const DOT = 16;
/** A key: wide enough for a thumb, a pill as tall as a phone's own keypad. */
const KEY = { width: 80, height: 60 } as const;

export function PinPad({ onComplete, resetKey, disabled = false }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const [entered, setEntered] = useState('');
  // iOS has no live regions: the dots' progress says itself (lib/announce.ts).
  useAnnounce(entered.length > 0 ? t('a11y.pin_progress', { count: entered.length }) : null, {
    key: entered.length,
  });

  useEffect(() => {
    setEntered('');
  }, [resetKey]);

  function press(k: (typeof KEYS)[number]) {
    if (disabled) return;
    haptic.select();
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
    <View style={{ alignItems: 'center', gap: SPACE.xl }}>
      <View
        accessible
        // How far she is, as one thing with a name and a value — a bare label on a box is
        // not allowed ARIA (axe: aria-prohibited-attr, issue #73).
        accessibilityRole="progressbar"
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('a11y.pin_progress', { count: entered.length })}
        accessibilityValue={{ min: 0, max: 4, now: entered.length }}
        // The dots as far apart as the keys' rows below.
        style={{ flexDirection: 'row', gap: RHYTHM.stack }}
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: DOT,
              height: DOT,
              borderRadius: circle(DOT),
              backgroundColor: i < entered.length ? palette.primary : palette.paper,
              borderWidth: 1.5,
              borderColor: i < entered.length ? palette.primary : palette.ink3,
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
          rowGap: RHYTHM.stack,
        }}
      >
        {KEYS.map((k, i) =>
          // The empty place in the grid is a gap, not a button without a name
          // (axe: button-name, issue #73).
          k.value === 'none' ? (
            <View key={`gap-${i}`} style={KEY} />
          ) : (
            <Pressable
              key={`${k.label}-${i}`}
              onPress={() => press(k)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={k.value === 'back' ? t('a11y.pin_delete') : k.label}
              style={{ opacity: disabled ? 0.4 : 1 }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    ...KEY,
                    borderRadius: circle(KEY.height),
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? palette.primaryLt : palette.paper,
                    ...(k.value === 'digit' ? SHADOW.soft : null),
                  }}
                >
                  {/* Fixed key boxes: the digit grows with the system text only this far (M-84). */}
                  <Text
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={{
                      fontSize: 22, // token-exempt: the digit as large as a phone's keypad has it
                      color: palette.ink,
                      fontWeight: '500',
                    }}
                  >
                    {k.label}
                  </Text>
                </View>
              )}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}
