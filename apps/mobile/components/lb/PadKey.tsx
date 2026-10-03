// One key of a number pad (issue #243, the Kopfrechnen round): a paper key on a soft shadow that
// takes the accent tint while it is held, its sign centred. Above the 44 pt floor — these are hit
// dozens of times a minute. Built here because a raw Pressable belongs in components/lb (CLAUDE.md
// Regel 13, Engineering-Regel 2) and neither <Btn> nor <CircleBtn> is a grid key.

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
};

export function PadKey({
  sign,
  accessibilityLabel,
  onPress,
  disabled = false,
  quiet = false,
  span = 1,
}: Props) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ flex: span }}
    >
      {({ pressed }) => (
        <View
          style={{
            height: TOUCH + SPACE.sm,
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
