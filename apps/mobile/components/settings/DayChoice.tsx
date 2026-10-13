// The seven days of the week as tiles (ui_kits/app/Flows.jsx `Times`): a lit tile is a day on
// which Buddy may write. Each is its own 44 pt target with the day's full name for a screen
// reader; the tile shows the short one.

import { Text, View } from 'react-native';

import { UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SETTINGS } from '../../lib/theme/settings.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatWeekday, localeTag } from '../../lib/time.js';
import { PressArea } from '../lb/PressArea.js';

/** ISO weekdays, Monday first. */
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** ISO weekday d is 2024-01-0d (1 January 2024 was a Monday). */
const dateOf = (day: number) => `2024-01-0${day}`;

function shortName(day: number, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, 0, day)))
    .replace(/\.$/, '');
}

type Props = {
  /** The days that are on. */
  value: readonly number[];
  onToggle: (day: number) => void;
  label: string;
  locale: string;
  disabled?: boolean;
};

export function DayChoice({ value, onToggle, label, locale, disabled = false }: Props) {
  const { palette } = useTheme();
  const { height, inset, bleed } = SETTINGS.day;
  return (
    <View
      role="group"
      aria-label={label}
      style={{
        flexDirection: 'row',
        marginHorizontal: -bleed,
        opacity: disabled ? UI.busyOpacity : 1,
      }}
    >
      {DAYS.map((day) => {
        const on = value.includes(day);
        return (
          <PressArea
            key={day}
            onPress={() => onToggle(day)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={formatWeekday(dateOf(day), locale)}
            accessibilityState={{ checked: on, disabled }}
            aria-checked={on}
            style={{ flex: 1, height }}
          >
            {(pressed) => (
              <View
                style={{
                  flex: 1,
                  marginHorizontal: inset,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: RADIUS.sm,
                  borderWidth: on ? UI.selectedBorder : UI.border,
                  borderColor: on ? palette.primary : palette.hairlineStrong,
                  backgroundColor: on ? palette.primaryLt : palette.paper,
                  opacity: pressed ? UI.pressedOpacity : 1,
                }}
              >
                <Text
                  maxFontSizeMultiplier={UI.fontScale}
                  style={[TYPE.metaStrong, { color: palette.ink }]}
                >
                  {shortName(day, locale)}
                </Text>
              </View>
            )}
          </PressArea>
        );
      })}
    </View>
  );
}
