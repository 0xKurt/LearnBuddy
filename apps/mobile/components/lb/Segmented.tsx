// An exclusive choice on one canvas track; each segment keeps its own accessible target (#548).
import { Pressable, Text, View } from 'react-native';
import { UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, CONTROL } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACE.xs,
        paddingHorizontal: SPACE.xs,
        borderRadius: RADIUS.round,
        backgroundColor: palette.canvas,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            style={{
              flex: 1,
              minWidth: CONTROL.sm,
              minHeight: CONTROL.sm,
              justifyContent: 'center',
            }}
          >
            {({ pressed }) => (
              <View
                style={{
                  minHeight: UI.segmented.visible,
                  justifyContent: 'center',
                  paddingHorizontal: SPACE.sm,
                  paddingVertical: SPACE.xs,
                  borderRadius: RADIUS.round,
                  backgroundColor: selected ? palette.paper : 'transparent',
                  ...(selected ? SHADOW.soft : {}),
                  opacity: pressed ? UI.pressedOpacity : 1,
                }}
              >
                <Text
                  maxFontSizeMultiplier={UI.fontScale}
                  style={[
                    TYPE.metaStrong,
                    { textAlign: 'center', color: selected ? palette.ink : palette.ink2 },
                  ]}
                >
                  {o.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
