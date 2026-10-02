// The clock she sets (issue #254: „Stell die Uhr auf 7:45" — Zeiger antippen und drehen in
// 5-Minuten-Schritten). One gesture: she chooses a hand (Stunden / Minuten) and taps a number on
// the dial; the hand turns there.
//
// ─────────────── Twelve buttons, not one surface ───────────────
//
// Each number on the dial is a real button with a name („Minutenzeiger auf die 9"), not a
// surface whose touch point decides the angle. The note line learned why (StaffAnswer.tsx):
// `locationX` does not mean the same thing on every way this app runs, and a surface whose
// meaning hangs on the touch point cannot be used with a screen reader. Twelve buttons are the
// same everywhere and testable everywhere.
//
// **The minute hand** goes to the number she taps: the 9 is 45 minutes — the 5-minute steps of
// the issue. **The hour hand** moves on with the minutes, as on every real clock, so it never
// points exactly at a number once the minutes are not 0. A tap therefore puts it where it lies
// CLOSEST to the number she touched: at 45 minutes, tapping the 8 gives 7:45 (the short hand just
// before the 8) and tapping the 7 gives 6:45 (just before the 7). That is the reading this
// exercise teaches, and the drawing shows at once where the hand landed — no digital time is
// shown next to it, because matching digits would take the reading away.
//
// The buttons are 40 pt across, under the 44 of CLAUDE.md, and knowingly: the twelve numbers of a
// 210-pt dial stand 38 pt apart, and a larger dial does not fit a 360×740 phone with the question
// above it (rule 16). A button is centred on its number, carries its name, and a wrong tap costs
// nothing — the next tap turns the hand again ("rückgängig statt bestätigen", UX-PRINCIPLES).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Segmented } from '../lb/Segmented.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { ClockFace } from '../math/VisualFigures.js';

/** The smallest dial (a 360×740 phone); the screen passes more where there is room. */
export const CLOCK_SIZE = 210;
const HIT = 40;

type Hand = 'hour' | 'minute';

/** "7:45" → the time it says; anything else → null (nothing set yet). */
export function clockOf(text: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** The time as the answer travels: "7:45". */
export function clockText(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/**
 * Where a tap on number `n` (1–12) puts the chosen hand. The minute hand: on the number. The
 * hour hand: the hour whose hand, at these minutes, lies closest to the number.
 */
export function setHand(
  now: { hour: number; minute: number },
  hand: Hand,
  n: number,
): { hour: number; minute: number } {
  if (hand === 'minute') return { hour: now.hour, minute: (n % 12) * 5 };
  const h = Math.round(n - now.minute / 60);
  return { hour: ((h + 11) % 12) + 1, minute: now.minute };
}

type Props = {
  /** The dial's size: larger on a taller phone, so there is no empty band above it. */
  size?: number;
  /** What she has set so far ("7:45"), or '' before her first tap. */
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
};

export function ClockAnswer({ size = CLOCK_SIZE, value, disabled, onChange }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const [hand, setHandChoice] = useState<Hand>('hour');
  const now = clockOf(value) ?? { hour: 12, minute: 0 };
  const r = size / 2 - 3;
  return (
    <View style={{ alignItems: 'center', gap: SPACE.sm }}>
      {/* How it works, until she has done it once: then the room goes to Buddy's reply. */}
      {value === '' ? (
        <Text style={[TYPE.small, { color: palette.ink2, alignSelf: 'stretch' }]}>
          {t('clock.how')}
        </Text>
      ) : null}
      {/* No role on the dial itself: its twelve numbers are the controls, each with its name
          (a slider role around buttons is nested interaction, and axe is right to refuse it). */}
      <View style={{ width: size, height: size }}>
        <View pointerEvents="none" style={{ position: 'absolute' }}>
          <ClockFace hour={now.hour} minute={now.minute} size={size} chosen={hand} />
        </View>
        {Array.from({ length: 12 }, (_, i) => {
          const n = i + 1;
          const angle = (n / 12) * 2 * Math.PI;
          const cx = size / 2 + r * 0.7 * Math.sin(angle);
          const cy = size / 2 - r * 0.7 * Math.cos(angle);
          return (
            // A number on the dial is a piece of the drawing she turns, not a CTA — like a part
            // of the fraction bar; "Prüfen" below is the CTA (rule 13). Its pressed tint sits
            // on the inner View, never on the Pressable.
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={t(hand === 'hour' ? 'clock.to_hour' : 'clock.to_minute', { n })}
              disabled={disabled}
              onPress={() => {
                const next = setHand(now, hand, n);
                onChange(clockText(next.hour, next.minute));
              }}
              style={{
                position: 'absolute',
                left: cx - HIT / 2,
                top: cy - HIT / 2,
                width: HIT,
                height: HIT,
              }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    flex: 1,
                    borderRadius: HIT / 2,
                    backgroundColor: pressed ? palette.lavender : 'transparent',
                    opacity: 0.6,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
      <Segmented<Hand>
        size="sm"
        value={hand}
        onChange={setHandChoice}
        options={[
          { value: 'hour', label: t('clock.hour') },
          { value: 'minute', label: t('clock.minute') },
        ]}
      />
    </View>
  );
}
