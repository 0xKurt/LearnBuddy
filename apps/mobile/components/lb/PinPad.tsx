// 4-digit numeric PIN pad of the parents' PIN (app/pin.tsx), as the design draws it
// (components/core/PinPad.jsx, #599): four dots above a 3×4 keypad (1–9, blank, 0, delete). The
// keys are flat tiles on canvas — they do not float —, the delete key is the `delete` sign on a
// transparent key. Calls `onComplete` once the 4th digit is entered; the parent clears or
// advances state (`resetKey`).
//
// `error`: the PIN she entered was not taken. The pad is empty again by then (`resetKey`), so the
// four dots stand filled in the danger colour until she presses the next key — the wrong entry,
// shown. Never colour alone: the screen says in words what happened and announces it
// (app/pin.tsx); the dots only repeat it.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { haptic } from '../../lib/haptics.js';
import { pressedStyle, UI } from '../../lib/theme/components.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { PIN, PIN_PAD_WIDTH, pinDigit } from '../../lib/theme/pin.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { Icon } from './Icon.js';

type Props = {
  onComplete: (pin: string) => void;
  /** Reset signal — when this value changes, clear the in-progress PIN. */
  resetKey?: unknown;
  disabled?: boolean;
  /** The last PIN was not taken: the dots show it in the danger colour until the next key. */
  error?: boolean;
};

/** The keys in reading order; null is the empty place beside the 0. */
const KEYS: ReadonlyArray<string | 'back' | null> = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  null,
  '0',
  'back',
];

export function PinPad({ onComplete, resetKey, disabled = false, error = false }: Props) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  const { t } = useTranslation('common');
  const [entered, setEntered] = useState('');
  // Nothing pressed since the pad was last cleared: only then can a refused entry still stand.
  const [untouched, setUntouched] = useState(true);
  // iOS has no live regions: the dots' progress says itself (lib/announce.ts).
  useAnnounce(entered.length > 0 ? t('a11y.pin_progress', { count: entered.length }) : null, {
    key: entered.length,
  });

  useEffect(() => {
    setEntered('');
    setUntouched(true);
  }, [resetKey]);

  function press(key: string) {
    if (disabled) return;
    haptic.select();
    setUntouched(false);
    if (key === 'back') {
      setEntered((p) => p.slice(0, -1));
      return;
    }
    if (entered.length >= PIN.length) return;
    const next = entered + key;
    setEntered(next);
    if (next.length === PIN.length) {
      // Defer the callback so the 4th dot paints first.
      setTimeout(() => onComplete(next), PIN.completeDelay);
    }
  }

  // The entry that was not taken: all four, in the danger colour, until she starts again.
  const refused = error && untouched;

  return (
    <View style={{ alignItems: 'center', gap: PIN.gap }}>
      <View
        accessible
        // How far she is, as one thing with a name and a value — a bare label on a box is
        // not allowed ARIA (axe: aria-prohibited-attr, issue #73).
        accessibilityRole="progressbar"
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('a11y.pin_progress', { count: entered.length })}
        accessibilityValue={{ min: 0, max: PIN.length, now: entered.length }}
        testID="pin-dots"
        style={{ flexDirection: 'row', gap: PIN.dotGap }}
      >
        {Array.from({ length: PIN.length }, (_, i) => {
          const filled = refused || i < entered.length;
          return (
            <View
              key={i}
              testID={refused ? 'pin-dot-refused' : filled ? 'pin-dot-filled' : 'pin-dot-empty'}
              style={{
                width: PIN.dot,
                height: PIN.dot,
                borderRadius: circle(PIN.dot),
                backgroundColor: filled
                  ? refused
                    ? palette.danger
                    : palette.primary
                  : 'transparent',
                borderWidth: filled ? 0 : PIN.dotEdge,
                borderColor: palette.hairlineStrong,
              }}
            />
          );
        })}
      </View>
      <View
        style={{
          width: PIN_PAD_WIDTH,
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: PIN.columnGap,
          rowGap: PIN.rowGap,
        }}
      >
        {KEYS.map((key, i) =>
          // The empty place in the grid is a gap, not a button without a name
          // (axe: button-name, issue #73).
          key === null ? (
            <View key={`gap-${i}`} style={PIN.key} />
          ) : (
            <Pressable
              key={key}
              onPress={() => press(key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={key === 'back' ? t('a11y.pin_delete') : key}
              accessibilityState={{ disabled }}
              style={{ opacity: disabled ? UI.disabledOpacity : 1 }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    ...PIN.key,
                    borderRadius: RADIUS.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: key === 'back' ? 'transparent' : palette.canvas,
                    ...pressedStyle(pressed, reduced),
                  }}
                >
                  {key === 'back' ? (
                    <Icon name="delete" size={PIN.deleteIcon} color={palette.ink} />
                  ) : (
                    // Fixed key boxes: the digit grows with the system text only this far (M-84).
                    <Text
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                      style={[pinDigit(), { color: palette.ink }]}
                    >
                      {key}
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}
