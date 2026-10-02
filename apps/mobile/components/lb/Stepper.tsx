// A value she sets one step at a time: [−] value [+]. The accessible way to give what a figure
// otherwise takes as a tap (issues #248, #249): a screen reader cannot aim at a grid point,
// a finger with a tremor may not want to.
//
// Two ways in, one value: the − and + buttons (44 pt each, named "x kleiner" / "x größer"),
// and the value itself as an adjustable element — a screen reader's swipe up and down moves it
// (`accessibilityActions` increment / decrement), and it reads the value in words.

import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';

type Props = {
  /** What is set ("x", "Stunde"). */
  label: string;
  /** The value as she reads it ("−1,5", "3"). */
  value: string;
  onLess: () => void;
  onMore: () => void;
  /** At the end of the range: that button waits. */
  canLess: boolean;
  canMore: boolean;
  lessLabel: string;
  moreLabel: string;
  /**
   * Where the value stands among its steps (0 … count − 1). A slider must say it (the web's
   * `aria-valuenow`, -min, -max); the words are in `value`.
   */
  position: { now: number; count: number };
  disabled?: boolean;
};

export function Stepper({
  label,
  value,
  onLess,
  onMore,
  canLess,
  canMore,
  lessLabel,
  moreLabel,
  position,
  disabled = false,
}: Props) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
      <Text style={[TYPE.body, { color: palette.ink2, flex: 1 }]}>{label}</Text>
      <Btn
        size="sm"
        variant="outline"
        pill
        disabled={disabled || !canLess}
        onPress={onLess}
        accessibilityLabel={lessLabel}
      >
        −
      </Btn>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        // aria-value*: React Native maps them to the native value, the web needs them as is.
        aria-valuetext={value}
        aria-valuenow={position.now}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, position.count - 1)}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (disabled) return;
          if (e.nativeEvent.actionName === 'increment' && canMore) onMore();
          if (e.nativeEvent.actionName === 'decrement' && canLess) onLess();
        }}
        style={{ minWidth: 64, alignItems: 'center' }}
      >
        <Text
          style={[
            TYPE.body,
            { color: palette.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
          ]}
        >
          {value}
        </Text>
      </View>
      <Btn
        size="sm"
        variant="outline"
        pill
        disabled={disabled || !canMore}
        onPress={onMore}
        accessibilityLabel={moreLabel}
      >
        +
      </Btn>
    </View>
  );
}
