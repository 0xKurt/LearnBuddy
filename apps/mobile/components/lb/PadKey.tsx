// One key of a number pad (issue #243, the Kopfrechnen round): a paper key on a soft shadow that
// takes the accent tint while it is held, its sign centred. Above the 44 pt floor — these are hit
// dozens of times a minute. Built here because a raw Pressable belongs in components/lb (CLAUDE.md
// Regel 13, Engineering-Regel 2) and neither <Btn> nor <CircleBtn> is a grid key.
//
// The same key, large, is the pad she taps a heard rhythm on (issue #445, `RhythmTaps`): `fill`
// gives it the height of the room it stands in, and `instant` makes it answer when the finger
// LANDS — a beat is the moment she hits, not the moment she lets go.

import { Pressable, Text, View } from 'react-native';

import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from './Btn.js';

type Props = {
  /** What stands on the key ("7", "⌫", "/"). */
  sign: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** A quieter key (delete): the secondary ink, one step smaller. */
  quiet?: boolean;
  /** Its share of the row (the 0 may take two). */
  span?: number;
  /**
   * Answers on touch-down instead of on release: a beat she taps (issue #445). A screen reader's
   * double tap has no touch-down; it reaches the key as its `activate` action.
   */
  instant?: boolean;
  /** Takes the height of the room it stands in instead of a key's height (the rhythm pad). */
  fill?: boolean;
};

const ACTIVATE = [{ name: 'activate' }];

/**
 * No wait before `onPressIn`: react-native-web holds it back 50 ms (its `delayPressIn`), or until
 * the finger lifts if that comes first — a quick tap would then be timed at its release. React
 * Native calls the same delay `unstable_pressDelay` (0 by default). A beat is the moment she hits.
 */
const AT_ONCE = { delayPressIn: 0, unstable_pressDelay: 0 };

export function PadKey({
  sign,
  accessibilityLabel,
  onPress,
  disabled = false,
  quiet = false,
  span = 1,
  instant = false,
  fill = false,
}: Props) {
  const { palette } = useTheme();
  return (
    <Pressable
      {...(instant ? AT_ONCE : {})}
      onPress={instant ? undefined : onPress}
      onPressIn={instant ? onPress : undefined}
      accessibilityActions={instant ? ACTIVATE : undefined}
      onAccessibilityAction={instant ? onPress : undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ flex: span }}
    >
      {({ pressed }) => (
        <View
          style={{
            ...(fill ? { flex: 1 } : { height: TOUCH + SPACE.sm }),
            borderRadius: SPACE.lg,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? palette.primaryLt : palette.paper,
            ...SHADOW.soft,
          }}
        >
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[
              quiet ? TYPE.prompt : TYPE.displaySm,
              { fontWeight: '500', color: quiet ? palette.ink2 : palette.ink },
            ]}
          >
            {sign}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
