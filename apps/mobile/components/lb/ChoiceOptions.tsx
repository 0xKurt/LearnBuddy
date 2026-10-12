// Pure shared choices. The caller owns its sheet, translated labels and persistence.
import { View } from 'react-native';
import { SPACE } from '../../lib/theme/space.js';
import { Btn } from './Btn.js';

export function ChoiceOptions<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  size = 'md',
  selectedVariant = 'picked',
  unselectedVariant = 'quiet',
  showCheck = true,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  selectedVariant?: 'picked' | 'primary';
  unselectedVariant?: 'quiet' | 'outline';
  showCheck?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: SPACE.sm }}>
      {options.map((option) => (
        <Btn
          key={option.value}
          variant={option.value === value ? selectedVariant : unselectedVariant}
          icon={showCheck && option.value === value ? 'check' : undefined}
          size={size}
          full
          selected={option.value === value}
          disabled={disabled}
          onPress={() => onChange(option.value)}
        >
          {option.label}
        </Btn>
      ))}
    </View>
  );
}
