// The app's language, chosen with one tap on a big flag — the very first thing
// on the welcome screen (owner decision 2026-09-28: "fette Fahnen, direkt als
// erstes"). Selection ring + check state, never colour alone; the flag is big,
// the touch target ≥ 52 pt. Background sits on the inner View (RN rule).

import type { AppLocale } from '@learnbuddy/shared-types/contracts';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LANGUAGES } from '../../lib/i18n/languages.js';
import { circle } from '../../lib/theme/radius.js';
import { RHYTHM } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export function LanguageFlags({
  value,
  onChange,
  compact = false,
}: {
  value: AppLocale;
  onChange: (locale: AppLocale) => void;
  /** Small phones (360×740): the row must not push the under-16 card off. */
  compact?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const d = compact ? 44 : 52;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('a11y.language')}
      style={{ flexDirection: 'row', justifyContent: 'center', gap: RHYTHM.parts }}
    >
      {LANGUAGES.map((l) => {
        const on = l.value === value;
        return (
          <Pressable
            key={l.value}
            onPress={() => onChange(l.value)}
            accessibilityRole="radio"
            accessibilityLabel={l.label}
            accessibilityState={{ selected: on, checked: on }}
            // The web needs the attribute itself (axe: aria-required-attr, issue #73).
            aria-checked={on}
          >
            {({ pressed }) => (
              <View
                style={{
                  width: d,
                  height: d,
                  borderRadius: circle(d),
                  backgroundColor: on ? palette.primaryLt : palette.paper,
                  borderWidth: on ? 2.5 : 1,
                  borderColor: on ? palette.primary : palette.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.94 : on ? 1.06 : 1 }],
                }}
              >
                {/* The flag is a picture, not text: it stays inside its fixed circle at any
                    system text size — the language's name is what a screen reader speaks
                    (audit M-84, issue #73). */}
                <Text
                  allowFontScaling={false}
                  // token-exempt: the flag's picture size in its 44 or 52 pt circle
                  style={{ fontSize: compact ? 22 : 26, lineHeight: compact ? 30 : 34 }}
                >
                  {l.flag}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
