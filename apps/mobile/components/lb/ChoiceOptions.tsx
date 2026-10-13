// Pure shared choices. The caller owns its sheet, translated labels and persistence.
import { Text, View } from 'react-native';
import { UI } from '../../lib/theme/components.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn, MAX_FONT_SCALE } from './Btn.js';
import { Icon } from './Icon.js';
import { Tile } from './Tile.js';

export function ChoiceOptions<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  size = 'md',
  chosenAs = 'picked',
  unselectedVariant = 'quiet',
  showCheck = true,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /**
   * How the chosen row is drawn: the board's picked piece (`components/lb/Tile.tsx`, the one
   * look of "chosen now"), or the primary button where the list stands for a form's field.
   */
  chosenAs?: 'picked' | 'primary';
  unselectedVariant?: 'quiet' | 'secondary';
  showCheck?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: SPACE.sm }}>
      {options.map((option) => {
        const chosen = option.value === value;
        const onPress = () => onChange(option.value);
        if (chosen && chosenAs === 'picked')
          return (
            <Tile
              key={option.value}
              shape="row"
              state="picked"
              tall={size === 'md'}
              selected
              disabled={disabled}
              onPress={onPress}
              label={(color) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: SPACE.sm,
                  }}
                >
                  {showCheck ? <Icon name="check" size={UI.button.icon} color={color} /> : null}
                  <Text
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    // As a button of that size sets its label (Btn): sm stays on its line.
                    {...(size === 'sm'
                      ? {
                          numberOfLines: 1,
                          adjustsFontSizeToFit: true,
                          minimumFontScale: UI.minimumFontScale,
                        }
                      : { numberOfLines: UI.button.maxLines })}
                    style={[TYPE.action, { flexShrink: 1, color, textAlign: 'center' }]}
                  >
                    {option.label}
                  </Text>
                </View>
              )}
            >
              {option.label}
            </Tile>
          );
        return (
          <Btn
            key={option.value}
            variant={chosen ? 'primary' : unselectedVariant}
            icon={showCheck && chosen ? 'check' : undefined}
            size={size}
            full
            selected={chosen}
            disabled={disabled}
            onPress={onPress}
          >
            {option.label}
          </Btn>
        );
      })}
    </View>
  );
}
